#!/usr/bin/env node
/**
 * HTTPS proxy for Hermes PWA using Tailscale certs.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CERT_DIR = path.resolve(process.env.HOME, '.hermes/certs');
const PWA_DIR = path.resolve(process.env.HOME, '.hermes/plugins/hermes-pwa/dashboard/dist/mobile');
const DASHBOARD_TARGET = 'http://127.0.0.1:9127';

const PORT = process.env.PWA_HTTPS_PORT || 9443;

// Load TLS cert
const certPath = path.join(CERT_DIR, 'fullchain.pem');
const keyPath = path.join(CERT_DIR, 'privkey.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('❌ Tailscale certs not found. Run: tailscale cert --cert-file ... ais-macbook-pro-3.tailc56f0d.ts.net');
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

function serveStatic(req, res) {
  let filePath = req.url.split('?')[0];
  if (filePath === '/' || filePath === '/mobile' || filePath === '/mobile/') {
    filePath = '/index.html';
  }
  // Strip /mobile prefix if present
  filePath = filePath.replace(/^\/mobile\/?/, '/');
  if (!filePath.startsWith('/')) filePath = '/' + filePath;

  const fullPath = path.join(PWA_DIR, filePath);

  // Security: prevent directory traversal
  if (!fullPath.startsWith(PWA_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return false; // Not a static file, proxy it
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });

  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  return true;
}

function proxyToDashboard(req, res) {
  const targetUrl = new URL(req.url, DASHBOARD_TARGET);

  const options = {
    hostname: '127.0.0.1',
    port: 9127,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:9127' },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Rewrite Set-Cookie headers for HTTPS compatibility:
    // - Add Secure flag (required on iOS Safari over HTTPS)
    // - Add SameSite=None (cross-origin via proxy)
    const headers = { ...proxyRes.headers };
    if (headers['set-cookie']) {
      const cookies = Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']];
      headers['set-cookie'] = cookies.map((c) => {
        let cookie = c;
        if (!cookie.includes('Secure')) cookie += '; Secure';
        if (cookie.includes('SameSite=lax') || cookie.includes('SameSite=strict')) {
          cookie = cookie.replace(/SameSite=\w+/i, 'SameSite=None');
        }
        return cookie;
      });
    }
    // Forward CORS headers for PWA
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
    headers['Access-Control-Allow-Headers'] = '*';
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Dashboard unreachable');
    }
  });

  req.pipe(proxyReq);
}

const server = https.createServer(tlsOptions, (req, res) => {
  // Handle CORS preflight
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

  // Try static file first
  if (serveStatic(req, res)) return;

  // Fall through to dashboard proxy
  proxyToDashboard(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 PWA HTTPS proxy running on https://ais-macbook-pro-3.tailc56f0d.ts.net:${PORT}/mobile/`);
  console.log(`   Static files: ${PWA_DIR}`);
  console.log(`   Proxying API: ${DASHBOARD_TARGET}`);
  console.log(`   SpeechRecognition + getUserMedia: ✅ enabled`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
});
