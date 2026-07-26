#!/usr/bin/env node
/**
 * HTTPS proxy for Hermes PWA using Tailscale certs + http-proxy.
 * Enables SpeechRecognition and getUserMedia on iOS over HTTPS.
 *
 * Usage: node pwa-https-proxy.mjs
 * Then access: https://ais-macbook-pro-3.tailc56f0d.ts.net:9443/mobile/
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import httpProxy from 'http-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CERT_DIR = path.resolve(process.env.HOME, '.hermes/certs');
const PWA_DIR = path.resolve(process.env.HOME, '.hermes/plugins/hermes-pwa/dashboard/dist/mobile');
const DASHBOARD_TARGET = 'http://127.0.0.1:9127';

const PORT = process.env.PWA_HTTPS_PORT || 9443;

// Load TLS cert
const certPath = path.join(CERT_DIR, 'fullchain.pem');
const keyPath = path.join(CERT_DIR, 'privkey.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('❌ Tailscale certs not found.');
  process.exit(1);
}

const tlsOptions = {
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
};

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Create proxy to dashboard
const proxy = httpProxy.createProxyServer({
  target: DASHBOARD_TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: false,
});

// Rewrite Set-Cookie for HTTPS compatibility
proxy.on('proxyRes', (proxyRes, req, res) => {
  if (proxyRes.headers['set-cookie']) {
    const cookies = Array.isArray(proxyRes.headers['set-cookie'])
      ? proxyRes.headers['set-cookie']
      : [proxyRes.headers['set-cookie']];
    proxyRes.headers['set-cookie'] = cookies.map((c) => {
      let cookie = c;
      if (!cookie.includes('Secure')) cookie += '; Secure';
      if (cookie.includes('SameSite=lax') || cookie.includes('SameSite=strict')) {
        cookie = cookie.replace(/SameSite=\w+/i, 'SameSite=None');
      }
      return cookie;
    });
  }
  // CORS
  proxyRes.headers['access-control-allow-origin'] = '*';
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res && !res.headersSent) {
    res.writeHead(502);
    res.end('Dashboard unreachable');
  }
});

function serveStatic(req, res) {
  let filePath = (req.url || '/').split('?')[0];
  if (filePath === '/' || filePath === '/mobile' || filePath === '/mobile/') {
    filePath = '/index.html';
  }
  filePath = filePath.replace(/^\/mobile\/?/, '/');
  if (!filePath.startsWith('/')) filePath = '/' + filePath;

  const fullPath = path.join(PWA_DIR, filePath);
  if (!fullPath.startsWith(PWA_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return false;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(fullPath).pipe(res);
  return true;
}

// HTTPS server
const server = https.createServer(tlsOptions, (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  console.log(`${req.method} ${req.url}`);

  if (serveStatic(req, res)) return;

  proxy.web(req, res);
});

// WebSocket upgrade — http-proxy handles this natively
server.on('upgrade', (req, socket, head) => {
  console.log(`WS  ${req.url}`);
  proxy.ws(req, socket, head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 PWA HTTPS proxy running on https://ais-macbook-pro-3.tailc56f0d.ts.net:${PORT}/mobile/`);
  console.log(`   Static files: ${PWA_DIR}`);
  console.log(`   Proxying API:  ${DASHBOARD_TARGET}`);
  console.log(`   WebSocket:     ✅ native via http-proxy`);
  console.log(`   mic/camera:    ✅ HTTPS enabled`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
});
