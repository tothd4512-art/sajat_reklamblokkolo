#!/usr/bin/env node
/**
 * Fejlesztői statikus szerver
 * Ebből a mappából szolgálja ki a demót, a popupot és a beállítások oldalt,
 * hogy kiegészítő telepítése nélkül is kipróbálható legyen a felület.
 *
 *   npm run dev   ->  http://localhost:4173/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

function notFound(res, message) {
  const body = `<!DOCTYPE html><html lang="hu"><meta charset="utf-8">
  <body style="background:#070b12;color:#e8eef8;font-family:system-ui;padding:48px;line-height:1.6">
  <h1 style="font-size:20px">404 – nincs ilyen fájl</h1>
  <p style="color:#93a4bd">${message}</p>
  <p><a style="color:#6ee7a8" href="/demo/">← vissza a demóhoz</a></p></body></html>`;
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  } catch {
    return notFound(res, 'hibás kérés');
  }

  if (pathname === '/' || pathname === '') {
    res.writeHead(302, { location: '/demo/' });
    return res.end();
  }

  let filePath = path.join(ROOT, pathname);

  // könyvtár -> index.html (és perjel nélküli kérés -> átirányítás)
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(302, { location: pathname + '/' });
        return res.end();
      }
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    return notFound(res, `A keresett útvonal: <code>${pathname}</code>`);
  }

  if (!filePath.startsWith(ROOT)) return notFound(res, 'nem engedélyezett útvonal');

  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res, `A keresett útvonal: <code>${pathname}</code>`);
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ReklámStop dev szerver: http://localhost:${PORT}/`);
  console.log(`  demó:        http://localhost:${PORT}/demo/`);
  console.log(`  popup:       http://localhost:${PORT}/extension/popup/popup.html`);
  console.log(`  beállítások: http://localhost:${PORT}/extension/options/options.html`);
});
