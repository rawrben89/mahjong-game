// Loaded only on static hosts (GitHub Pages): runs the game engine in-browser
// so the host's tab acts as the authoritative server for solo + P2P play.
import { attachPlayer, handleRaw, handleClose } from './game-core.js';
window.__localCore = { attachPlayer, handleRaw, handleClose };
