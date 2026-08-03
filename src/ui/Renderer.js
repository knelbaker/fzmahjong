import { GamePhase } from '../core/GameState.js';
import { RulesEngine } from '../core/RulesEngine.js';
import { soundManager } from './SoundManager.js';
import { isFlower, getTileName } from '../core/Tile.js';

export class Renderer {
  constructor(controller, socketClient = null) {
    this.controller = controller;
    this.state = controller ? controller.state : null;
    this.socketClient = socketClient;
    this.selectedChowOption = null;

    // Cache DOM Elements
    this.hudWind = document.getElementById('stat-wind');
    this.hudDeal = document.getElementById('stat-deal');
    this.hudWallCount = document.getElementById('stat-wall-count');
    this.hudStreak = document.getElementById('stat-streak');
    
    this.consoleLogs = document.getElementById('console-logs');
    
    this.actionHud = document.getElementById('action-hud');
    this.btnPass = document.getElementById('btn-pass');
    this.btnChow = document.getElementById('btn-chow');
    this.btnPung = document.getElementById('btn-pung');
    this.btnKong = document.getElementById('btn-kong');
    this.btnHu = document.getElementById('btn-hu');

    this.chowSelector = document.getElementById('chow-selector');
    this.chowOptionsList = document.getElementById('chow-options-list');
    this.btnCancelChow = document.getElementById('btn-cancel-chow');

    this.resultsModal = document.getElementById('results-modal');
    this.btnNextDeal = document.getElementById('btn-next-deal');

    this.initEventListeners();
  }

