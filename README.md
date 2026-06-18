# 🀄 HK Mahjong

Multiplayer Hong Kong Mahjong — Node.js WebSocket server + Phaser 3 client.
Real tile artwork (public-domain SVGs from Wikimedia Commons, by Cangjie6).
Empty seats are filled with bots when the host starts.

## ▶ Play now (live)

| Link | Mode |
|------|------|
| **[hk-mahjong.rawrben89.workers.dev](https://hk-mahjong.rawrben89.workers.dev)** | 🌐 Real-time multiplayer + bots |
| **[rawrben89.github.io/mahjong-game](https://rawrben89.github.io/mahjong-game/)** | 🤖 Solo vs bots (static, installable PWA) |

## Run locally

```sh
npm install
npm start            # → http://localhost:3000
```

Friends on the same Wi-Fi can join via the "Network" URL printed at startup.

## Play online (over the internet)

**Option A — Cloudflare Workers (free, permanent URL) — recommended.**
The game is fully ported to Cloudflare Workers + Durable Objects
(`worker.js` + `wrangler.jsonc`; game logic is shared via `game-core.js`).
This is what powers the live link above.

```sh
npx wrangler login     # one-time: opens browser, free Cloudflare account
npm run deploy         # → https://hk-mahjong.<your-subdomain>.workers.dev
```

On a headless/remote host where the browser login can't reach `localhost`,
authenticate with an API token instead:

```sh
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> npm run deploy
```

Free tier: 100k requests/day, WebSockets included, no sleeping.

**Option B — instant tunnel (no signup).** Run locally, then:

```sh
cloudflared tunnel --url http://localhost:3000   # or: npx ngrok http 3000
```

Share the printed `trycloudflare.com` URL. Lives only while your machine runs.

**Option C — any Node host (Render/Fly/Railway).** The server reads `PORT` and
serves HTTP + WebSocket on one port; `render.yaml` is included for Render's
Blueprint deploy.

WebSockets connect to `/ws` on the same origin (`wss://` on HTTPS), so no
extra setup is needed anywhere.
