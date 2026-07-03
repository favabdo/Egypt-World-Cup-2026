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
