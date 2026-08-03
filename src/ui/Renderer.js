import { GamePhase } from '../core/GameState.js';
import { RulesEngine } from '../core/RulesEngine.js';
import { soundManager } from './SoundManager.js';
import { isFlower, getTileName } from '../core/Tile.js';

export class Renderer {
  constructor(controller) {
    this.controller = controller;
    this.state = controller.state;
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

    startGameBtn.addEventListener('click', () => {
      soundManager.playAction(); // Warm up Web Audio
      startOverlay.classList.add('hidden');
      gameContainer.classList.remove('hidden');
      this.controller.startNewHand();
    });

    // Control HUD action buttons
    this.btnPass.addEventListener('click', () => this.handleActionClick('pass'));
    this.btnChow.addEventListener('click', () => this.handleActionClick('chow'));
    this.btnPung.addEventListener('click', () => this.handleActionClick('pung'));
    this.btnKong.addEventListener('click', () => this.handleActionClick('kong'));
    this.btnHu.addEventListener('click', () => this.handleActionClick('hu'));

    this.btnCancelChow.addEventListener('click', () => {
      this.chowSelector.classList.add('hidden');
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

    let faceContent = '';
    if (tile.type === 'character') {
      faceContent = `<span style="font-size:0.75rem;font-weight:600;margin-top:2px;">${tile.value}</span><span style="font-size:1.1rem;margin-top:-2px;">万</span>`;
    } else if (tile.type === 'dot') {
      faceContent = `<span style="font-size:0.75rem;font-weight:600;margin-top:2px;">${tile.value}</span><span style="font-size:1.1rem;margin-top:-2px;">筒</span>`;
    } else if (tile.type === 'bamboo') {
      faceContent = `<span style="font-size:0.75rem;font-weight:600;margin-top:2px;">${tile.value}</span><span style="font-size:1.1rem;margin-top:-2px;">条</span>`;
    } else if (tile.type === 'wind') {
      const winds = ['东', '南', '西', '北'];
      faceContent = `<span style="font-size:1.25rem;">${winds[tile.value - 1]}</span>`;
    } else if (tile.type === 'dragon') {
      const dragons = ['中', '发', '白'];
      const color = tile.value === 1 ? '#dc2626' : (tile.value === 2 ? '#16a34a' : '#2563eb');
      faceContent = `<span style="font-size:1.25rem;color:${color}">${dragons[tile.value - 1]}</span>`;
    } else if (tile.type === 'season') {
      const seasons = ['春', '夏', '秋', '冬'];
      faceContent = `<span style="font-size:0.6rem;color:#ea580c;text-transform:uppercase;">Seas</span><span style="font-size:0.95rem;font-weight:700;color:#ea580c;">${seasons[tile.value - 1]}</span>`;
    } else if (tile.type === 'plant') {
      const plants = ['梅', '兰', '竹', '菊'];
      faceContent = `<span style="font-size:0.6rem;color:#ea580c;text-transform:uppercase;">Flow</span><span style="font-size:0.95rem;font-weight:700;color:#ea580c;">${plants[tile.value - 1]}</span>`;
    }

    el.innerHTML = faceContent;
    return el;
  }

  /**
   * Main rendering routine. Triggered on state updates.
   */
  render(logMessage = '') {
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
