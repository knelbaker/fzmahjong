import { GameState } from './core/GameState.js';
import { GameController } from './engine/GameController.js';
import { Renderer } from './ui/Renderer.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize core game state
  const state = new GameState();
  
  let renderer = null;

  // 2. Initialize controller with state and a callback that triggers the renderer
  const controller = new GameController(state, (updatedState, logMessage) => {
    if (renderer) {
      renderer.render(logMessage);
    }
  });

  // 3. Initialize the renderer
  renderer = new Renderer(controller);

  // 4. Run initial render to draw the empty board (behind splash screen)
  renderer.render('Press Start Game to play Fuzhounese Mahjong.');
});
