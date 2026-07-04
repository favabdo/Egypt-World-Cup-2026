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
// TheSportsDB integration (thesportsdb.com)
// Powers per-match lineups/formations, per-player TOURNAMENT-WIDE stats
// (aggregated across every Egypt match, not just the last one), general
// coach/team stats, and a richer "full match" bundle (lineup + team stats +
// timeline) for the dedicated match page.
//
// Auth: v1 uses the API key as a URL path segment. The free test key "123"
// works out of the box with modest per-endpoint rate limits; set
// THESPORTSDB_API_KEY to a premium key for higher limits.
//
// Docs: https://www.thesportsdb.com/documentation
//   - Search Events:      /searchevents.php?e=Team1_vs_Team2
//   - Events on a day:    /eventsday.php?d=YYYY-MM-DD&s=Soccer
//   - Lookup Event:       /lookupevent.php?id={idEvent}
//   - Lookup Lineup:      /lookuplineup.php?id={idEvent}
//       -> [{ idPlayer, strPlayer, strPosition, strHome, strSubstitute, intSquadNumber }]
//   - Lookup Event Stats: /lookupeventstats.php?id={idEvent}
//       -> [{ strStat, intHome, intAway }]  (team-level, e.g. Shots, Possession, Fouls)
//   - Lookup Timeline:    /lookuptimeline.php?id={idEvent}
//       -> [{ strTimeline: 'Goal'|'Card'|'subst', strTimelineDetail, idPlayer, strPlayer,
//              idAssist, strAssist, intTime, idTeam, strTeam }]
//         For goals: strPlayer = scorer, strAssist = assist provider (if any).
//         For subs:  strPlayer = player going OFF, strAssist = player coming ON.
//
// TheSportsDB is a metadata-first database — it doesn't expose deep
// per-touch stats (touches, tackles, chances created). What IS reliably
// available and what we build tournament-long totals from: appearances,
// starts, minutes (approximated from sub timing), goals, assists, and
// cards — plus team-level shots/possession/etc. per match.
// ---------------------------------------------------------------------------
const THESPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '123';
const TSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY}`;

async function tsdb(path, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${TSDB_BASE}${path}${qs ? `?${qs}` : ''}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TheSportsDB HTTP ${r.status} on ${path}`);
  return r.json();
}

// Egypt's fixture schedule for the current tournament — dates/opponents only
// (used purely to resolve each match's TheSportsDB event ID; scores, cards,
// lineups etc. below are all fetched live). Keep this in sync with
// GROUP_MATCHES + LIVE_MATCH in src/App.tsx if the fixture list changes
// (e.g. Egypt advancing to a new knockout round).
const EGYPT_TOURNAMENT_MATCHES = [
  { date: '2026-06-15', opponent: 'Belgium' },
  { date: '2026-06-21', opponent: 'New Zealand' },
  { date: '2026-06-26', opponent: 'Iran' },
  { date: '2026-07-03', opponent: 'Australia' },
];

const slug = (s) => String(s || '').trim().replace(/\s+/g, '_');

// ---------------------------------------------------------------------------
// Persistent, disk-backed cache. Goal: TheSportsDB is only ever hit ONCE per
// match/player — every visitor after that is served the stored copy, not a
// fresh network call. Data for a match that has already finished never
// changes, so it's cached forever; it only gets invalidated automatically
// once Egypt actually plays (and finishes) another match, which is when
// EGYPT_TOURNAMENT_MATCHES below grows and the finished-match count changes.
//
// Note: on Render's free plan the local disk is wiped on every redeploy (but
// survives ordinary restarts/sleep-wake cycles), so this still means "one
// fetch shared by everyone" for as long as the current deploy is running.
// For it to also survive redeploys, attach a Render persistent Disk to the
// service and point CACHE_FILE at a path inside it.
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

// In-memory store, hydrated from disk at boot and written back on every
// change, so both fast in-process reads and cross-restart persistence work.
const diskStore = loadCacheFile();

