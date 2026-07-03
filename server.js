/**
 * Minimal static file server for production deployment (e.g. Render).
 * Serves the Vite-built app from ./dist and falls back to index.html
 * for client-side routing.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

// Tiny in-memory cache so many simultaneous visitors don't blow through
// football-data.org's free-tier limit of 10 requests/minute.
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 20_000;

const isEgyptTeam = (team) =>
  !!team && (team.name === 'Egypt' || team.shortName === 'Egypt' || team.tla === 'EGY');

// Talks to football-data.org and returns Egypt's most relevant World Cup
// match: live if one is in progress, otherwise the next scheduled one,
// otherwise the most recent finished one. Shared by /api/egypt-match (which
// the Matches page polls directly) and by /api/player-stats below (which
// needs *a* date to know which match's stats to pull from iSportsAPI).
async function fetchEgyptMatchMeta() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  if (!FOOTBALL_DATA_API_KEY) return null;

  const response = await fetch(`${FOOTBALL_DATA_BASE}/competitions/WC/matches`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
  });
  if (!response.ok) throw new Error(`football-data.org request failed: ${response.status}`);

  const payload = await response.json();
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const egyptMatches = matches.filter((m) => isEgyptTeam(m.homeTeam) || isEgyptTeam(m.awayTeam));

  const live = egyptMatches.find((m) => m.status === 'LIVE' || m.status === 'IN_PLAY' || m.status === 'PAUSED');
  const scheduled = egyptMatches
    .filter((m) => m.status === 'SCHEDULED' || m.status === 'TIMED')
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())[0];
  const finished = egyptMatches
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())[0];

  const match = live || scheduled || finished || null;

  const result = match
    ? {
        status: match.status,
        stage: match.stage || null,
        group: match.group || null,
        utcDate: match.utcDate,
        minute: match.minute ?? null,
        homeTeam: match.homeTeam?.name ?? null,
        awayTeam: match.awayTeam?.name ?? null,
        homeCrest: match.homeTeam?.crest ?? null,
        awayCrest: match.awayTeam?.crest ?? null,
        homeScore: match.score?.fullTime?.home ?? null,
        awayScore: match.score?.fullTime?.away ?? null,
      }
    : null;

  cache = { data: result, fetchedAt: now };
  return result;
}

// Proxies football-data.org so the API key never reaches the browser.
app.get('/api/egypt-match', async (req, res) => {
  if (!FOOTBALL_DATA_API_KEY) {
    return res.status(500).json({ error: 'FOOTBALL_DATA_API_KEY is not configured on the server.' });
  }
  try {
    const result = await fetchEgyptMatchMeta();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach football-data.org', detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// iSportsAPI integration (api.isportsapi.com)
// Powers per-player match stats (minutes, touches, goals, assists, chances
// created, defensive actions) and per-match lineups/formations.
//
// Kept the env var name API_FOOTBALL_KEY (per request) even though it now
// holds an iSportsAPI key, so no Render config changes were needed beyond
// swapping the value.
//
// Everything degrades gracefully (available: false) if the key is missing
// or the upstream call fails, so the UI can show a friendly empty state.
//
// Docs referenced:
//   - Auth: http://api.isportsapi.com/<path>?api_key=KEY&...  (mirror: api2.isportsapi.com)
//   - Schedule & Results (Basic): /sport/football/schedule/basic?date=YYYY-MM-DD
//       -> [{ matchId, homeId, homeName, awayId, awayName, status, ... }]
//   - Lineups: /sport/football/lineups?matchId=ID
//       -> [{ matchId, homeFormation, awayFormation, homeLineup:[{playerId,name,number,position}], awayLineup, homeBackup, awayBackup }]
//   - Player Stats (Match): /sport/football/playerstats/match?matchId=ID
//       -> [{ playerId, teamId, name, playingTime, touches, goals, assist, keyPass, tackles, interception, clearances, firstTeam, ... }]
// ---------------------------------------------------------------------------
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY; // holds the iSportsAPI key
const ISPORTS_HOSTS = ['http://api.isportsapi.com', 'http://api2.isportsapi.com'];

async function isportsApi(path, params) {
  const qs = new URLSearchParams({ api_key: API_FOOTBALL_KEY, ...(params || {}) }).toString();

  let networkErr;
  for (const host of ISPORTS_HOSTS) {
    let json;
    try {
      const r = await fetch(`${host}${path}?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      json = await r.json();
    } catch (err) {
      networkErr = err; // try the mirror host before giving up
      continue;
    }

    // iSportsAPI returns { code, message, data }. code !== 0 means the
    // request itself was rejected (bad key, no active plan, quota, etc.) —
    // that's an account issue, not a network blip, so surface it loudly
    // instead of silently retrying the mirror host.
    if (json.code !== 0) {
      console.error(`iSportsAPI error on ${path}:`, JSON.stringify(json));
      throw new Error(`iSportsAPI rejected the request: ${json.message || JSON.stringify(json)}`);
    }

    return Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
  }
  throw networkErr || new Error(`iSportsAPI request to ${path} failed on both hosts`);
}

// Finds Egypt's match on a given date (optionally narrowed by opponent name)
// straight from the Schedule & Results endpoint, which already returns
// homeId/awayId — no separate "resolve team id" call needed.
async function findEgyptMatch({ date, opponent }) {
  const matches = await isportsApi('/sport/football/schedule/basic', { date });
  const candidates = matches.filter((m) => isEgyptTeam({ name: m.homeName }) || isEgyptTeam({ name: m.awayName }));

  if (opponent) {
    const opp = opponent.trim().toLowerCase();
    const narrowed = candidates.filter(
      (m) => (m.homeName || '').toLowerCase().includes(opp) || (m.awayName || '').toLowerCase().includes(opp)
    );
    if (narrowed.length) return narrowed[0];
  }
  return candidates[0] || null;
}

// Best-effort visual layout: iSportsAPI's lineup endpoint doesn't return
// grid coordinates like API-FOOTBALL did, only a formation string (e.g.
// "4-3-3"). We rebuild row:col coordinates assuming the squad array is
// ordered GK -> DEF -> MID -> FWD, which is the common convention but isn't
// guaranteed for every match. If the formation string doesn't parse cleanly
// or its total doesn't match the squad size, we skip the synthesis and the
// pitch simply renders without positions (same graceful fallback as when
// API-FOOTBALL had no grid data).
function synthesizeGrid(startXI, formation) {
  const lines = String(formation || '')
    .split('-')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!Array.isArray(startXI) || startXI.length === 0 || lines.length === 0) {
    return (startXI || []).map((p) => ({ ...p, grid: null }));
  }
  const expected = 1 + lines.reduce((a, b) => a + b, 0);
  if (expected !== startXI.length) {
    return startXI.map((p) => ({ ...p, grid: null }));
  }

  const out = [];
  let i = 0;
  out.push({ ...startXI[i], grid: '1:1' });
  i += 1;
  lines.forEach((count, lineIdx) => {
    for (let col = 1; col <= count; col += 1) {
      out.push({ ...startXI[i], grid: `${lineIdx + 2}:${col}` });
      i += 1;
    }
  });
  return out;
}

const playerStatsCache = new Map(); // name -> { data, fetchedAt }
const PLAYER_CACHE_TTL_MS = 10 * 60 * 1000;

app.get('/api/player-stats', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ available: false, error: 'Missing name' });

  if (!API_FOOTBALL_KEY) {
    return res.json({ available: false, error: 'API_FOOTBALL_KEY (iSportsAPI key) is not configured on the server.' });
  }

  const cached = playerStatsCache.get(name);
  if (cached && Date.now() - cached.fetchedAt < PLAYER_CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    // We show stats from Egypt's most relevant match (live/most recent) —
    // there's no simple "career totals" endpoint on this plan, and for a
    // World Cup squad page that's the most meaningful single match anyway.
    const meta = await fetchEgyptMatchMeta();
    if (!meta || !meta.utcDate) {
      const empty = { available: false, error: 'No Egypt match found to pull stats from.' };
      playerStatsCache.set(name, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }

    const isoDate = meta.utcDate.slice(0, 10);
    const match = await findEgyptMatch({ date: isoDate });
    if (!match) {
      const empty = { available: false, error: 'Could not locate the match on iSportsAPI for that date.' };
      playerStatsCache.set(name, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }

    const egyptTeamId = isEgyptTeam({ name: match.homeName }) ? match.homeId : match.awayId;
    const stats = await isportsApi('/sport/football/playerstats/match', { matchId: match.matchId });
    const egyptStats = stats.filter((s) => String(s.teamId) === String(egyptTeamId));

    // Match by surname, same approach as before — local squad names are
    // usually surnames, and iSportsAPI doesn't offer a name-search param.
    const searchTerm = name.split(/\s+/).slice(-1)[0].toLowerCase();
    const player =
      egyptStats.find((p) => (p.name || '').toLowerCase().includes(searchTerm)) ||
      egyptStats.find((p) => searchTerm.includes((p.name || '').toLowerCase().split(/\s+/).slice(-1)[0]));

    if (!player) {
      const empty = { available: false, error: 'Player not found in this match\'s stats.' };
      playerStatsCache.set(name, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }

    const data = {
      available: true,
      name: player.name || name,
      minutes: Number(player.playingTime) || 0,
      touches: Number(player.touches) || 0,
      goals: Number(player.goals) || 0,
      assists: Number(player.assist) || 0,
      chancesCreated: Number(player.keyPass) || 0,
      defensiveActions:
        (Number(player.tackles) || 0) + (Number(player.interception) || 0) + (Number(player.clearances) || 0),
    };

    playerStatsCache.set(name, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

const lineupCache = new Map(); // `${date}|${opponent}` -> { data, fetchedAt }
const LINEUP_CACHE_TTL_MS = 30 * 1000;

app.get('/api/match-lineup', async (req, res) => {
  const date = String(req.query.date || '').trim(); // YYYY-MM-DD
  const opponent = String(req.query.opponent || '').trim();
  if (!date) return res.status(400).json({ available: false, error: 'Missing date' });

  if (!API_FOOTBALL_KEY) {
    return res.json({ available: false, error: 'API_FOOTBALL_KEY (iSportsAPI key) is not configured on the server.' });
  }

  const cacheKey = `${date}|${opponent}`;
  const cached = lineupCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LINEUP_CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const match = await findEgyptMatch({ date, opponent });
    if (!match) {
      const empty = { available: false, error: 'Fixture not found for that date' };
      lineupCache.set(cacheKey, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }

    const egyptIsHome = isEgyptTeam({ name: match.homeName });
    const egyptTeamId = egyptIsHome ? match.homeId : match.awayId;

    const lineupRows = await isportsApi('/sport/football/lineups', { matchId: match.matchId });
    const lineup = lineupRows[0];
    if (!lineup) {
      const empty = { available: false, error: 'Lineup not published yet for this match' };
      lineupCache.set(cacheKey, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }

    const egyptFormation = egyptIsHome ? lineup.homeFormation : lineup.awayFormation;
    const rawXI = (egyptIsHome ? lineup.homeLineup : lineup.awayLineup) || [];
    const rawSubs = (egyptIsHome ? lineup.homeBackup : lineup.awayBackup) || [];

    // Cross-reference match player stats (if available) to know who was
    // actually subbed on, same UX as before. Optional — lineup still
    // renders fine without it.
    let subbedInIds = new Set();
    try {
      const stats = await isportsApi('/sport/football/playerstats/match', { matchId: match.matchId });
      stats
        .filter((s) => String(s.teamId) === String(egyptTeamId) && !s.firstTeam && Number(s.playingTime) > 0)
        .forEach((s) => subbedInIds.add(String(s.playerId)));
    } catch (_) {
      /* stats optional */
    }

    const startXIBase = rawXI.map((p) => ({ name: p.name, number: p.number, pos: p.position || null }));
    const startXI = synthesizeGrid(startXIBase, egyptFormation);

    const data = {
      available: true,
      formation: egyptFormation || null,
      opponentName: egyptIsHome ? match.awayName : match.homeName,
      status: match.status,
      startXI,
      substitutes: rawSubs.map((p) => ({
        name: p.name,
        number: p.number,
        pos: p.position || null,
        cameOn: subbedInIds.has(String(p.playerId)),
      })),
      // Not exposed by this iSportsAPI plan's lineup endpoint — the UI
      // hides these sections gracefully when absent.
      coach: null,
      statistics: [],
    };

    lineupCache.set(cacheKey, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

app.use(express.static(DIST_DIR));

// SPA fallback: any unmatched route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
