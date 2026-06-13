// Loaded only on static hosts (GitHub Pages): runs the game engine in-browser
// so the game is playable solo vs bots without a WebSocket server.
import { attachPlayer, handleRaw } from './game-core.js';
window.__localCore = { attachPlayer, handleRaw };
