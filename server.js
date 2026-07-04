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
// text output. Retries automatically on 429 (token-per-minute rate limit).
async function callGrok(promptText, opts = {}) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured on the server.');

  const MAX_ATTEMPTS = 5;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callGroqOnce(promptText, opts);
    } catch (err) {
      lastErr = err;
      if (err.status !== 429 || attempt === MAX_ATTEMPTS) throw err;

      // Pull the server-suggested wait time out of the error body
      // (e.g. "Please try again in 1.344s"); fall back to a short
      // exponential backoff if it isn't present.
      const match = /try again in ([\d.]+)s/i.exec(err.body || '');
      const suggestedMs = match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
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

function buildAnalystPrompt() {
  return `You are a professional football performance analyst building a stats dashboard for the Egypt national football team at the 2026 FIFA World Cup.

CONFIRMED squad (number — name — position). Use these exact numbers and names, do not invent, drop, or renumber players:
${SQUAD_ROSTER.map((p) => `${p.number} — ${p.name} — ${p.position}`).join('\n')}
Head coach: ${COACH_NAME}

CONFIRMED match results so far — these scorelines are already verified, do not contradict them, only search for the details underneath them:
${EGYPT_FIXTURES_SEED.map((m) => `${m.date} — Egypt vs ${m.opponent} at ${m.venue} (${m.round}): Egypt ${m.scoreEgypt}-${m.scoreOpponent} ${m.opponent}${m.note ? ' — ' + m.note : ''}`).join('\n')}

Search the web (official FIFA match reports, ESPN, other reliable football sources) to find, for EACH match above:
- Egypt's starting XI (11 players from the squad list above, with each one's position that match)
- Substitutes who came on, and the minute they came on
- The starting formation (e.g. "4-2-3-1")
- The full timeline of goals (scorer + assist if any + minute), cards (player + yellow/red + minute), and substitutions (player off + player on + minute) for BOTH teams
- Team stats if available: possession %, shots, shots on target, corners, fouls (Egypt vs opponent)

Then aggregate, across all of Egypt's finished matches so far:
- For every squad player listed above: appearances, starts, total minutes played, goals, assists, yellow cards, red cards, and clean sheets (matches they started that Egypt won 0 against)
- For the head coach: matches played, wins, draws, losses, goals for, goals against, clean sheets

Rules:
- Use only real, verifiable information found via search. If a specific detail (an exact assist, an exact minute) can't be verified, give your best-sourced estimate — never invent implausible stats.
- Players who haven't appeared in a match yet must have every stat at 0.
- Include one entry in "matches" for every confirmed fixture listed above, in the same order, plus any newer Egypt match that has since finished which isn't listed above.
- Respond with STRICT JSON ONLY — no markdown, no code fences, no commentary — exactly matching this schema:

{
  "asOfMatchesFinished": <integer, total Egypt matches finished so far>,
  "generatedNote": "<one short sentence on data recency>",
  "coach": { "name": "${COACH_NAME}", "matchesPlayed": <int>, "wins": <int>, "draws": <int>, "losses": <int>, "goalsFor": <int>, "goalsAgainst": <int>, "cleanSheets": <int> },
  "players": [
    { "number": "10", "name": "Mohamed Salah", "position": "FWD", "appearances": <int>, "starts": <int>, "minutes": <int>, "goals": <int>, "assists": <int>, "yellowCards": <int>, "redCards": <int>, "cleanSheets": <int> }
  ],
  "matches": [
    {
      "date": "2026-06-15", "opponent": "Belgium", "venue": "Lumen Field, Seattle", "egyptIsHome": false,
      "status": "Match Finished", "scoreEgypt": 1, "scoreOpponent": 1, "formation": "4-2-3-1",
      "startXI": [ { "number": "23", "name": "Mostafa Shobeir", "position": "GK" } ],
      "substitutes": [ { "number": "9", "name": "Hamza Abdelkarim", "position": "FWD", "cameOn": true, "cameOnMinute": 70 } ],
      "timeline": [
        { "minute": 34, "type": "goal", "team": "egypt", "player": "Mohamed Salah", "assistPlayer": "Omar Marmoush" },
        { "minute": 58, "type": "card", "team": "opponent", "player": "Some Player", "detail": "Yellow Card" },
        { "minute": 70, "type": "substitution", "team": "egypt", "playerOff": "Mahmoud Hassan Trezeguet", "playerOn": "Hamza Abdelkarim" }
      ],
      "teamStats": [ { "type": "Possession", "egypt": 42, "opponent": 58 }, { "type": "Shots", "egypt": 8, "opponent": 14 } ]
    }
  ]
}`;
}

function buildFreshnessCheckPrompt() {
  return 'Search the web. As of today, how many official FIFA World Cup 2026 matches has the Egypt national football team played and fully completed (including one that finished earlier today, if any)? Reply with ONLY a single integer and nothing else.';
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

// ---------------------------------------------------------------------------
// Persistent, disk-backed cache — see notes above `makeCache` for how this
// survives restarts (but not Render free-plan redeploys unless a persistent
// Disk is attached).
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

// Everything Grok produces lives under this one cache section: 'dataset' is
// the big permanent blob (players + coach + matches), 'freshness-check' is
// a short-lived marker (default TTL below) that gates how often we bother
// asking Grok "has Egypt played a new match yet?".
const grokCache = makeCache('grok', 3 * 60 * 60 * 1000);

// Guards against duplicate concurrent Groq calls: if several visitors (or
// several player-stat clicks) hit the server before the first dataset
// generation finishes, they all share this ONE in-flight request instead of
// each firing their own full 26-player analyst call. That "thundering herd"
// of parallel calls is what burns through Groq's daily token budget fastest.
let inFlightGeneration = null;

async function generateFullDataset() {
  if (inFlightGeneration) return inFlightGeneration;

  inFlightGeneration = (async () => {
    const raw = await callGrok(buildAnalystPrompt());
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      throw new Error('Grok response did not match the expected schema (missing players/matches arrays).');
    }
    const record = {
      generatedAt: new Date().toISOString(),
      matchesFinished: Number.isFinite(parsed.asOfMatchesFinished) ? parsed.asOfMatchesFinished : EGYPT_FIXTURES_SEED.length,
      data: parsed,
    };
    grokCache.set('dataset', record, null); // permanent until a freshness check invalidates it
    return record;
  })();

  try {
    return await inFlightGeneration;
  } finally {
    inFlightGeneration = null;
  }
}

// At most once per freshness-check TTL, ask Grok (cheaply — no full
// re-analysis) whether Egypt has finished a new match since the stored
// dataset was generated. This is the ONLY thing that can trigger a
// re-fetch; ordinary page views never do.
async function checkFreshness(currentRecord) {
  const lastCheck = grokCache.get('freshness-check');
  if (lastCheck !== undefined) return currentRecord; // checked recently — trust the stored data

  try {
    const raw = await callGrok(buildFreshnessCheckPrompt(), {
      system: 'You are a precise research assistant. Reply with only the requested integer, nothing else — no words, no punctuation.',
    });
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    grokCache.set('freshness-check', { checkedAt: Date.now() }); // uses the section default TTL
    if (Number.isFinite(n) && n !== currentRecord.matchesFinished) {
      return await generateFullDataset();
    }
  } catch (_) {
    // If the check itself fails, keep serving the existing stored dataset
    // rather than breaking the page over a transient network hiccup.
  }
  return currentRecord;
}

async function getDataset() {
  const existing = grokCache.get('dataset');
  if (existing === undefined) return generateFullDataset();
  return checkFreshness(existing);
}

function findMatch(dataset, date, opponent) {
  const matches = dataset.data.matches || [];
  if (date) {
    const exact = matches.find((m) => m.date === date);
    if (exact) return exact;
  }
  if (opponent) {
    const opp = opponent.toLowerCase();
    return matches.find((m) => String(m.opponent || '').toLowerCase().includes(opp) || opp.includes(String(m.opponent || '').toLowerCase())) || null;
  }
  return null;
}

// Converts one of Grok's match objects into the same bundle shape the
// frontend's match page has always consumed (pitch grid, substitutes,
// team stats, timeline) — so nothing downstream needs to change.
function buildBundleFromMatch(m) {
  if (!m) return { available: false, error: 'Match not found in the stored dataset yet.' };

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
          teamName: isEgypt ? 'Egypt' : m.opponent,
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
        teamName: isEgypt ? 'Egypt' : m.opponent,
        isEgypt,
      };
    })
    .sort((a, b) => a.minute - b.minute);

  return {
    available: true,
    date: m.date,
    opponentName: m.opponent,
    egyptIsHome: !!m.egyptIsHome,
    venue: m.venue || null,
    status: m.status || 'Match Finished',
    score: { egypt: m.scoreEgypt ?? null, opponent: m.scoreOpponent ?? null },
    formation: m.formation || formation,
    startXI,
    substitutes,
    teamStats: m.teamStats || [],
    timeline,
  };
}

