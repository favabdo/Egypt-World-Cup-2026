/**
 * Minimal static file server for production deployment (e.g. Render).
 * Serves the Vite-built app from ./dist and falls back to index.html
 * for client-side routing.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

app.use(express.static(DIST_DIR));

// SPA fallback: any unmatched route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
