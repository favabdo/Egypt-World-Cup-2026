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

app.use(express.static(DIST_DIR));

// SPA fallback: any unmatched route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
