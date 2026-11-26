// Static-hosting entry point for the repository's root 4x4_trucker/index.html.
// The stylesheet is linked by that HTML file, so this entry only starts the game.
import { createGame } from './game/game.js';

createGame();
