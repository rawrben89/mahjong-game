import http from 'http';
import fs from 'fs';
import os from 'os';
import { WebSocketServer } from 'ws';
import { attachPlayer, handleRaw, handleClose } from './game-core.js';

const PORT = process.env.PORT || 3000;

// ─── Static files ────────────────────────────────────────────────────────────
const MIME = {
  html: 'text/html; charset=utf-8',
  js:   'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg:  'image/svg+xml',
  png:  'image/png',
  jpg:  'image/jpeg',
};
const httpServer = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const fileMap = {
    '/': './public/index.html',
    '/index.html': './public/index.html',
    '/client.js': './public/client.js',
    '/game-core.js': './game-core.js',
    '/local-core.js': './local-core.js',
    '/sw.js': './public/sw.js',
    '/manifest.json': './public/manifest.json',
  };
  let filePath = fileMap[url];
  if (!filePath && url.startsWith('/assets/') && !url.includes('..')) filePath = './public' + url;
  if (filePath) {
    const ext = filePath.split('.').pop();
    try {
      const body = fs.readFileSync(filePath);
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      // html/js must always revalidate so phones never run a stale client
      headers['Cache-Control'] = url.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache';
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ─── WebSocket transport ─────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', ws => {
  attachPlayer(ws);
  ws.on('message', raw => handleRaw(ws, raw));
  ws.on('close', () => handleClose(ws));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🀄 Hong Kong Mahjong (Phaser 3 Edition)`);
  console.log(`   Local:   http://localhost:${PORT}`);
  const nets = Object.values(os.networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal);
  nets.forEach(n => console.log(`   Network: http://${n.address}:${PORT}  ← share with friends`));
  console.log('\nFor internet play: npx ngrok http ' + PORT);
  console.log('');
});
