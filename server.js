import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'project-state.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readSavedState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

async function writeSavedState(payload) {
  await ensureDataDir();
  const tempFile = `${STATE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tempFile, STATE_FILE);
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

async function readRequestBody(req) {
  const chunks = [];
  let totalBytes = 0;
  const maxBytes = 5 * 1024 * 1024;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, storage: STATE_FILE });
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      const state = await readSavedState();
      return sendJson(res, 200, { exists: Boolean(state), state });
    }

    if (pathname === '/api/state' && req.method === 'POST') {
      const rawBody = await readRequestBody(req);
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
        return sendJson(res, 400, { ok: false, error: 'Gecersiz proje durumu verisi.' });
      }
      const nextState = {
        ...parsed,
        savedAt: parsed.savedAt || new Date().toISOString(),
      };
      await writeSavedState(nextState);
      return sendJson(res, 200, { ok: true, savedAt: nextState.savedAt });
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolvedPath = path.resolve(PUBLIC_DIR, relativePath);
    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let fileData;
    let targetPath = resolvedPath;
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        targetPath = path.join(targetPath, 'index.html');
      }
      fileData = await fs.readFile(targetPath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(fileData);
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { ok: false, error: err?.message || 'Internal Server Error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TÜBİTAK 2209-A Proje Takip Paneli çalışıyor: http://127.0.0.1:${PORT}`);
  console.log(`Kayıt dosyası: ${STATE_FILE}`);
});