// Generic cache backed by a section of diskStore.
//   ttlMs === null  -> never expires once set (used for finished matches)
//   ttlMs === number -> expires after that many ms (used for
//                       scheduled/in-progress matches, so we keep polling
//                       until the match actually finishes)
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
    values() {
      return Object.values(map).map((hit) => hit.data);
    },
  };
}

const eventIdCache = makeCache('eventIds', 7 * 24 * 60 * 60 * 1000); // resolved fixtures barely change
const matchBundleCache = makeCache('matchBundles', 5 * 60 * 1000); // short TTL by default; set to permanent (null) once a match is finished
const tournamentStatsCache = makeCache('tournamentStats', 5 * 60 * 1000); // aggregate endpoints, cheap to recompute from the bundle cache

// Resolves and permanently caches Egypt's TheSportsDB team ID once. All
// schedule lookups below key off this ID rather than searching by name.
async function getEgyptTeamId() {
  const cached = eventIdCache.get('__egypt_team_id__');
  if (cached !== undefined) return cached;

  try {
    const payload = await tsdb('/searchteams.php', { t: 'Egypt' });
    const teams = payload.teams || [];
    const team = teams.find((t) => t.strSport === 'Soccer' && isEgyptTeam({ name: t.strTeam })) || null;
    const id = team ? team.idTeam : null;
    // Permanent once resolved; retry hourly if the lookup itself failed.
    eventIdCache.set('__egypt_team_id__', id, id ? null : 60 * 60 * 1000);
    return id;
  } catch (_) {
    return null;
  }
}

// Egypt's actual fixture list straight from TheSportsDB (past 5 + next 5
// events for their team ID). Far more reliable than guessing event-name
// strings or exact calendar dates — those broke every time an opponent's
// official TheSportsDB name differed from ours (e.g. "IR Iran" vs "Iran")
// or a hardcoded date was off by a day. Short TTL so newly finished/
// upcoming matches get picked up, but cheap since it's just 2 calls.
async function getEgyptScheduleRaw() {
  const cached = matchBundleCache.get('__egypt_schedule__');
  if (cached !== undefined) return cached;

  const teamId = await getEgyptTeamId();
  if (!teamId) return [];

  const [lastPayload, nextPayload] = await Promise.all([
    tsdb('/eventslast.php', { id: teamId }).catch(() => ({ results: [] })),
    tsdb('/eventsnext.php', { id: teamId }).catch(() => ({ events: [] })),
  ]);
  const events = [...(lastPayload.results || []), ...(nextPayload.events || [])];
  matchBundleCache.set('__egypt_schedule__', events, 5 * 60 * 1000);
  return events;
}

// Matches a fixture from our hardcoded list against Egypt's real schedule
// by opponent name (loosely — handles "IR Iran" vs "Iran", "Iran" vs "IR
// Iran", etc.) and, if there are multiple matchups against the same
// opponent, narrows by date (allowing a ±2 day tolerance in case our
// hardcoded date is slightly off).
function matchFixtureFromSchedule(schedule, date, opponent) {
  const opp = String(opponent || '').toLowerCase();
  const oppLoose = opp.replace(/^ir\s+/, '').trim(); // "ir iran" -> "iran"
  const targetTime = date ? new Date(date).getTime() : null;

  const candidates = schedule.filter((ev) => {
    const home = String(ev.strHomeTeam || '').toLowerCase();
    const away = String(ev.strAwayTeam || '').toLowerCase();
    const isEgyptMatch = isEgyptTeam({ name: ev.strHomeTeam }) || isEgyptTeam({ name: ev.strAwayTeam });
    if (!isEgyptMatch) return false;
    if (!opp) return true;
    const otherTeam = isEgyptTeam({ name: ev.strHomeTeam }) ? away : home;
    return otherTeam.includes(oppLoose) || oppLoose.includes(otherTeam) || otherTeam.includes(opp) || opp.includes(otherTeam);
  });

  if (candidates.length <= 1) return candidates[0] || null;
  if (!targetTime) return candidates[0];

  // Multiple matchups vs the same opponent (rare) — pick the closest date.
  return candidates.reduce((best, ev) => {
    const evTime = new Date(ev.dateEvent).getTime();
    const bestTime = new Date(best.dateEvent).getTime();
    return Math.abs(evTime - targetTime) < Math.abs(bestTime - targetTime) ? ev : best;
  });
}

