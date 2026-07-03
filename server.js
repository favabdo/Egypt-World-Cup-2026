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

// Proxies football-data.org so the API key never reaches the browser.
// Returns Egypt's most relevant World Cup match: live if one is in
// progress, otherwise the next scheduled one, otherwise the most recent
// finished one.
app.get('/api/egypt-match', async (req, res) => {
  if (!FOOTBALL_DATA_API_KEY) {
    return res.status(500).json({ error: 'FOOTBALL_DATA_API_KEY is not configured on the server.' });
  }

  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return res.json(cache.data);
  }

  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({ error: 'football-data.org request failed', detail: body });
    }

    const payload = await response.json();
    const matches = Array.isArray(payload.matches) ? payload.matches : [];

    const isEgypt = (team) =>
      !!team && (team.name === 'Egypt' || team.shortName === 'Egypt' || team.tla === 'EGY');

    const egyptMatches = matches.filter((m) => isEgypt(m.homeTeam) || isEgypt(m.awayTeam));

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
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach football-data.org', detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// API-FOOTBALL integration (v3.football.api-sports.io)
// Powers per-player stats (minutes, touches, goals, assists, chances
// created, defensive actions) and per-match lineups/statistics.
// Requires API_FOOTBALL_KEY in .env — get a free key at
// https://dashboard.api-football.com/register (100 req/day free tier).
// Everything degrades gracefully (available: false) if the key is missing
// or the upstream call fails, so the UI can show a friendly empty state.
// ---------------------------------------------------------------------------
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

async function apiFootball(endpoint, params) {
  const url = new URL(`${API_FOOTBALL_BASE}${endpoint}`);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const r = await fetch(url, { headers: { 'x-apisports-key': API_FOOTBALL_KEY } });
  if (!r.ok) throw new Error(`API-FOOTBALL ${r.status}`);
  const json = await r.json();
  return Array.isArray(json.response) ? json.response : [];
}

// Egypt's numeric team id rarely needs re-resolving, so we cache it once
// for the lifetime of the process instead of hardcoding a guessed id.
let egyptTeamId = null;
async function resolveEgyptTeamId() {
  if (egyptTeamId) return egyptTeamId;
  const teams = await apiFootball('/teams', { name: 'Egypt' });
  const match = teams.find((t) => t.team?.name === 'Egypt' && t.team?.national) || teams[0];
  if (!match) throw new Error('Could not resolve Egypt team id');
  egyptTeamId = match.team.id;
  return egyptTeamId;
}

const playerStatsCache = new Map(); // name -> { data, fetchedAt }
const PLAYER_CACHE_TTL_MS = 10 * 60 * 1000;

app.get('/api/player-stats', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ available: false, error: 'Missing name' });

  if (!API_FOOTBALL_KEY) {
    return res.json({ available: false, error: 'API_FOOTBALL_KEY is not configured on the server.' });
  }

  const cached = playerStatsCache.get(name);
  if (cached && Date.now() - cached.fetchedAt < PLAYER_CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const teamId = await resolveEgyptTeamId();
    // Search by the last "word" of the name — API-FOOTBALL's search matches
    // substrings, and our local squad names are usually surnames anyway.
    const searchTerm = name.split(/\s+/).slice(-1)[0];
    const currentYear = new Date().getFullYear();
    let players = await apiFootball('/players', { search: searchTerm, team: teamId, season: currentYear });
    if (players.length === 0) {
      players = await apiFootball('/players', { search: searchTerm, team: teamId, season: currentYear - 1 });
    }

    if (players.length === 0) {
      const empty = { available: false, error: 'Player not found' };
      playerStatsCache.set(name, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }

    const player = players[0];
    const stats = Array.isArray(player.statistics) ? player.statistics : [];

    const sum = (fn) => stats.reduce((acc, s) => acc + (Number(fn(s)) || 0), 0);

    const minutes = sum((s) => s.games?.minutes);
    const appearances = sum((s) => s.games?.appearences);
    const goals = sum((s) => s.goals?.total);
    const assists = sum((s) => s.goals?.assists);
    const chancesCreated = sum((s) => s.passes?.key);
    const defensiveActions =
      sum((s) => s.tackles?.total) + sum((s) => s.tackles?.interceptions) + sum((s) => s.tackles?.blocks);
    // API-FOOTBALL has no direct "touches" metric — this is a reasonable
    // proxy built from passes + duels + dribble attempts.
    const touches = sum((s) => s.passes?.total) + sum((s) => s.duels?.total) + sum((s) => s.dribbles?.attempts);

    const data = {
      available: true,
      name: player.player?.name || name,
      photo: player.player?.photo || null,
      minutes,
      appearances,
      touches,
      goals,
      assists,
      chancesCreated,
      defensiveActions,
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
    return res.json({ available: false, error: 'API_FOOTBALL_KEY is not configured on the server.' });
  }

  const cacheKey = `${date}|${opponent}`;
  const cached = lineupCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LINEUP_CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const teamId = await resolveEgyptTeamId();
    const fixtures = await apiFootball('/fixtures', { team: teamId, date });
    if (fixtures.length === 0) {
      const empty = { available: false, error: 'Fixture not found for that date' };
      lineupCache.set(cacheKey, { data: empty, fetchedAt: Date.now() });
      return res.json(empty);
    }
    const fixture = fixtures[0];
    const fixtureId = fixture.fixture.id;

    const [lineups, statistics] = await Promise.all([
      apiFootball('/fixtures/lineups', { fixture: fixtureId }),
      apiFootball('/fixtures/statistics', { fixture: fixtureId }),
    ]);

    const egyptSide = lineups.find((l) => l.team?.id === teamId);
    const opponentSide = lineups.find((l) => l.team?.id !== teamId);

    const subEvents = Array.isArray(fixture.events)
      ? fixture.events.filter((e) => e.type === 'subst' && e.team?.id === teamId)
      : [];
    const subbedInNames = new Set(subEvents.map((e) => e.assist?.name).filter(Boolean));

    const data = {
      available: true,
      formation: egyptSide?.formation || null,
      opponentFormation: opponentSide?.formation || null,
      opponentName: opponentSide?.team?.name || opponent,
      status: fixture.fixture?.status?.short || null,
      elapsed: fixture.fixture?.status?.elapsed || null,
      startXI: (egyptSide?.startXI || []).map((p) => ({
        name: p.player?.name,
        number: p.player?.number,
        pos: p.player?.pos,
        grid: p.player?.grid,
      })),
      substitutes: (egyptSide?.substitutes || []).map((p) => ({
        name: p.player?.name,
        number: p.player?.number,
        pos: p.player?.pos,
        cameOn: subbedInNames.has(p.player?.name),
      })),
      coach: egyptSide?.coach?.name || null,
      statistics: (statistics.find((s) => s.team?.id === teamId)?.statistics || []).map((s, i) => ({
        type: s.type,
        egypt: s.value,
        opponent: statistics.find((st) => st.team?.id !== teamId)?.statistics?.[i]?.value ?? null,
      })),
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
