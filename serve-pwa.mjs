#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import httpProxy from 'http-proxy';

const PORT = parseInt(process.env.PORT || '9400', 10);
const HERMES_API = process.env.HERMES_API || 'http://127.0.0.1:9200';
const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dashboard/dist/mobile');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const VIDEO_EXT_MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

const proxy = httpProxy.createProxyServer({
  target: HERMES_API,
  changeOrigin: true,
  ws: true,
  selfHandleResponse: false,
});

proxy.on('proxyReq', (proxyReq, req, _res) => {
  const parsed = new URL(HERMES_API);
  proxyReq.setHeader('host', parsed.host);
  proxyReq.setHeader('origin', HERMES_API);
  proxyReq.setHeader('x-forwarded-host', req.headers.host || '');
  proxyReq.setHeader('x-forwarded-proto', 'http');
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  if (proxyRes.headers['set-cookie']) {
    proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie =>
      cookie
        .replace(/; Domain=[^;]+/gi, '')
        .replace(/; Path=\/[^;]*/gi, '; Path=/')
        .replace(/; Secure/gi, '')
        .replace(/; SameSite=[^;]+/gi, '; SameSite=Lax'),
    );
  }
});

proxy.on('error', (err, _req, res) => {
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Bad Gateway: ${err.message}`);
  }
});

function serveStatic(req, res) {
  let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith('/api/video')) {
    // Serve raw video bytes directly from the filesystem.
    // The ?path= parameter is an absolute path on this machine.
    const qs = req.url.includes('?') ? req.url.split('?')[1] : '';
    const params = new URLSearchParams(qs);
    const filePath = params.get('path');
    if (!filePath) { res.writeHead(400); res.end('missing path'); return; }
    const decodedPath = decodeURIComponent(filePath);
    const ext = path.extname(decodedPath).toLowerCase();
    const mime = VIDEO_EXT_MIME[ext] || 'video/mp4';
    try {
      const stat = fs.statSync(decodedPath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(decodedPath).pipe(res);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`file not found: ${decodedPath}`);
    }
    return;
  }

  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) {
    proxy.web(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hermes PWA on http://0.0.0.0:${PORT}/`);
});