// Resolves a TheSportsDB idEvent for an Egypt fixture on a given date,
// optionally narrowed by opponent name. Primary strategy: match it against
// Egypt's real schedule (by team ID, immune to naming/date guessing).
// Falls back to a direct fixture-name search, then to scanning that
// calendar day, for the rare case the schedule endpoint itself is down.
async function resolveEventId(date, opponent) {
  const cacheKey = `${date}|${opponent}`;
  const cached = eventIdCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let found = null;

  try {
    const schedule = await getEgyptScheduleRaw();
    found = matchFixtureFromSchedule(schedule, date, opponent);
  } catch (_) {
    /* fall through to legacy strategies */
  }

  if (!found) {
    const tryNames = opponent
      ? [`Egypt_vs_${slug(opponent)}`, `${slug(opponent)}_vs_Egypt`]
      : [];
    for (const e of tryNames) {
      try {
        const payload = await tsdb('/searchevents.php', { e });
        const events = payload.event || [];
        found = events.find((ev) => (ev.dateEvent || '').slice(0, 10) === date) || events[0] || null;
        if (found) break;
      } catch (_) {
        /* try next strategy */
      }
    }
  }

  if (!found) {
    try {
      const payload = await tsdb('/eventsday.php', { d: date, s: 'Soccer' });
      const events = payload.events || [];
      found = events.find(
        (ev) => isEgyptTeam({ name: ev.strHomeTeam }) || isEgyptTeam({ name: ev.strAwayTeam })
      ) || null;
    } catch (_) {
      /* give up */
    }
  }

  const idEvent = found ? found.idEvent : null;
  // Only cache successful resolutions forever; leave failures on a short
  // 10-minute retry window instead of the 7-day default.
  eventIdCache.set(cacheKey, idEvent, idEvent ? null : 10 * 60 * 1000);
  return idEvent;
}

// Buckets a free-text TheSportsDB position (e.g. "Right Wing", "Attacking
// Midfielder", "Centre-Back") into one of the four pitch rows. There's no
// numeric formation string from this API, so the formation and grid are
// synthesized entirely from these buckets.
function classifyPosition(raw) {
  const p = String(raw || '').toLowerCase();
  if (p.includes('goalkeeper') || p === 'gk') return 'GK';
  if (p.includes('back') || p.includes('defender') || p.includes('sweeper')) return 'DEF';
  if (p.includes('forward') || p.includes('striker') || (p.includes('wing') && !p.includes('back'))) return 'FWD';
  if (p.includes('midfield')) return 'MID';
  return 'MID';
}

const POSITION_ROW = { GK: 1, DEF: 2, MID: 3, FWD: 4 };

// Builds the pitch grid + a synthesized "4-3-3"-style formation string from
// bucketed positions. Every player who has a recognizable position gets a
// row, so the board is never empty (the previous integration's grid could
// silently come back all-null when the upstream formation string didn't
// match the squad size).
function buildFormationGrid(startXI) {
  const withBucket = startXI.map((p) => ({ ...p, bucket: classifyPosition(p.pos) }));
  const counts = { DEF: 0, MID: 0, FWD: 0 };
  withBucket.forEach((p) => {
    if (p.bucket !== 'GK') counts[p.bucket] += 1;
  });
  const formation = counts.DEF || counts.MID || counts.FWD
    ? `${counts.DEF}-${counts.MID}-${counts.FWD}`
    : null;

  const grid = withBucket.map((p) => ({ ...p, grid: `${POSITION_ROW[p.bucket]}:1` }));
  return { startXI: grid, formation };
}