  /**
   * Binds UI interactions.
   */
  initEventListeners() {
    // Start Game overlay
    const startOverlay = document.getElementById('start-overlay');
    const startGameBtn = document.getElementById('start-game-btn');
    const gameContainer = document.getElementById('game-container');

    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        soundManager.playAction(); // Warm up Web Audio
        if (startOverlay) startOverlay.classList.add('hidden');
        if (gameContainer) gameContainer.classList.remove('hidden');
        if (this.controller) this.controller.startNewHand();
      });
    }

    // Control HUD action buttons
    this.btnPass.addEventListener('click', () => this.handleActionClick('pass'));
    this.btnChow.addEventListener('click', () => this.handleActionClick('chow'));
    this.btnPung.addEventListener('click', () => this.handleActionClick('pung'));
    this.btnKong.addEventListener('click', () => this.handleActionClick('kong'));
    this.btnHu.addEventListener('click', () => this.handleActionClick('hu'));

    this.btnCancelChow.addEventListener('click', () => {
      this.chowSelector.classList.add('hidden');
      this.updateActionHUD();
    });

    // Results modal
    this.btnNextDeal.addEventListener('click', () => {
      this.resultsModal.classList.add('hidden');
      this.controller.startNewHand();
    });
  }

  /**
   * Helper to create a tile DOM element.
   */
  createTileDOM(tile, sizeClass = '') {
    const el = document.createElement('div');
    el.className = `tile ${sizeClass}`;
    el.dataset.id = tile.id;
    el.dataset.suit = tile.type;
    el.dataset.value = tile.value;

    const isJin = RulesEngine.isJin(tile, this.state.wall?.jinTile);
    if (isJin) {
      el.classList.add('jin-wildcard');
    }

    const cdnBase = 'https://cdn.jsdelivr.net/gh/samoheen/mahjong-tiles@master/hongkong/svg/';
    let svgFile = '';

    if (tile.type === 'character') {
      const num = tile.value + 7;
      const numStr = String(num).padStart(2, '0');
      svgFile = `${numStr}-characters-${tile.value}.svg`;
    } else if (tile.type === 'dot') {
      const num = tile.value + 16;
      const numStr = String(num).padStart(2, '0');
      svgFile = `${numStr}-circles-${tile.value}.svg`;
    } else if (tile.type === 'bamboo') {
      const num = tile.value + 25;
      const numStr = String(num).padStart(2, '0');
      svgFile = `${numStr}-bamboos-${tile.value}.svg`;
    } else if (tile.type === 'wind') {
      const windFiles = ['04-east-wind.svg', '05-south-wind.svg', '06-west-wind.svg', '07-north-wind.svg'];
      svgFile = windFiles[tile.value - 1];
    } else if (tile.type === 'dragon') {
      const dragonFiles = ['03-red-dragon.svg', '02-green-dragon.svg', '01-white-dragon.svg'];
      svgFile = dragonFiles[tile.value - 1];
    } else if (tile.type === 'season') {
      const seasonFiles = ['35-spring.svg', '36-summer.svg', '37-autumn.svg', '38-winter.svg'];
      svgFile = seasonFiles[tile.value - 1];
    } else if (tile.type === 'plant') {
      const plantFiles = ['39-plum.svg', '40-orchid.svg', '42-bamboo.svg', '41-chrysanthemum.svg'];
      svgFile = plantFiles[tile.value - 1];
    }

    let faceContent = '';
    if (svgFile) {
      faceContent = `<img src="${cdnBase}${svgFile}" alt="${getTileName(tile)}" />`;
    }

    el.innerHTML = faceContent;
    return el;
  }

  /**
   * Main rendering routine. Triggered on state updates.
   */
  render(logMessage = '') {
    // --- FLIP First Phase: Capture positions of all existing tiles in play ---
    const previousRects = new Map();
    // Select all tiles inside player zones and discard piles
    const oldTiles = document.querySelectorAll('.player-zone .tile[data-id], .discard-pile .tile[data-id]');
    for (const tileEl of oldTiles) {
      const id = tileEl.dataset.id;
      if (id) {
        previousRects.set(id, tileEl.getBoundingClientRect());
      }
    }

    // 1. Update stats dashboard
    const winds = ['East', 'South', 'West', 'North'];
    this.hudWind.textContent = winds[this.state.windRound - 1];
    this.hudDeal.textContent = this.state.dealCount;
    this.hudWallCount.textContent = this.state.wall ? this.state.wall.getRemainingCount() : 144;
    this.hudStreak.textContent = this.state.lianzhuangCount;

    // Update scoreboard
    for (let i = 0; i < 4; i++) {
      const pScoreEl = document.getElementById(`score-p${i}`);
      const pPointsVal = pScoreEl.querySelector('.hud-points');
      pPointsVal.textContent = this.state.players[i].points;

      if (i === this.state.dealerIndex) {
        pScoreEl.classList.add('active-dealer');
      } else {
        pScoreEl.classList.remove('active-dealer');
      }
    }

    // 2. Compass directions highlight
    for (let i = 0; i < 4; i++) {
      const compDir = document.getElementById(`compass-p${i}`);
      if (i === this.state.currentPlayerIndex) {
        compDir.classList.add('active');
      } else {
        compDir.classList.remove('active');
      }
    }

    // 3. Render Jin indicator and wildcard tiles
    const indicatorBox = document.getElementById('jin-indicator-card');
    const wildcardBox = document.getElementById('jin-wildcard-card');

    if (this.state.wall?.jinIndicator) {
      indicatorBox.className = 'indicator-tile-render';
      indicatorBox.innerHTML = '';
      indicatorBox.appendChild(this.createTileDOM(this.state.wall.jinIndicator, ''));

      wildcardBox.className = 'indicator-tile-render is-jin-glow';
      wildcardBox.innerHTML = '';
      wildcardBox.appendChild(this.createTileDOM(this.state.wall.jinTile, ''));
    } else {
      indicatorBox.className = 'indicator-tile-render empty-slot';
      indicatorBox.textContent = '-';
      wildcardBox.className = 'indicator-tile-render empty-slot';
      wildcardBox.textContent = '-';
    }

    // 4. Render all players' zones (hands, melds, flowers, discards)
    for (let i = 0; i < 4; i++) {
      const player = this.state.players[i];
      
      // Highlight active turn profile
      const pZone = document.getElementById(`zone-p${i}`);
      if (this.state.currentPlayerIndex === i && this.state.phase === GamePhase.PLAYING) {
        pZone.classList.add('active-turn');
      } else {
        pZone.classList.remove('active-turn');
      }

      // Dealer badge
      const profile = pZone.querySelector('.opponent-profile');
      const dIcon = profile.querySelector('.dealer-icon');
      if (i === this.state.dealerIndex) {
        dIcon.classList.remove('hidden');
      } else {
        dIcon.classList.add('hidden');
      }

      // Render Flowers
      const flowersRow = document.getElementById(`flowers-p${i}`);
      flowersRow.innerHTML = '';
      for (const t of player.hand.flowers) {
        flowersRow.appendChild(this.createTileDOM(t, 'flowers-row'));
      }

      // Render Melds
      const meldsRow = document.getElementById(`melds-p${i}`);
      meldsRow.innerHTML = '';
      for (const meld of player.hand.melds) {
        // Group each meld visually by wrapping it in a border-block
        const group = document.createElement('div');
        group.style.display = 'flex';
        group.style.gap = '2px';
        group.style.padding = '0 2px';
        for (const t of meld.tiles) {
          group.appendChild(this.createTileDOM(t, 'melds-row'));
        }
        meldsRow.appendChild(group);
      }

      // Render Discards
      const discardsPile = document.getElementById(`discards-p${i}`);
      discardsPile.innerHTML = '';
      for (const t of player.discards) {
        discardsPile.appendChild(this.createTileDOM(t, 'discard-pile'));
      }

      // Render Hands (closed or open)
      const handRow = document.getElementById(`hand-p${i}`);
      handRow.innerHTML = '';

      if (i === 0) {
        // Human player hand (always visible, interactive)
        for (const t of player.hand.privateHand) {
          const tileEl = this.createTileDOM(t, '');
          tileEl.addEventListener('click', () => this.handleTileClick(t));
          handRow.appendChild(tileEl);
        }
      } else {
        // Bots hands (hidden unless game is over)
        const isGameOver = this.state.phase === GamePhase.GAME_OVER;
        for (const t of player.hand.privateHand) {
          if (isGameOver) {
            handRow.appendChild(this.createTileDOM(t, 'melds-row')); // show small face-up
          } else {
            // Render closed backs
            const backEl = document.createElement('div');
            backEl.className = 'tile';
            backEl.dataset.id = t.id; // Assign unique tile ID for movement tracking
            handRow.appendChild(backEl);
          }
        }
      }
    }

    // 5. Render Control HUD (Action overlays)
    this.updateActionHUD();

    // 6. Output log message to console ticker
    if (logMessage) {
      this.consoleLogs.textContent = logMessage;
      
      // Play matching sounds based on log details
      if (logMessage.includes('discarded')) {
        soundManager.playDiscard();
      } else if (logMessage.includes('draws') || logMessage.includes('replacing')) {
        soundManager.playDraw();
      } else if (logMessage.includes('declares PUNG') || logMessage.includes('declares CHOW') || logMessage.includes('declares KONG')) {
        soundManager.playAction();
      } else if (logMessage.includes('won') || logMessage.includes('HU')) {
        soundManager.playHu();
      } else if (logMessage.includes('flower')) {
        soundManager.playFlower();
      }
    }

    // 7. Render Game Over overlay if finished
    if (this.state.phase === GamePhase.GAME_OVER) {
      this.showGameOverModal();
    }

    // --- FLIP Play Phase: Measure new positions and execute animations ---
    const newTileElements = document.querySelectorAll('.player-zone .tile[data-id], .discard-pile .tile[data-id]');
    
    // Find the center of the mahjong table to deal new cards from
    const tableEl = document.querySelector('.mahjong-table');
    const tableRect = tableEl ? tableEl.getBoundingClientRect() : null;
    const tableCenterX = tableRect ? tableRect.left + tableRect.width / 2 : window.innerWidth / 2;
    const tableCenterY = tableRect ? tableRect.top + tableRect.height / 2 : window.innerHeight / 2;

    // Count how many tiles are brand new (so we can stagger their deal animation)
    let newTileCount = 0;
    for (const tileEl of newTileElements) {
      if (tileEl.dataset.id && !previousRects.has(tileEl.dataset.id)) {
        newTileCount++;
      }
    }

    let newTileIndex = 0;
    for (const tileEl of newTileElements) {
      const id = tileEl.dataset.id;
      if (!id) continue;

      const newRect = tileEl.getBoundingClientRect();
      const previousRect = previousRects.get(id);

      if (previousRect) {
        // Tile was already on screen. Calculate center points in viewport coordinate space
        const prevCenterX = previousRect.left + previousRect.width / 2;
        const prevCenterY = previousRect.top + previousRect.height / 2;
        const newCenterX = newRect.left + newRect.width / 2;
        const newCenterY = newRect.top + newRect.height / 2;

        const deltaCenterX = prevCenterX - newCenterX;
        const deltaCenterY = prevCenterY - newCenterY;
        const scaleX = previousRect.width / newRect.width;
        const scaleY = previousRect.height / newRect.height;

        // Skip animating if position and size are virtually unchanged
        if (Math.abs(deltaCenterX) < 0.5 && Math.abs(deltaCenterY) < 0.5 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) {
          continue;
        }

        // Adjust deltas and scale dimensions based on parent rotations
        let localDeltaX, localDeltaY, localScaleX, localScaleY;
        if (tileEl.closest('.left-zone') || tileEl.closest('.left-pile')) {
          // Parent is rotated 90deg clockwise
          localDeltaX = deltaCenterY;
          localDeltaY = -deltaCenterX;
          localScaleX = scaleY;
          localScaleY = scaleX;
        } else if (tileEl.closest('.right-zone') || tileEl.closest('.right-pile')) {
          // Parent is rotated -90deg (270deg) counter-clockwise
          localDeltaX = -deltaCenterY;
          localDeltaY = deltaCenterX;
          localScaleX = scaleY;
          localScaleY = scaleX;
        } else {
          // Unrotated (player-0 hand, top-zone bot-2, and unrotated discard piles)
          localDeltaX = deltaCenterX;
          localDeltaY = deltaCenterY;
          localScaleX = scaleX;
          localScaleY = scaleY;
        }

        const originalTransition = tileEl.style.transition;
        tileEl.style.transition = 'none';
        tileEl.style.zIndex = '50';

        const anim = tileEl.animate([
          {
            transform: `translate(${localDeltaX}px, ${localDeltaY}px) scale(${localScaleX}, ${localScaleY})`,
            transformOrigin: 'center',
          },
          {
            transform: 'none',
            transformOrigin: 'center',
          }
        ], {
          duration: 350,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
        });

        anim.onfinish = () => {
          tileEl.style.transition = originalTransition;
          tileEl.style.zIndex = '';
          anim.cancel(); // remove active transform overlays to allow CSS hovers
        };
      } else {
        // Brand new tile (drawn from wall). Animate deals from center of the table.
        // Stagger the deal if many cards are dealt at once (initial deal).
        const delay = newTileCount > 10 ? newTileIndex * 15 : 0;
        newTileIndex++;

        const deltaX = tableCenterX - newRect.left - newRect.width / 2;
        const deltaY = tableCenterY - newRect.top - newRect.height / 2;

        // Map viewport coordinate offsets to parent local coordinates for rotated bots and piles
        let localDeltaX, localDeltaY;
        if (tileEl.closest('.left-zone') || tileEl.closest('.left-pile')) {
          localDeltaX = deltaY;
          localDeltaY = -deltaX;
        } else if (tileEl.closest('.right-zone') || tileEl.closest('.right-pile')) {
          localDeltaX = -deltaY;
          localDeltaY = deltaX;
        } else {
          localDeltaX = deltaX;
          localDeltaY = deltaY;
        }

        const originalTransition = tileEl.style.transition;
        tileEl.style.transition = 'none';

        const anim = tileEl.animate([
          {
            transform: `translate(${localDeltaX}px, ${localDeltaY}px) scale(0.2)`,
            transformOrigin: 'center',
            opacity: 0
          },
          {
            transform: 'none',
            transformOrigin: 'center',
            opacity: 1
          }
        ], {
          duration: 400,
          delay: delay,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
          fill: 'backwards' // keeps tile hidden at table center during staggered delay
        });

        anim.onfinish = () => {
          tileEl.style.transition = originalTransition;
          anim.cancel(); // reset properties to normal layout
        };
      }
    }
  }

  /**
   * Refreshes buttons in the floating action panel.
   */
  updateActionHUD() {
    const isPlayerTurn = this.state.currentPlayerIndex === 0;
    const isPlaying = this.state.phase === GamePhase.PLAYING;
    const isWaitingReaction = this.state.phase === GamePhase.WAITING_FOR_ACTION;
    const jinTemplate = this.state.wall?.jinTile;

    this.btnPass.classList.add('hidden');
    this.btnChow.classList.add('hidden');
    this.btnPung.classList.add('hidden');
    this.btnKong.classList.add('hidden');
    this.btnHu.classList.add('hidden');

    if (isPlaying && isPlayerTurn) {
      // 1. Player's turn: check for self-declared actions (Self-Hu, An Kong, Bu Kong)
      const p = this.state.players[0];

      // Can self-Hu?
      const canHu = RulesEngine.checkHu(p.hand, null, jinTemplate, true).hu;
      if (canHu) {
        this.btnHu.classList.remove('hidden');
      }

      // Can declare An Kong or Bu Kong?
      const anKongs = RulesEngine.checkAnKongs(p.hand, jinTemplate);
      const buKongs = RulesEngine.checkBuKongs(p.hand, jinTemplate);
      if (anKongs.length > 0 || buKongs.length > 0) {
        this.btnKong.classList.remove('hidden');
      }

      // If either can be triggered, show the HUD (Pass is hidden since they must choose or discard)
      if (canHu || anKongs.length > 0 || buKongs.length > 0) {
        this.actionHud.classList.remove('hidden');
        this.btnPass.classList.add('hidden'); // No pass on own turn (can just click card to discard)
      } else {
        this.actionHud.classList.add('hidden');
      }

    } else if (isWaitingReaction) {
      // 2. Reaction to discard: check if human player can claim
      const p = this.state.players[0];
      const discTile = this.state.discardedTile;
      const isNext = this.state.currentPlayerIndex === 3; // Human index 0 is next to Bot 3 index 3

      const canHu = RulesEngine.checkHu(p.hand, discTile, jinTemplate, false).hu;
      const canKong = RulesEngine.canKong(p.hand, discTile, jinTemplate);
      const canPung = RulesEngine.canPung(p.hand, discTile, jinTemplate);
      const chows = RulesEngine.canChow(p.hand, discTile, jinTemplate, isNext);

      let anyAction = false;
      if (canHu) { this.btnHu.classList.remove('hidden'); anyAction = true; }
      if (canKong) { this.btnKong.classList.remove('hidden'); anyAction = true; }
      if (canPung) { this.btnPung.classList.remove('hidden'); anyAction = true; }
      if (chows.length > 0) { this.btnChow.classList.remove('hidden'); anyAction = true; }

      if (anyAction) {
        this.btnPass.classList.remove('hidden');
        this.actionHud.classList.remove('hidden');
      } else {
        this.actionHud.classList.add('hidden');
      }
    } else {
      this.actionHud.classList.add('hidden');
    }
  }

  /**
   * Triggered when a tile in the human player's hand is clicked.
   */
  handleTileClick(tile) {
    if (this.socketClient && this.socketClient.isMultiplayer) {
      this.socketClient.discardTile(tile.id);
      return;
    }

    if (this.state.phase !== GamePhase.PLAYING || this.state.currentPlayerIndex !== 0) {
      return; // Not your turn
    }

    const p = this.state.players[0];
    const openMelds = p.hand.melds.length;
    const expectedHandSize = 17 - 3 * openMelds;

    // Player must have drawn a tile (hand size 17/14/11 etc.) to discard
    if (p.hand.privateHand.length !== expectedHandSize) {
      return;
    }

    this.controller.executeDiscard(0, tile);
  }

  /**
   * Triggered when an action HUD button is clicked.
   */
  handleActionClick(action) {
    if (this.socketClient && this.socketClient.isMultiplayer) {
      this.actionHud.classList.add('hidden');
      this.socketClient.declareAction(action);
      return;
    }

    const p = this.state.players[0];
    const discTile = this.state.discardedTile;
    const jinTemplate = this.state.wall.jinTile;

    this.actionHud.classList.add('hidden'); // Hide HUD immediately

    if (this.state.phase === GamePhase.PLAYING) {
      // 1. Actions on own turn
      if (action === 'hu') {
        const type = RulesEngine.checkHu(p.hand, null, jinTemplate, true).type;
        this.controller.declareWin(0, null, type, true);
      } else if (action === 'kong') {
        // Can be An Kong or Bu Kong
        const anKongs = RulesEngine.checkAnKongs(p.hand, jinTemplate);
        const buKongs = RulesEngine.checkBuKongs(p.hand, jinTemplate);
        
        if (anKongs.length > 0) {
          this.controller.declareSelfKong(anKongs[0], true);
        } else if (buKongs.length > 0) {
          this.controller.declareSelfKong(buKongs[0], false);
        }
      }
    } else if (this.state.phase === GamePhase.WAITING_FOR_ACTION) {
      // 2. Reactions on discard
      if (action === 'pass') {
        this.controller.handleHumanReaction('pass');
      } else if (action === 'hu') {
        this.controller.handleHumanReaction('hu');
      } else if (action === 'pung') {
        this.controller.handleHumanReaction('pung');
      } else if (action === 'kong') {
        this.controller.handleHumanReaction('kong');
      } else if (action === 'chow') {
        const chows = RulesEngine.canChow(p.hand, discTile, jinTemplate, true);
        if (chows.length === 1) {
          // Only one combination possible, proceed immediately
          this.controller.handleHumanReaction('chow', [discTile, ...chows[0]]);
        } else if (chows.length > 1) {
          // Multiple options, open selector overlay
          this.showChowOptions(chows, discTile);
        }
      }
    }
  }

  /**
   * Renders the Chow selector overlay when multiple sequences can be built.
   */
  showChowOptions(combinations, discTile) {
    this.chowOptionsList.innerHTML = '';
    this.chowSelector.classList.remove('hidden');

    for (const comb of combinations) {
      const optGroup = document.createElement('div');
      optGroup.className = 'chow-opt-group';

      // Visualise the option
      const tilesToDisplay = [discTile, ...comb];
      for (const t of tilesToDisplay) {
        optGroup.appendChild(this.createTileDOM(t, 'discard-pile'));
      }

      optGroup.addEventListener('click', () => {
        this.chowSelector.classList.add('hidden');
        this.controller.handleHumanReaction('chow', tilesToDisplay);
      });

      this.chowOptionsList.appendChild(optGroup);
    }
  }

  /**
   * Populates and renders the End Game / Scoreboard Modal.
   */
  showGameOverModal() {
    const header = document.getElementById('results-header');
    const winnerName = document.getElementById('results-winner-name');
    const winDesc = document.getElementById('results-win-description');
    
    const baseCell = document.getElementById('score-base');
    const flowerCell = document.getElementById('score-flowers');
    const jinCell = document.getElementById('score-jins');
    const kongCell = document.getElementById('score-kongs');
    const dealerCell = document.getElementById('score-dealer-streak');
    const subtotalCell = document.getElementById('score-subtotal');
    const multCell = document.getElementById('score-multiplier');
    const totalCell = document.getElementById('score-total');

    if (this.state.winnerIndex !== null) {
      const winner = this.state.players[this.state.winnerIndex];
      const details = this.state.winDetails;
      const breakdown = details.scoreBreakdown;

      header.textContent = this.state.winnerIndex === 0 ? 'VICTORY!' : 'GAME OVER';
      header.className = this.state.winnerIndex === 0 ? 'modal-badge-win' : 'modal-badge-win';
      if (this.state.winnerIndex !== 0) {
        header.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
      } else {
        header.style.background = 'linear-gradient(135deg, #10b981 0%, #047857 100%)';
      }

      winnerName.textContent = `${winner.name} wins!`;
      winDesc.textContent = `${details.isSelfDraw ? 'Self-drawn win (自摸)' : 'Win by discard (放炮胡)'} via ${this.getWinTypeLabel(details.winType)}`;

      // Fill values
      baseCell.textContent = breakdown.base;
      flowerCell.textContent = `+${breakdown.flowers}`;
      jinCell.textContent = `+${breakdown.jins}`;
      kongCell.textContent = `+${breakdown.kongs}`;
      dealerCell.textContent = `+${breakdown.dealerStreak}`;
      subtotalCell.textContent = breakdown.subtotal;
      
      let multLabel = `x${breakdown.multiplier}`;
      if (details.isSelfDraw) {
        multLabel += ` (x2 Self-draw x${breakdown.multiplier / 2} Hand)`;
      } else {
        multLabel += ` (${this.getWinTypeLabel(details.winType)})`;
      }
      multCell.textContent = multLabel;
      
      // If by discard, the discarder pays for all 3 players under Fuzhou Rules!
      const totalPointsEarned = breakdown.total * 3;
      totalCell.textContent = `${totalPointsEarned} points`;
    } else {
      // Flow / Draw
      header.textContent = 'DRAW (流局)';
      header.style.background = 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)';
      winnerName.textContent = '臭庄 (Flow)';
      winDesc.textContent = 'The wall is exhausted. No one wins this hand.';

      // Clear breakdown
      baseCell.textContent = '-';
      flowerCell.textContent = '-';
      jinCell.textContent = '-';
      kongCell.textContent = '-';
      dealerCell.textContent = '-';
      subtotalCell.textContent = '-';
      multCell.textContent = '-';
      totalCell.textContent = '0 points';
    }

    this.resultsModal.classList.remove('hidden');
  }

  /**
   * Helper to translate win types to Chinese/English labels.
   */
  getWinTypeLabel(type) {
    switch (type) {
      case 'SanJinDao': return 'San Jin Dao (三金倒)';
      case 'JinQue': return 'Jin Que (金雀)';
      case 'JinLong': return 'Jin Long (金龙)';
      case 'NoJin': return 'No Jin (无金)';
      case 'PingHu': return 'Ping Hu (平胡)';
      default: return 'Hu (胡)';
    }
  }
}
