/**
 * Minimal static file server for production deployment (e.g. Render).
 * Serves the Vite-built app from ./dist and falls back to index.html
 * for client-side routing.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
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
// the Matches page polls directly).
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
// Groq Compound integration — replaces TheSportsDB entirely.
//
// Instead of stitching together several sparse/free-tier sports APIs, we ask
// Groq's "compound" system (an agentic model with a built-in, server-side
// web_search tool) to act as a football performance analyst: search the web
// for Egypt's real World Cup 2026 results, lineups, and stats, and hand back
// one big strict-JSON dataset.
//
// That dataset is fetched ONCE (first deploy, or whenever the cheap
// freshness check below detects Egypt has played a new match) and stored on
// disk. Every visitor after that is served the stored copy — nobody's
// request ever triggers a live Groq call directly.
//
// Requires GROQ_API_KEY (from https://console.groq.com) to be set as an
// environment variable. Optionally override GROQ_MODEL (defaults to
// "groq/compound").
//
// NOTE: this used to call xAI's Grok — same idea (an LLM with web search),
// different vendor. Groq (the inference company) and Grok/xAI (Elon Musk's
// model) are unrelated products despite the similar names; the env var is
// now GROQ_API_KEY, not XAI_API_KEY.
// ---------------------------------------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'groq/compound';
const GROQ_BASE = 'https://api.groq.com/openai/v1';

// Egypt's official 26-man World Cup 2026 squad + shirt numbers, confirmed
// against FIFA's published squad list. Kept in sync with SQUAD in
// src/App.tsx. Given to the model as ground truth so it doesn't have to
// guess (or invent) who's actually in the squad.
const SQUAD_ROSTER = [
  { number: '1', name: 'Mohamed El Shenawy', position: 'GK' },
  { number: '2', name: 'Yasser Ibrahim', position: 'DEF' },
  { number: '3', name: 'Mohamed Hany', position: 'DEF' },
  { number: '4', name: 'Hossam Abdelmaguid', position: 'DEF' },
  { number: '5', name: 'Ramy Rabia', position: 'DEF' },
  { number: '6', name: 'Mohamed Abdelmonem', position: 'DEF' },
  { number: '7', name: 'Mahmoud Hassan Trezeguet', position: 'FWD' },
  { number: '8', name: 'Emam Ashour', position: 'MID' },
  { number: '9', name: 'Hamza Abdelkarim', position: 'FWD' },
  { number: '10', name: 'Mohamed Salah', position: 'FWD' },
  { number: '11', name: 'Mostafa Ziko', position: 'MID' },
  { number: '12', name: 'Haitham Hassan', position: 'FWD' },
  { number: '13', name: 'Ahmed Fatouh', position: 'DEF' },
  { number: '14', name: 'Hamdy Fathy', position: 'MID' },
  { number: '15', name: 'Karim Hafez', position: 'DEF' },
  { number: '16', name: 'El Mahdy Soliman', position: 'GK' },
  { number: '17', name: 'Mohanad Lasheen', position: 'MID' },
  { number: '18', name: 'Nabil Emad', position: 'MID' },
  { number: '19', name: 'Marwan Attia', position: 'MID' },
  { number: '20', name: 'Ibrahim Adel', position: 'FWD' },
  { number: '21', name: 'Mahmoud Saber', position: 'MID' },
  { number: '22', name: 'Omar Marmoush', position: 'FWD' },
  { number: '23', name: 'Mostafa Shobeir', position: 'GK' },
  { number: '24', name: 'Tarek Alaa', position: 'DEF' },
  { number: '25', name: 'Ahmed Sayed Zizo', position: 'FWD' },
  { number: '26', name: 'Mohamed Alaa', position: 'GK' },
];
const COACH_NAME = 'Hossam Hassan';

// Confirmed results, given to the model as anchors it must not contradict —
// it only needs to search for the details (lineups, cards, exact minutes)
// underneath these already-known scorelines. Extend this list as Egypt
// advances further in the tournament (Round of 16 and beyond).
const EGYPT_FIXTURES_SEED = [
  { date: '2026-06-15', opponent: 'Belgium', venue: 'Lumen Field, Seattle', round: 'Group Stage', scoreEgypt: 1, scoreOpponent: 1 },
  { date: '2026-06-21', opponent: 'New Zealand', venue: 'BC Place, Vancouver', round: 'Group Stage', scoreEgypt: 3, scoreOpponent: 1 },
  { date: '2026-06-26', opponent: 'Iran', venue: 'Seattle Stadium', round: 'Group Stage', scoreEgypt: 1, scoreOpponent: 1 },
  { date: '2026-07-03', opponent: 'Australia', venue: 'Dallas Stadium', round: 'Round of 32', scoreEgypt: 1, scoreOpponent: 1, note: 'Egypt won 4-2 on penalties after extra time' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Groq's free/on-demand tier has a per-minute token budget (TPM) shared
// across every request. Our analyst prompt is large and groq/compound makes
// several internal web-search calls on top of it, so brushing up against
// that limit is expected/normal, not a real failure — the API tells us
// exactly how many seconds to wait ("Please try again in 1.34s"). We parse
// that and retry automatically instead of surfacing a one-off 429 to users.
async function callGroqOnce(promptText, opts) {
  const resp = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    signal: AbortSignal.timeout(90_000), // web search + reasoning can take a while, but not forever
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            opts.system ||
            'You are a meticulous football performance analyst. You search the web for verified, up-to-date information and reply with STRICT JSON ONLY — no markdown formatting, no code fences, no commentary before or after the JSON.',
        },
        { role: 'user', content: promptText },
      ],
      compound_custom: { tools: { enabled_tools: ['web_search'] } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const err = new Error(`Groq API error ${resp.status}: ${errText.slice(0, 500)}`);
    err.status = resp.status;
    err.body = errText;
    throw err;
  }

  const payload = await resp.json();
  const raw = (payload.choices?.[0]?.message?.content || '').trim();
  if (!raw) throw new Error('Empty response from Groq.');
  return raw;
}

// Calls Groq's Compound system (OpenAI-compatible chat completions, with its
// built-in server-side web_search tool restricted on) and returns its raw
// text output. Retries automatically on 429 (rate limit) — but only when the
// suggested wait is short and there's real budget left in maxAttempts. Big,
// expensive prompts (the full analyst call) should pass a LOW maxAttempts:
// blindly retrying a huge prompt 5x when the daily token quota itself is
// exhausted just burns more of what's left for no benefit.
async function callGrok(promptText, opts = {}) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured on the server.');

  const maxAttempts = opts.maxAttempts ?? 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callGroqOnce(promptText, opts);
    } catch (err) {
      lastErr = err;
      if (err.status !== 429 || attempt === maxAttempts) throw err;

      // Pull the server-suggested wait time out of the error body
      // (e.g. "Please try again in 1.344s"); fall back to a short
      // exponential backoff if it isn't present.
      const match = /try again in ([\d.]+)s/i.exec(err.body || '');
      const suggestedMs = match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
      // If Groq wants us to wait more than 10s (a daily-quota exhaustion,
      // not a brief per-minute limit), retrying inside this same HTTP
      // request is pointless — it'll just time out anyway. Fail fast so
      // the caller can cache the failure and stop hammering the API.
      if (suggestedMs != null && suggestedMs > 10_000) throw err;
      const waitMs = (suggestedMs ?? attempt * 1500) + 250; // small buffer
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

// Groq occasionally wraps JSON in ```json fences or adds a stray sentence
// before/after it — this strips both.
function extractJson(raw) {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// TARGETED fetching. Instead of one giant "analyze the whole squad + every
// match" prompt, we ask Groq only for whatever the visitor actually opened:
// - clicking a player  -> one small prompt about THAT player only
// - opening a match     -> one small prompt about THAT match only
// - coach stats         -> one small prompt for the coach's record
// Each result is cached forever (per player / per match / coach), so a given
// player or match only ever costs ONE real Groq call, no matter how many
// times it's viewed afterwards. This is far cheaper and far less likely to
// hit rate limits than the old "everything at once" approach.
// ---------------------------------------------------------------------------

function buildPlayerPrompt(rosterPlayer) {
  return `You are a football performance analyst. I need real, verified stats for ONE Egypt national team player at the 2026 FIFA World Cup — nothing else.

Player: #${rosterPlayer.number} ${rosterPlayer.name} (${rosterPlayer.position})

CONFIRMED Egypt results so far (already verified — do not contradict them, only find this player's involvement in each):
${EGYPT_FIXTURES_SEED.map((m) => `${m.date} — Egypt vs ${m.opponent} at ${m.venue} (${m.round}): Egypt ${m.scoreEgypt}-${m.scoreOpponent} ${m.opponent}${m.note ? ' — ' + m.note : ''}`).join('\n')}

Search the web (official FIFA match reports, ESPN, other reliable football sources) to find, for THIS PLAYER ONLY, in EACH match above:
- Did he play? Did he start or come on as a substitute? What minute did he come on/off?
- Goals, assists, yellow cards, red cards in that match.

Then give tournament-wide totals for this player: appearances, starts, total minutes, goals, assists, yellow cards, red cards, and clean sheets (matches he started that Egypt won without conceding).

Rules:
- Use only real, verifiable information. If the player did not play in a match, mark played=false and all numbers 0 for that match.
- Include exactly one entry in "matches" per confirmed fixture above, same order.
- Respond with STRICT JSON ONLY — no markdown, no commentary — exactly matching this schema:

{
  "tournament": { "appearances": <int>, "starts": <int>, "minutes": <int>, "goals": <int>, "assists": <int>, "yellowCards": <int>, "redCards": <int>, "cleanSheets": <int> },
  "matches": [
    { "date": "2026-06-15", "opponent": "Belgium", "venue": "Lumen Field, Seattle", "scoreEgypt": 1, "scoreOpponent": 1, "played": true, "started": true, "minutes": 90, "goals": 0, "assists": 0, "yellowCards": 0, "redCards": 0, "subOnMinute": null, "subOffMinute": null, "subOffFor": null, "subOnFor": null }
  ]
}`;
}

function buildMatchPrompt(fixture) {
  return `You are a football performance analyst. I need the real, verified match report for ONE specific Egypt national team match at the 2026 FIFA World Cup — nothing else.

CONFIRMED result (already verified — do not contradict it, only find the details underneath it):
${fixture.date} — Egypt vs ${fixture.opponent} at ${fixture.venue} (${fixture.round}): Egypt ${fixture.scoreEgypt}-${fixture.scoreOpponent} ${fixture.opponent}${fixture.note ? ' — ' + fixture.note : ''}

CONFIRMED Egypt squad (number — name — position). Use these exact numbers and names for any Egypt player you mention, do not invent or renumber:
${SQUAD_ROSTER.map((p) => `${p.number} — ${p.name} — ${p.position}`).join('\n')}

Search the web (official FIFA match report, ESPN, other reliable football sources) to find:
- Egypt's starting XI (11 players from the squad list above, with each one's position that match)
- Egypt's substitutes who came on, and the minute they came on
- The starting formation (e.g. "4-2-3-1")
- Whether Egypt played at home for this fixture (true/false — for a World Cup match this is normally false unless stated otherwise)
- The full timeline of goals (scorer + assist if any + minute), cards (player + yellow/red + minute), and substitutions (player off + player on + minute) for BOTH teams
- Team stats if available: possession %, shots, shots on target, corners, fouls (Egypt vs opponent)

Rules:
- Use only real, verifiable information found via search. If a specific detail can't be verified, give your best-sourced estimate — never invent implausible stats.
- Respond with STRICT JSON ONLY — no markdown, no code fences, no commentary — exactly matching this schema:

{
  "egyptIsHome": false, "status": "Match Finished", "formation": "4-2-3-1",
  "startXI": [ { "number": "23", "name": "Mostafa Shobeir", "position": "GK" } ],
  "substitutes": [ { "number": "9", "name": "Hamza Abdelkarim", "position": "FWD", "cameOn": true, "cameOnMinute": 70 } ],
  "timeline": [
    { "minute": 34, "type": "goal", "team": "egypt", "player": "Mohamed Salah", "assistPlayer": "Omar Marmoush" },
    { "minute": 58, "type": "card", "team": "opponent", "player": "Some Player", "detail": "Yellow Card" },
    { "minute": 70, "type": "substitution", "team": "egypt", "playerOff": "Mahmoud Hassan Trezeguet", "playerOn": "Hamza Abdelkarim" }
  ],
  "teamStats": [ { "type": "Possession", "egypt": 42, "opponent": 58 }, { "type": "Shots", "egypt": 8, "opponent": 14 } ]
}`;
}

function buildCoachPrompt() {
  return `You are a football performance analyst. I need the real, verified tournament record for ONE person only — the Egypt national team's head coach, ${COACH_NAME} — at the 2026 FIFA World Cup.

CONFIRMED Egypt results so far (already verified — do not contradict them):
${EGYPT_FIXTURES_SEED.map((m) => `${m.date} — Egypt vs ${m.opponent} at ${m.venue} (${m.round}): Egypt ${m.scoreEgypt}-${m.scoreOpponent} ${m.opponent}${m.note ? ' — ' + m.note : ''}`).join('\n')}

Give ${COACH_NAME}'s record across these matches: matches played, wins, draws, losses, goals for, goals against, clean sheets.

Respond with STRICT JSON ONLY — no markdown, no commentary — exactly matching this schema:
{ "name": "${COACH_NAME}", "matchesPlayed": <int>, "wins": <int>, "draws": <int>, "losses": <int>, "goalsFor": <int>, "goalsAgainst": <int>, "cleanSheets": <int> }`;
}

// Buckets a free-text position (e.g. "Right Wing", "Centre-Back") into one
// of the four pitch rows for the formation grid.
function classifyPosition(raw) {
  const p = String(raw || '').toLowerCase();
  if (p.includes('goalkeeper') || p === 'gk') return 'GK';
  if (p.includes('back') || p.includes('defender') || p.includes('sweeper') || p === 'def') return 'DEF';
  if (p.includes('forward') || p.includes('striker') || p === 'fwd' || (p.includes('wing') && !p.includes('back'))) return 'FWD';
  if (p.includes('midfield') || p === 'mid') return 'MID';
  return 'MID';
}

const POSITION_ROW = { GK: 1, DEF: 2, MID: 3, FWD: 4 };

// Builds the pitch grid + a synthesized formation string from bucketed
// positions, so the pitch view is never empty even if Grok's reported
// formation string doesn't cleanly match the squad size.
function buildFormationGrid(startXI) {
  const withBucket = startXI.map((p) => ({ ...p, bucket: classifyPosition(p.pos) }));
  const counts = { DEF: 0, MID: 0, FWD: 0 };
  withBucket.forEach((p) => {
    if (p.bucket !== 'GK') counts[p.bucket] += 1;
  });
  const formation = counts.DEF || counts.MID || counts.FWD ? `${counts.DEF}-${counts.MID}-${counts.FWD}` : null;
  const grid = withBucket.map((p) => ({ ...p, grid: `${POSITION_ROW[p.bucket]}:1` }));
  return { startXI: grid, formation };
}

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

// Groq is told to reuse the exact canonical roster name everywhere, but in
// practice its free-text "timeline" entries sometimes shorten or respell a
// name (e.g. "Salah" instead of "Mohamed Salah", or a transliteration
// variant). Exact string equality then silently drops that goal/assist/card
// from the player's stats. We compare on the normalized surname instead —
// the most stable, distinguishing part of a name — so small variations
// don't cause a real event to go uncounted.
const normalizeNameStr = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
const lastWord = (s) => {
  const parts = normalizeNameStr(s).split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || '';
};
function namesMatch(candidate, target) {
  if (!candidate || !target) return false;
  const c = normalizeNameStr(candidate);
  const t = normalizeNameStr(target);
  if (c === t) return true;
  const cLast = lastWord(candidate);
  const tLast = lastWord(target);
  if (cLast && tLast && cLast === tLast) return true;
  // one name fully contains the other (handles "Salah" vs "Mohamed Salah")
  return (c.length > 2 && t.includes(c)) || (t.length > 2 && c.includes(t));
}

// ---------------------------------------------------------------------------
// Persistent, disk-backed cache — survives restarts (but not Render
// free-plan redeploys/cold starts unless a persistent Disk is attached).
// Every player and every match gets its OWN cache entry (permanent, until
// explicitly refreshed via the debug endpoints below), so viewing one
// player/match never triggers work for any other.
// ---------------------------------------------------------------------------
const CACHE_FILE = path.join(__dirname, 'data', 'sports-cache.json');

function loadCacheFile() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveCacheFile(store) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store));
  } catch (err) {
    console.error('Failed to persist cache to disk:', err);
  }
}

const diskStore = loadCacheFile();

function makeCache(section, defaultTtlMs) {
  diskStore[section] = diskStore[section] || {};
  const map = diskStore[section];
  return {
    get(key) {
      const hit = map[key];
      if (!hit) return undefined;
      if (hit.ttlMs === null) return hit.data;
      if (Date.now() - hit.at < hit.ttlMs) return hit.data;
      return undefined;
    },
    set(key, data, ttlMs = defaultTtlMs) {
      map[key] = { data, at: Date.now(), ttlMs };
      saveCacheFile(diskStore);
    },
    delete(key) {
      delete map[key];
      saveCacheFile(diskStore);
    },
  };
}

// 'player:<number>', 'match:<date>', and 'coach' entries live here,
// permanently, once successfully generated. 'failed:<key>' entries are a
// short-lived cooldown marker (see withSingleFlight below) so a burst of
// clicks right after a failure doesn't each re-trigger a new Groq call.
const grokCache = makeCache('grok', null);

// Generic per-key guard: (1) de-dupes concurrent requests for the SAME
// player/match so opening one player's stats twice quickly only fires one
// Groq call, and (2) after a failure, serves the cached error for a couple
// of minutes instead of immediately retrying — this combination is what
// actually prevents a handful of clicks from turning into hundreds of API
// calls.
const inFlightByKey = new Map();
async function withSingleFlight(key, fn) {
  if (inFlightByKey.has(key)) return inFlightByKey.get(key);

  const failKey = `failed:${key}`;
  const recentFailure = grokCache.get(failKey);
  if (recentFailure !== undefined) throw new Error(recentFailure.message);

  const promise = (async () => {
    try {
      return await fn();
    } catch (err) {
      grokCache.set(failKey, { message: String(err) }, 2 * 60 * 1000);
      throw err;
    }
  })();

  inFlightByKey.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightByKey.delete(key);
  }
}

// Looks up a player by shirt number (preferred, exact) or by name
// (last-word fuzzy match, for backwards-compatible callers).
function findRosterPlayer(number, name) {
  if (number) {
    const hit = SQUAD_ROSTER.find((p) => String(p.number) === String(number));
    if (hit) return hit;
  }
  if (name) {
    return SQUAD_ROSTER.find((p) => namesMatch(p.name, name)) || null;
  }
  return null;
}

// Fetches (and permanently caches) tournament + per-match stats for ONE
// player. Only ever costs a Groq call the FIRST time that specific player
// is opened.
async function getPlayerData(rosterPlayer) {
  const key = `player:${rosterPlayer.number}`;
  const cached = grokCache.get(key);
  if (cached !== undefined) return cached;

  return withSingleFlight(key, async () => {
    const raw = await callGrok(buildPlayerPrompt(rosterPlayer), { maxAttempts: 1 });
    const parsed = extractJson(raw);
    if (!parsed || !parsed.tournament || !Array.isArray(parsed.matches)) {
      throw new Error('Groq response did not match the expected player schema.');
    }
    grokCache.set(key, parsed, null);
    return parsed;
  });
}

// Fetches (and permanently caches) the full lineup/timeline/team-stats
// report for ONE match. Only ever costs a Groq call the FIRST time that
// specific match is opened.
async function getMatchData(fixture) {
  const key = `match:${fixture.date}`;
  const cached = grokCache.get(key);
  if (cached !== undefined) return cached;

  return withSingleFlight(key, async () => {
    const raw = await callGrok(buildMatchPrompt(fixture), { maxAttempts: 1 });
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray(parsed.startXI)) {
      throw new Error('Groq response did not match the expected match schema.');
    }
    grokCache.set(key, parsed, null);
    return parsed;
  });
}

async function getCoachData() {
  const key = 'coach';
  const cached = grokCache.get(key);
  if (cached !== undefined) return cached;

  return withSingleFlight(key, async () => {
    const raw = await callGrok(buildCoachPrompt(), { maxAttempts: 1 });
    const parsed = extractJson(raw);
    if (!parsed || !parsed.name) {
      throw new Error('Groq response did not match the expected coach schema.');
    }
    grokCache.set(key, parsed, null);
    return parsed;
  });
}

// Finds the confirmed fixture (ground-truth date/opponent/score) matching
// the frontend's query — matches are always one of the manually-curated
// EGYPT_FIXTURES_SEED entries, never invented by Groq.
function findFixture(date, opponent) {
  if (date) {
    const exact = EGYPT_FIXTURES_SEED.find((m) => m.date === date);
    if (exact) return exact;
  }
  if (opponent) {
    const opp = opponent.toLowerCase();
    return (
      EGYPT_FIXTURES_SEED.find(
        (m) => m.opponent.toLowerCase().includes(opp) || opp.includes(m.opponent.toLowerCase())
      ) || null
    );
  }
  return null;
}

// Converts Groq's per-match JSON into the same bundle shape the frontend's
// match page has always consumed (pitch grid, substitutes, team stats,
// timeline) — so nothing downstream needs to change.
function buildBundleFromMatch(fixture, m) {
  if (!fixture) return { available: false, error: 'Unknown match.' };
  if (!m) return { available: false, error: 'Match data not available yet.' };

  const startersRaw = (m.startXI || []).map((p) => ({ idPlayer: p.number || slugify(p.name), name: p.name, number: p.number || null, pos: p.position }));
  const { startXI, formation } = buildFormationGrid(startersRaw);

  const substitutes = (m.substitutes || []).map((p) => ({
    idPlayer: p.number || slugify(p.name),
    name: p.name,
    number: p.number || null,
    pos: p.position,
    cameOn: !!p.cameOn,
    cameOnMinute: p.cameOnMinute ?? null,
  }));

  const idFor = (name) => {
    const hit = [...startersRaw, ...substitutes].find((p) => namesMatch(p.name, name));
    return hit ? hit.idPlayer : slugify(name);
  };

  const timeline = (m.timeline || [])
    .map((t) => {
      const isEgypt = t.team === 'egypt';
      if (t.type === 'substitution') {
        return {
          minute: t.minute || 0,
          type: 'subst',
          detail: null,
          playerId: t.playerOff ? idFor(t.playerOff) : null,
          playerName: t.playerOff || null,
          assistId: t.playerOn ? idFor(t.playerOn) : null,
          assistName: t.playerOn || null,
          teamName: isEgypt ? 'Egypt' : fixture.opponent,
          isEgypt,
        };
      }
      return {
        minute: t.minute || 0,
        type: t.type === 'goal' ? 'goal' : 'card',
        detail: t.detail || null,
        playerId: t.player ? idFor(t.player) : null,
        playerName: t.player || null,
        assistId: t.assistPlayer ? idFor(t.assistPlayer) : null,
        assistName: t.assistPlayer || null,
        teamName: isEgypt ? 'Egypt' : fixture.opponent,
        isEgypt,
      };
    })
    .sort((a, b) => a.minute - b.minute);

  return {
    available: true,
    date: fixture.date,
    opponentName: fixture.opponent,
    egyptIsHome: !!m.egyptIsHome,
    venue: fixture.venue || null,
    status: m.status || 'Match Finished',
    score: { egypt: fixture.scoreEgypt ?? null, opponent: fixture.scoreOpponent ?? null },
    formation: m.formation || formation,
    startXI,
    substitutes,
    teamStats: m.teamStats || [],
    timeline,
  };
}

// GET /api/match-full?date=&opponent= — everything the full match page
// needs in one call: pitch lineup, substitutes, team stats, and timeline.
// Only fetches (and only ever costs a Groq call for) the ONE match asked
// for.
app.get('/api/match-full', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const opponent = String(req.query.opponent || '').trim();
  const fixture = findFixture(date, opponent);
  if (!fixture) return res.json({ available: false, error: 'Unknown match.' });
  try {
    const m = await getMatchData(fixture);
    res.json(buildBundleFromMatch(fixture, m));
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// Kept for backwards compatibility with any cached client bundle.
app.get('/api/match-lineup', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const opponent = String(req.query.opponent || '').trim();
  const fixture = findFixture(date, opponent);
  if (!fixture) return res.json({ available: false, error: 'Unknown match.' });
  try {
    const m = await getMatchData(fixture);
    res.json(buildBundleFromMatch(fixture, m));
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/player-tournament-stats?number=10 — ONE player's tournament-wide
// totals. Only fetches (and only ever costs a Groq call for) that player.
app.get('/api/player-tournament-stats', async (req, res) => {
  const number = String(req.query.number || '').trim();
  const name = String(req.query.name || '').trim();
  if (!number && !name) return res.status(400).json({ available: false, error: 'Missing number or name' });

  const rosterPlayer = findRosterPlayer(number, name);
  if (!rosterPlayer) {
    return res.json({ available: false, error: number ? `No player with squad number ${number}.` : 'Player not found.' });
  }

  try {
    const data = await getPlayerData(rosterPlayer);
    res.json({ available: true, number: rosterPlayer.number, name: rosterPlayer.name, position: rosterPlayer.position, ...data.tournament });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/player-match-stats?number=10 — one row per finished Egypt match
// (started/subbed, minutes, goals, assists, cards) for ONE player. Shares
// the same cached per-player data as /api/player-tournament-stats — opening
// a player's stats panel only ever triggers ONE Groq call total for both.
app.get('/api/player-match-stats', async (req, res) => {
  const number = String(req.query.number || '').trim();
  const name = String(req.query.name || '').trim();
  if (!number && !name) return res.status(400).json({ available: false, error: 'Missing number or name' });

  const rosterPlayer = findRosterPlayer(number, name);
  if (!rosterPlayer) {
    return res.json({ available: false, error: number ? `No player with squad number ${number}.` : 'Player not found.' });
  }

  try {
    const data = await getPlayerData(rosterPlayer);
    res.json({ available: true, number: rosterPlayer.number, name: rosterPlayer.name, matches: data.matches });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/coach-stats — head coach's tournament-wide record.
app.get('/api/coach-stats', async (req, res) => {
  try {
    const coach = await getCoachData();
    res.json({ available: true, ...coach });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/debug/grok-status — see what's currently cached (which players,
// which matches, coach) without triggering any new Groq calls.
app.get('/api/debug/grok-status', (req, res) => {
  const section = diskStore.grok || {};
  const cachedPlayers = Object.keys(section)
    .filter((k) => k.startsWith('player:'))
    .map((k) => k.slice('player:'.length));
  const cachedMatches = Object.keys(section)
    .filter((k) => k.startsWith('match:'))
    .map((k) => k.slice('match:'.length));
  const failedKeys = Object.keys(section).filter((k) => k.startsWith('failed:'));
  res.json({
    groqKeyConfigured: !!GROQ_API_KEY,
    model: GROQ_MODEL,
    cachedPlayerNumbers: cachedPlayers,
    cachedMatchDates: cachedMatches,
    coachCached: !!section.coach,
    recentFailures: failedKeys,
  });
});

// GET /api/debug/grok-raw?type=player&number=10
// GET /api/debug/grok-raw?type=match&date=2026-06-15
// GET /api/debug/grok-raw?type=coach
// Triggers (or reads the cached) raw Groq result for exactly ONE thing —
// never the whole squad — so debugging never itself burns a big chunk of
// quota.
app.get('/api/debug/grok-raw', async (req, res) => {
  const type = String(req.query.type || '').trim();
  try {
    if (type === 'player') {
      const rosterPlayer = findRosterPlayer(String(req.query.number || ''), String(req.query.name || ''));
      if (!rosterPlayer) return res.status(400).json({ error: 'Unknown player number/name.' });
      return res.json(await getPlayerData(rosterPlayer));
    }
    if (type === 'match') {
      const fixture = findFixture(String(req.query.date || ''), String(req.query.opponent || ''));
      if (!fixture) return res.status(400).json({ error: 'Unknown match date/opponent.' });
      return res.json(await getMatchData(fixture));
    }
    if (type === 'coach') return res.json(await getCoachData());
    res.status(400).json({ error: "Pass ?type=player&number=.. or ?type=match&date=.. or ?type=coach" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/debug/grok-refresh?type=player&number=10
// GET /api/debug/grok-refresh?type=match&date=2026-06-15
// GET /api/debug/grok-refresh?type=coach
// Clears the cache (and any failure cooldown) for exactly ONE thing and
// re-fetches it right now.
app.get('/api/debug/grok-refresh', async (req, res) => {
  const type = String(req.query.type || '').trim();
  try {
    if (type === 'player') {
      const rosterPlayer = findRosterPlayer(String(req.query.number || ''), String(req.query.name || ''));
      if (!rosterPlayer) return res.status(400).json({ error: 'Unknown player number/name.' });
      const key = `player:${rosterPlayer.number}`;
      grokCache.delete(key);
      grokCache.delete(`failed:${key}`);
      return res.json({ ok: true, data: await getPlayerData(rosterPlayer) });
    }
    if (type === 'match') {
      const fixture = findFixture(String(req.query.date || ''), String(req.query.opponent || ''));
      if (!fixture) return res.status(400).json({ error: 'Unknown match date/opponent.' });
      const key = `match:${fixture.date}`;
      grokCache.delete(key);
      grokCache.delete(`failed:${key}`);
      return res.json({ ok: true, data: await getMatchData(fixture) });
    }
    if (type === 'coach') {
      grokCache.delete('coach');
      grokCache.delete('failed:coach');
      return res.json({ ok: true, data: await getCoachData() });
    }
    res.status(400).json({ error: "Pass ?type=player&number=.. or ?type=match&date=.. or ?type=coach" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
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