// Fetches and normalizes everything TheSportsDB has for one Egypt match:
// lineup (-> pitch + subs), team-level stats, and the goal/card/sub
// timeline. This single bundle powers both the tournament stat aggregation
// below and the full match page.
async function getMatchBundle(date, opponent) {
  const cacheKey = `${date}|${opponent}`;
  const cached = matchBundleCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const idEvent = await resolveEventId(date, opponent);
  if (!idEvent) {
    const empty = { available: false, error: 'Fixture not found on TheSportsDB for that date.' };
    matchBundleCache.set(cacheKey, empty);
    return empty;
  }

  try {
    const [eventPayload, lineupPayload, statsPayload, timelinePayload] = await Promise.all([
      tsdb('/lookupevent.php', { id: idEvent }).catch(() => ({ events: [] })),
      tsdb('/lookuplineup.php', { id: idEvent }).catch(() => ({ lineup: [] })),
      tsdb('/lookupeventstats.php', { id: idEvent }).catch(() => ({ eventstats: [] })),
      tsdb('/lookuptimeline.php', { id: idEvent }).catch(() => ({ timeline: [] })),
    ]);

    const event = (eventPayload.events || [])[0] || null;
    const egyptIsHome = isEgyptTeam({ name: event?.strHomeTeam });
    const opponentName = egyptIsHome ? event?.strAwayTeam : event?.strHomeTeam;

    const lineupRows = lineupPayload.lineup || [];
    const egyptRows = lineupRows.filter((r) => (egyptIsHome ? r.strHome === 'Yes' : r.strHome === 'No'));

    const startersRaw = egyptRows
      .filter((r) => r.strSubstitute !== 'Yes')
      .map((r) => ({ idPlayer: r.idPlayer, name: r.strPlayer, number: r.intSquadNumber || null, pos: r.strPosition || null }));
    const subsRaw = egyptRows
      .filter((r) => r.strSubstitute === 'Yes')
      .map((r) => ({ idPlayer: r.idPlayer, name: r.strPlayer, number: r.intSquadNumber || null, pos: r.strPosition || null }));

    const timeline = (timelinePayload.timeline || [])
      .map((t) => ({
        minute: parseInt(t.intTime, 10) || 0,
        type: String(t.strTimeline || '').toLowerCase(), // 'goal' | 'card' | 'subst'
        detail: t.strTimelineDetail || null,
        playerId: t.idPlayer || null,
        playerName: t.strPlayer || null,
        assistId: t.idAssist || null,
        assistName: t.strAssist || null,
        teamName: t.strTeam || null,
        isEgypt: isEgyptTeam({ name: t.strTeam }),
      }))
      .sort((a, b) => a.minute - b.minute);

    // Who actually came on as a sub (for the "came on" badge + tournament minutes).
    const subbedOnIds = new Set(
      timeline.filter((t) => t.type === 'subst' && t.isEgypt && t.assistId).map((t) => String(t.assistId))
    );
    const subbedOffMinute = new Map(); // idPlayer -> minute they were substituted off
    const subbedOnMinute = new Map(); // idPlayer -> minute they came on
    timeline
      .filter((t) => t.type === 'subst' && t.isEgypt)
      .forEach((t) => {
        if (t.playerId) subbedOffMinute.set(String(t.playerId), t.minute);
        if (t.assistId) subbedOnMinute.set(String(t.assistId), t.minute);
      });

    const { startXI, formation } = buildFormationGrid(startersRaw);
    const substitutes = subsRaw.map((p) => ({
      ...p,
      cameOn: subbedOnIds.has(String(p.idPlayer)),
      cameOnMinute: subbedOnMinute.get(String(p.idPlayer)) ?? null,
    }));

    const teamStats = (statsPayload.eventstats || []).map((s) => ({
      type: s.strStat,
      egypt: egyptIsHome ? s.intHome : s.intAway,
      opponent: egyptIsHome ? s.intAway : s.intHome,
    }));

    const egyScore = event ? Number(egyptIsHome ? event.intHomeScore : event.intAwayScore) : null;
    const oppScore = event ? Number(egyptIsHome ? event.intAwayScore : event.intHomeScore) : null;

    const bundle = {
      available: true,
      idEvent,
      date,
      opponentName: opponentName || opponent,
      egyptIsHome,
      venue: event?.strVenue || null,
      status: event?.strStatus || null,
      score: { egypt: Number.isFinite(egyScore) ? egyScore : null, opponent: Number.isFinite(oppScore) ? oppScore : null },
      formation,
      startXI,
      substitutes,
      teamStats,
      timeline,
      // idPlayer -> { started, cameOn, offMinute, onMinute, pos } used by the
      // tournament aggregator below.
      appearances: [
        ...startersRaw.map((p) => ({
          idPlayer: p.idPlayer,
          name: p.name,
          number: p.number,
          pos: p.pos,
          started: true,
          offMinute: subbedOffMinute.get(String(p.idPlayer)) ?? null,
        })),
        ...substitutes
          .filter((p) => p.cameOn)
          .map((p) => ({ idPlayer: p.idPlayer, name: p.name, number: p.number, pos: p.pos, started: false, onMinute: p.cameOnMinute })),
      ],
    };

    // A finished match's data (score, lineup, timeline) never changes again
    // — cache it forever so it's fetched from TheSportsDB exactly once,
    // ever, and every visitor after that is served this stored copy.
    const isFinished = bundle.score.egypt != null && bundle.score.opponent != null;
    matchBundleCache.set(cacheKey, bundle, isFinished ? null : undefined);
    return bundle;
  } catch (err) {
    const empty = { available: false, error: String(err) };
    matchBundleCache.set(cacheKey, empty);
    return empty;
  }
}

