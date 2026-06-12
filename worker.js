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
    return env.ASSETS.fetch(request);
  },
};
