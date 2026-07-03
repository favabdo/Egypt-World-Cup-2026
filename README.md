<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e5a1d6b7-1d47-44ff-8641-f09b592317dd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Render

This repo includes a `render.yaml` blueprint, so Render can pick up the settings automatically. If you're setting it up manually instead, use a **Web Service** with:

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Node version:** 18 or newer

The build step runs `vite build` (output in `dist/`), and `npm start` runs `server.js`, a small Express server that serves the built files.

## Environment variables

Set these on Render (or in `.env` locally):

- `FOOTBALL_DATA_API_KEY` — powers the live-match card on the Matches page (football-data.org). Get a free key at https://www.football-data.org/client/register. Without it, `/api/egypt-match` returns a 500 and the live-match card falls back to the static placeholder.
- `THESPORTSDB_API_KEY` — powers per-player tournament stats (tap the active player) and the match lineup/statistics modal (tap any match card), via thesportsdb.com. Optional: defaults to the shared free test key `123`, which works but has very low per-endpoint request limits. Get a Patreon key at https://www.thesportsdb.com/member.php for reliable use in production.

### Player name matching (important)

Both features above match a player by **name**, not by a stable ID — the server takes the name you send it, keeps its last word, and looks for a lineup entry whose name contains it (see `matches()` in `server.js`). This means:

- Each entry in `SQUAD` (`src/App.tsx`) can set an optional `apiName` — the player's exact real/registered name as listed on TheSportsDB (search at https://www.thesportsdb.com/search.php?s=). Set this whenever the local nickname/file name doesn't closely resemble the player's real name; otherwise stats for that player will never resolve, no matter how correctly the API keys are configured.
- Likewise, `EGYPT_TOURNAMENT_MATCHES` in `server.js` must list the real opponent name and date for each fixture exactly as it would appear in a TheSportsDB event search (`Egypt_vs_<Opponent>`); if the fixture isn't indexed there under that name, its lineup/stats will show "no data" for the whole match, independent of player names.
- If a squad entry represents someone who isn't an actual professional footballer (e.g. a placeholder/joke entry), no `apiName` will ever produce results — that "no data" state is expected, not a bug.
