import { attachPlayer, handleRaw, handleClose } from './game-core.js';

// Single Durable Object instance hosts the lobby and all rooms,
// mirroring the single-process design of the Node server.
export class MahjongLobby {
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    attachPlayer(server);
    server.addEventListener('message', e => handleRaw(server, e.data));
    server.addEventListener('close', () => handleClose(server));
    server.addEventListener('error', () => handleClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const id = env.LOBBY.idFromName('global');
      return env.LOBBY.get(id).fetch(request);
    }
    // Mint short-lived Cloudflare TURN credentials so voice relays through a
    // reliable TURN server — required for peers on cellular / strict NAT, where
    // a direct (STUN-only) connection is impossible. CORS-open so the static
    // Pages/P2P build can fetch these cross-origin too.
    if (url.pathname === '/turn') {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      };
      const json = (body, status = 200) =>
        new Response(body, { status, headers: { 'Content-Type': 'application/json', ...cors } });
      if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json('{"iceServers":[]}');
      try {
        const r = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl: 86400 }),
          },
        );
        return json(await r.text(), r.ok ? 200 : r.status);
      } catch {
        return json('{"iceServers":[]}');
      }
    }
    return env.ASSETS.fetch(request);
  },
};
