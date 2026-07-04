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
- `GROQ_API_KEY` — powers per-player tournament stats, per-match stats/lineups/substitutions, and coach stats. It works by asking Groq's `groq/compound` system (which has a built-in web-search tool) to research Egypt's real World Cup 2026 matches and return one structured dataset, cached on disk and reused for every visitor. Get a key at https://console.groq.com/keys.
  - **Important:** Groq (the fast-inference company, console.groq.com) and Grok/xAI (Elon Musk's model) are two different products with very similar names — make sure the key comes from console.groq.com, not groq.com's chat product or x.ai.
- `GROQ_MODEL` — optional, overrides the default model (`groq/compound`).

### Debugging the dataset

A few debug-only routes let you check on the stored dataset without guessing:

- `/api/debug/grok-status` — shows whether `GROQ_API_KEY` is configured and whether a dataset has been generated yet.
- `/api/debug/grok-refresh` — forces a brand-new Groq call right now (can take up to ~90s while it searches the web). Useful right after Egypt plays a new match, or after fixing an API key.
- `/api/debug/grok-raw` — dumps the full stored dataset.

### Player/match matching (important)

Both the player-stats and match-lineup features match by the player's **shirt number** (via `SQUAD_ROSTER` in `server.js`, kept in sync with `SQUAD` in `src/App.tsx`), not by fuzzy name matching — so results are consistent regardless of how a name is spelled or abbreviated.