async function getAllMatchBundles() {
  return Promise.all(EGYPT_TOURNAMENT_MATCHES.map((m) => getMatchBundle(m.date, m.opponent)));
}

// GET /api/debug/fixtures — diagnostic view of exactly what TheSportsDB
// returns for Egypt's team lookup, schedule, and each hardcoded fixture's
// resolution. Bypasses all caches (always hits the network fresh) so it
// reflects the current live state. Visit this directly in a browser when
// player/lineup data isn't showing up, to see exactly which step is empty.
app.get('/api/debug/fixtures', async (req, res) => {
  try {
    const teamId = await getEgyptTeamId();
    let schedule = [];
    let scheduleError = null;
    try {
      schedule = await getEgyptScheduleRaw();
    } catch (err) {
      scheduleError = String(err);
    }

    const fixtures = await Promise.all(
      EGYPT_TOURNAMENT_MATCHES.map(async (m) => {
        const matched = matchFixtureFromSchedule(schedule, m.date, m.opponent);
        const idEvent = await resolveEventId(m.date, m.opponent);
        return {
          ...m,
          matchedFromSchedule: matched
            ? { idEvent: matched.idEvent, home: matched.strHomeTeam, away: matched.strAwayTeam, date: matched.dateEvent }
            : null,
          resolvedIdEvent: idEvent,
        };
      })
    );

    res.json({
      egyptTeamId: teamId,
      scheduleError,
      scheduleCount: schedule.length,
      scheduleSample: schedule.map((ev) => ({
        idEvent: ev.idEvent,
        home: ev.strHomeTeam,
        away: ev.strAwayTeam,
        date: ev.dateEvent,
      })),
      fixtures,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// How many Egypt matches have an actual final score right now. Finished
// bundles are cached forever (no network cost to check this), so calling
// this is cheap. Tournament-stat aggregates only need recomputing when this
// number goes up, i.e. Egypt has played and finished another match.
function finishedCount(bundles) {
  return bundles.filter((b) => b.available && b.score?.egypt != null && b.score?.opponent != null).length;
}

// GET /api/match-full?date=&opponent= — everything the new full match page
// needs in one call: pitch lineup, substitutes, team stats, and the timeline.
app.get('/api/match-full', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const opponent = String(req.query.opponent || '').trim();
  if (!date) return res.status(400).json({ available: false, error: 'Missing date' });
  try {
    const bundle = await getMatchBundle(date, opponent);
    res.json(bundle);
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// Kept for backwards compatibility with any cached client bundle; the app
// now calls /api/match-full directly.
app.get('/api/match-lineup', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const opponent = String(req.query.opponent || '').trim();
  if (!date) return res.status(400).json({ available: false, error: 'Missing date' });
  try {
    const bundle = await getMatchBundle(date, opponent);
    res.json(bundle);
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/player-tournament-stats?number=10 — aggregates a player's
// appearances/starts/minutes/goals/assists/cards across EVERY Egypt match
// resolved above (not just the latest one), plus a most-common position
// bucket so the UI can tailor which stats it highlights.
//
// Matching is done by shirt/squad number (intSquadNumber from TheSportsDB)
// rather than by name, since our local squad names (photo filenames) rarely
// match TheSportsDB's full player names exactly. `name` is still accepted
// as a fallback for players without a resolvable number (e.g. the coach).
// Core aggregation: given a `matches(appearance)` predicate and the already
// -fetched match bundles, sums up appearances/minutes/goals/etc. Shared by
// the single-player endpoint and the bulk debug endpoint below.
function aggregatePlayerStats(matches, bundles) {
  let appearances = 0;
  let starts = 0;
  let minutes = 0;
  let goals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;
  let cleanSheets = 0;
  const posCounts = {};
  let resolvedName = null;
  let anyBundleAvailable = false;

  for (const b of bundles) {
    if (!b.available) continue;
    anyBundleAvailable = true;

    const app_ = (b.appearances || []).find(matches);
    if (!app_) continue;

    resolvedName = app_.name;
    appearances += 1;
    if (app_.started) starts += 1;
    posCounts[classifyPosition(app_.pos)] = (posCounts[classifyPosition(app_.pos)] || 0) + 1;

    if (app_.started) {
      minutes += app_.offMinute != null ? app_.offMinute : 90;
    } else {
      minutes += app_.onMinute != null ? Math.max(0, 90 - app_.onMinute) : 0;
    }

    if (app_.started && b.score?.opponent === 0) cleanSheets += 1;

    const idStr = String(app_.idPlayer);
    b.timeline.forEach((t) => {
      if (!t.isEgypt) return;
      if (t.type === 'goal' && String(t.playerId) === idStr && !(t.detail || '').toLowerCase().includes('own')) goals += 1;
      if (t.type === 'goal' && String(t.assistId) === idStr) assists += 1;
      if (t.type === 'card' && String(t.playerId) === idStr) {
        const d = (t.detail || '').toLowerCase();
        if (d.includes('yellow')) yellowCards += 1;
        if (d.includes('red')) redCards += 1;
      }
    });
  }

  const position = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'MID';
  return { anyBundleAvailable, appearances, starts, minutes, goals, assists, yellowCards, redCards, cleanSheets, position, resolvedName };
}

// The squad's shirt numbers (kept in sync with SQUAD in src/App.tsx).
// COACH has no shirt number and isn't looked up here.
const SQUAD_NUMBERS = ['1', '23', '16', '26', '2', '5', '6', '4', '3', '24', '13', '15', '19', '8', '14', '17', '21', '18', '20', '12', '25', '11', '7', '10', '9', '22'];

// GET /api/debug/all-player-stats — runs /api/player-tournament-stats'
// exact matching logic for every shirt number in the squad in one shot, so
// you can see at a glance which players have data and which don't, instead
// of checking one number at a time. Bypasses the cache (always fresh).
app.get('/api/debug/all-player-stats', async (req, res) => {
  try {
    const bundles = await getAllMatchBundles();
    const results = SQUAD_NUMBERS.map((number) => {
      const matches = (p) => p && String(p.number || '') === number;
      const agg = aggregatePlayerStats(matches, bundles);
      if (agg.appearances === 0) {
        return { number, available: false, error: 'Not found in any resolved lineup yet.' };
      }
      return {
        number,
        available: true,
        name: agg.resolvedName,
        position: agg.position,
        appearances: agg.appearances,
        starts: agg.starts,
        minutes: agg.minutes,
        goals: agg.goals,
        assists: agg.assists,
        yellowCards: agg.yellowCards,
        redCards: agg.redCards,
        cleanSheets: agg.cleanSheets,
      };
    });
    res.json({
      bundlesAvailable: bundles.filter((b) => b.available).length,
      bundlesTotal: bundles.length,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/player-tournament-stats', async (req, res) => {
  const number = String(req.query.number || '').trim();
  const name = String(req.query.name || '').trim();
  if (!number && !name) return res.status(400).json({ available: false, error: 'Missing number or name' });

  const cacheKey = number ? `#${number}` : name;

  try {
    // Cheap: finished matches are already stored on disk, so this rarely
    // makes a network call. `signature` tells us whether anything about the
    // tournament has actually moved on since we last computed this player's
    // stats.
    const bundles = await getAllMatchBundles();
    const signature = finishedCount(bundles);

    const cached = tournamentStatsCache.get(cacheKey);
    if (cached !== undefined && cached.signature === signature) return res.json(cached.payload);

    const searchTerm = name ? name.split(/\s+/).slice(-1)[0].toLowerCase() : '';
    const matches = (p) => {
      if (!p) return false;
      if (number) return String(p.number || '') === number;
      return p.name && (p.name.toLowerCase().includes(searchTerm) || searchTerm.includes(p.name.toLowerCase().split(/\s+/).slice(-1)[0]));
    };

    const agg = aggregatePlayerStats(matches, bundles);

    if (!agg.anyBundleAvailable) {
      const empty = { available: false, error: 'Could not reach TheSportsDB for any tournament match.' };
      tournamentStatsCache.set(cacheKey, { signature, payload: empty }, null);
      return res.json(empty);
    }
    if (agg.appearances === 0) {
      const empty = { available: false, error: number ? `No player with squad number ${number} found in any resolved lineup yet.` : 'Player not found in any resolved lineup yet.' };
      tournamentStatsCache.set(cacheKey, { signature, payload: empty }, null);
      return res.json(empty);
    }

    const data = {
      available: true,
      name: agg.resolvedName || name || null,
      number: number || null,
      position: agg.position,
      appearances: agg.appearances,
      starts: agg.starts,
      minutes: agg.minutes,
      goals: agg.goals,
      assists: agg.assists,
      yellowCards: agg.yellowCards,
      redCards: agg.redCards,
      cleanSheets: agg.cleanSheets,
    };
    tournamentStatsCache.set(cacheKey, { signature, payload: data }, null);
    res.json(data);
  } catch (err) {
    res.json({ available: false, error: String(err) });
  }
});

// GET /api/coach-stats — general tournament-wide team record (matches
// played, W/D/L, goals for/against, clean sheets), shown for the coach card
// since managers aren't modeled as their own entity on TheSportsDB.
app.get('/api/coach-stats', async (req, res) => {
  try {
    const bundles = await getAllMatchBundles();
    const signature = finishedCount(bundles);

    const cached = tournamentStatsCache.get('__coach__');
    if (cached !== undefined && cached.signature === signature) return res.json(cached.payload);

    const played = bundles.filter((b) => b.available && b.score?.egypt != null && b.score?.opponent != null);

    if (played.length === 0) {
      const empty = { available: false, error: 'Could not reach TheSportsDB for any tournament match.' };
      tournamentStatsCache.set('__coach__', { signature, payload: empty }, null);
      return res.json(empty);
    }

    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;
    played.forEach((b) => {
      goalsFor += b.score.egypt;
      goalsAgainst += b.score.opponent;
      if (b.score.opponent === 0) cleanSheets += 1;
      if (b.score.egypt > b.score.opponent) wins += 1;
      else if (b.score.egypt === b.score.opponent) draws += 1;
      else losses += 1;
    });

    const data = {
      available: true,
      matchesPlayed: played.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      cleanSheets,
    };
    tournamentStatsCache.set('__coach__', { signature, payload: data }, null);
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