// GET /api/match-full?date=&opponent= — everything the full match page
// needs in one call: pitch lineup, substitutes, team stats, and timeline.
app.get('/api/match-full', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const opponent = String(req.query.opponent || '').trim();
  try {
    const dataset = await getDataset();
    res.json(buildBundleFromMatch(findMatch(dataset, date, opponent)));
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// Kept for backwards compatibility with any cached client bundle.
app.get('/api/match-lineup', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const opponent = String(req.query.opponent || '').trim();
  try {
    const dataset = await getDataset();
    res.json(buildBundleFromMatch(findMatch(dataset, date, opponent)));
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/player-tournament-stats?number=10 — a player's tournament-wide
// totals, straight from the stored Grok dataset (no per-request computation
// or network calls in the common case).
app.get('/api/player-tournament-stats', async (req, res) => {
  const number = String(req.query.number || '').trim();
  const name = String(req.query.name || '').trim();
  if (!number && !name) return res.status(400).json({ available: false, error: 'Missing number or name' });

  try {
    const dataset = await getDataset();
    const players = dataset.data.players || [];
    let player = number ? players.find((p) => String(p.number) === number) : null;
    if (!player && name) {
      const term = name.split(/\s+/).slice(-1)[0].toLowerCase();
      player = players.find((p) => p.name && p.name.toLowerCase().includes(term));
    }
    if (!player) {
      return res.json({
        available: false,
        error: number ? `No player with squad number ${number} in the stored dataset.` : 'Player not found in the stored dataset.',
      });
    }
    res.json({ available: true, ...player });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// Builds a per-match breakdown (started/subbed, minutes, goals, assists,
// cards) for one player by re-reading the raw per-match data Grok already
// gave us (startXI / substitutes / timeline) — no extra Grok call needed.
// Matching is done by shirt number first (via SQUAD_ROSTER, which is the
// same source of truth src/App.tsx's SQUAD uses), falling back to name only
// when no number is supplied.
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

function computePlayerMatchStats(dataset, number, name) {
  const matches = dataset.data.matches || [];
  const rosterPlayer = number ? SQUAD_ROSTER.find((p) => String(p.number) === String(number)) : null;
  const targetName = rosterPlayer ? rosterPlayer.name : name;
  if (!targetName) return null;

  const perMatch = matches.map((m) => {
    const startEntry = (m.startXI || []).find(
      (p) => namesMatch(p.name, targetName) || (number && String(p.number) === String(number))
    );
    const subEntry = (m.substitutes || []).find(
      (p) => namesMatch(p.name, targetName) || (number && String(p.number) === String(number))
    );
    const started = !!startEntry;
    const played = started || !!subEntry;

    let subOffMinute = null;
    let subOnMinute = subEntry ? subEntry.cameOnMinute ?? null : null;
    let subOffFor = null; // name of teammate this player replaced (if subbed on)
    let subOnFor = null; // name of teammate who replaced this player (if subbed off)

    (m.timeline || []).forEach((t) => {
      if (t.type !== 'substitution' || t.team !== 'egypt') return;
      if (namesMatch(t.playerOn, targetName)) {
        subOnMinute = subOnMinute ?? (t.minute ?? null);
        subOffFor = t.playerOff || null;
      }
      if (namesMatch(t.playerOff, targetName)) {
        subOffMinute = t.minute ?? null;
        subOnFor = t.playerOn || null;
      }
    });

    let minutes = 0;
    if (started) {
      minutes = subOffMinute != null ? subOffMinute : 90;
    } else if (played) {
      minutes = subOnMinute != null ? Math.max(0, 90 - subOnMinute) : 0;
    }

    let goals = 0;
    let assists = 0;
    let yellowCards = 0;
    let redCards = 0;
    (m.timeline || []).forEach((t) => {
      if (t.team !== 'egypt') return;
      if (t.type === 'goal') {
        if (namesMatch(t.player, targetName)) goals += 1;
        if (namesMatch(t.assistPlayer, targetName)) assists += 1;
      }
      if (t.type === 'card' && namesMatch(t.player, targetName)) {
        if (/red/i.test(t.detail || '')) redCards += 1;
        else yellowCards += 1;
      }
    });

    return {
      date: m.date,
      opponent: m.opponent,
      venue: m.venue || null,
      scoreEgypt: m.scoreEgypt ?? null,
      scoreOpponent: m.scoreOpponent ?? null,
      played,
      started,
      minutes,
      goals,
      assists,
      yellowCards,
      redCards,
      subOnMinute: started ? null : subOnMinute,
      subOffMinute: started ? subOffMinute : null,
      subOffFor,
      subOnFor,
    };
  });

  return { number: (rosterPlayer && rosterPlayer.number) || number || null, name: targetName, matches: perMatch };
}

// GET /api/player-match-stats?number=10 — one row per finished Egypt match
// (started/subbed, minutes, goals, assists, cards) for a single player,
// looked up by shirt number. Computed on the fly from the stored dataset,
// no extra Grok call.
app.get('/api/player-match-stats', async (req, res) => {
  const number = String(req.query.number || '').trim();
  const name = String(req.query.name || '').trim();
  if (!number && !name) return res.status(400).json({ available: false, error: 'Missing number or name' });

  try {
    const dataset = await getDataset();
    const result = computePlayerMatchStats(dataset, number, name);
    if (!result) {
      return res.json({
        available: false,
        error: number ? `No player with squad number ${number}.` : 'Player not found.',
      });
    }
    res.json({ available: true, ...result });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/coach-stats — head coach's tournament-wide record, from the
// stored Grok dataset.
app.get('/api/coach-stats', async (req, res) => {
  try {
    const dataset = await getDataset();
    if (!dataset.data.coach) return res.json({ available: false, error: 'Coach stats not available in the stored dataset.' });
    res.json({ available: true, ...dataset.data.coach });
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/debug/grok-status — see what's currently stored without
// triggering any new Grok calls.
app.get('/api/debug/grok-status', (req, res) => {
  const stored = grokCache.get('dataset');
  res.json({
    groqKeyConfigured: !!GROQ_API_KEY,
    model: GROQ_MODEL,
    stored: stored
      ? {
          generatedAt: stored.generatedAt,
          matchesFinished: stored.matchesFinished,
          playerCount: (stored.data.players || []).length,
          matchCount: (stored.data.matches || []).length,
          note: stored.data.generatedNote || null,
        }
      : null,
  });
});

// GET /api/debug/grok-raw — the full stored dataset (or triggers the first
// generation if nothing's stored yet). Useful for eyeballing exactly what
// Grok returned.
app.get('/api/debug/grok-raw', async (req, res) => {
  try {
    res.json(await getDataset());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/debug/grok-refresh — force a brand-new Grok call right now,
// bypassing the stored dataset and the freshness-check cooldown. Use this
// after Egypt plays a match if you don't want to wait for the automatic
// freshness check to notice.
app.get('/api/debug/grok-refresh', async (req, res) => {
  try {
    grokCache.delete('dataset');
    grokCache.delete('freshness-check');
    const record = await generateFullDataset();
    res.json({
      ok: true,
      generatedAt: record.generatedAt,
      matchesFinished: record.matchesFinished,
      playerCount: (record.data.players || []).length,
      matchCount: (record.data.matches || []).length,
    });
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
