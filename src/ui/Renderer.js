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

    // Sidebar DOM Cache
    this.sidebar = document.getElementById('chat-sidebar');
    this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    this.sidebarBadge = document.getElementById('sidebar-badge');
    this.tabBtnLogs = document.getElementById('tab-btn-logs');
    this.tabBtnChat = document.getElementById('tab-btn-chat');
    this.tabContentLogs = document.getElementById('tab-content-logs');
    this.tabContentChat = document.getElementById('tab-content-chat');
    this.logList = document.getElementById('log-list');
    this.chatList = document.getElementById('chat-list');
    this.chatInput = document.getElementById('chat-input');
    this.btnSendChat = document.getElementById('btn-send-chat');

    // Sidebar state & history
    this.logHistory = [];
    this.chatHistory = [];
    this.unreadCount = 0;
    this.currentTab = 'logs';

    // Newly drawn tile tracking
    this.newlyDrawnTileId = null;
    this.prevPrivateHandIds = [];

    this.initEventListeners();
    this.initSidebarEvents();
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
      if (this.socketClient && this.socketClient.isMultiplayer) {
        this.socketClient.startGame();
      } else if (this.controller) {
        this.controller.startNewHand();
      }
    });
  }

  /**
   * Initializes Sidebar UI events (Toggle, tab switches, text chat & predefined clicks).
   */
  initSidebarEvents() {
    if (!this.sidebar) return;

    // Toggle sidebar collapsed state
    this.btnToggleSidebar.addEventListener('click', () => {
      this.sidebar.classList.toggle('collapsed');
      if (!this.sidebar.classList.contains('collapsed')) {
        this.unreadCount = 0;
        this.sidebarBadge.textContent = '0';
        this.sidebarBadge.classList.add('hidden');
        
        setTimeout(() => {
          this.logList.scrollTop = this.logList.scrollHeight;
          this.chatList.scrollTop = this.chatList.scrollHeight;
        }, 100);
      }
    });

    // Tab switching
    const switchTab = (tabName) => {
      this.currentTab = tabName;
      if (tabName === 'logs') {
        this.tabBtnLogs.classList.add('active');
        this.tabBtnChat.classList.remove('active');
        this.tabContentLogs.classList.remove('hidden');
        this.tabContentChat.classList.add('hidden');
        this.logList.scrollTop = this.logList.scrollHeight;
      } else {
        this.tabBtnChat.classList.add('active');
        this.tabBtnLogs.classList.remove('active');
        this.tabContentChat.classList.remove('hidden');
        this.tabContentLogs.classList.add('hidden');
        this.chatList.scrollTop = this.chatList.scrollHeight;
        
        // Reset unreadCount and hide badge when switching to the Chat tab
        if (!this.sidebar.classList.contains('collapsed')) {
          this.unreadCount = 0;
          this.sidebarBadge.textContent = '0';
          this.sidebarBadge.classList.add('hidden');
        }
      }
    };

    this.tabBtnLogs.addEventListener('click', () => switchTab('logs'));
    this.tabBtnChat.addEventListener('click', () => switchTab('chat'));

    // Send chat button
    this.btnSendChat.addEventListener('click', () => this.sendChatFromUI());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatFromUI();
      }
    });

    // Quick reactions
    const quickReactBtns = this.sidebar.querySelectorAll('.quick-react-btn');
    quickReactBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        if (msg) {
          this.sendChat(msg);
        }
      });
    });
  }

  sendChat(msg) {
    if (!msg || !msg.trim()) return;
    
    if (this.socketClient && this.socketClient.isMultiplayer) {
      this.socketClient.sendChatMessage(msg);
    } else {
      // Single Player Mode local message
      this.addChatMessage({
        senderName: 'You',
        senderSeatIndex: 0,
        message: msg,
        isSelf: true,
        timestamp: Date.now()
      });

      this.triggerBotReplies(msg);
    }
  }

  sendChatFromUI() {
    const msg = this.chatInput.value.trim();
    if (!msg) return;
    this.chatInput.value = '';
    this.sendChat(msg);
  }

  triggerBotReplies(playerMsg) {
    const randBotIdx = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
    const botPlayer = this.state.players[randBotIdx];
    if (!botPlayer) return;

    const botName = botPlayer.name;

    const chenPhrases = [
      "I'm going to win this hand, just watch!",
      "Stop talking and discard a tile!",
      "Do you have the Jin? I bet you do.",
      "Your discards are way too safe. Boring!",
      "I will Pung the next tile you throw.",
      "Just wait... my hand is getting perfect."
    ];

    const linPhrases = [
      "Let's play carefully.",
      "Good game so far, everyone.",
      "Fuzhou Mahjong is a game of patience and skill.",
      "I am analyzing your discards closely.",
      "May the best player win today.",
      "Ah, that was a strategic discard."
    ];

    const wongPhrases = [
      "Oh my god! I only need one more tile to Hu!",
      "Did someone discard a flower? I want it!",
      "No Jins for me yet... where are they hiding?",
      "What a beautiful tile you just discarded!",
      "I'm sweating! This match is intense.",
      "Is it my turn yet? I can't wait!"
    ];

    let phrases = linPhrases;
    if (randBotIdx === 1) phrases = chenPhrases;
    else if (randBotIdx === 3) phrases = wongPhrases;

    if (Math.random() < 0.75) {
      const delay = 800 + Math.random() * 800;
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];

      setTimeout(() => {
        this.addChatMessage({
          senderName: botName,
          senderSeatIndex: randBotIdx,
          message: phrase,
          isSelf: false,
          isBot: true,
          timestamp: Date.now()
        });
      }, delay);
    }
  }

  checkActionForBotChat(logMessage) {
    if (this.socketClient && this.socketClient.isMultiplayer) return;
    if (!this.state || !this.state.players) return;

    const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Find which bot (indices 1, 2, 3) is mentioned in the log message
    const botIdx = this.state.players.findIndex((p, idx) => idx > 0 && logMessage.includes(p.name));
    if (botIdx <= 0) return;

    const botName = this.state.players[botIdx].name;

    if (logMessage.includes('declares PUNG') || logMessage.includes('declares CHOW') || logMessage.includes('declares KONG')) {
      const actionType = logMessage.includes('PUNG') ? 'PUNG' : (logMessage.includes('KONG') ? 'KONG' : 'CHOW');
      let text = '';
      if (actionType === 'PUNG') {
        text = randChoice([
          "PUNG! Yes, thank you for that tile!",
          "碰! Exactly what I needed.",
          "Nice, that PUNG advances my hand a lot."
        ]);
      } else if (actionType === 'KONG') {
        text = randChoice([
          "KONG (杠)! I get a replacement from the back of the wall.",
          "杠! Watch out, my scoring multiplier is growing!",
          "Ah, Kong! Let's see my replacement card."
        ]);
      } else {
        text = randChoice([
          "CHOW (吃)! Thank you.",
          "吃! I'll eat that."
        ]);
      }
      
      setTimeout(() => {
        this.addChatMessage({
          senderName: botName,
          senderSeatIndex: botIdx,
          message: text,
          isSelf: false,
          isBot: true,
          timestamp: Date.now()
        });
      }, 600 + Math.random() * 600);
    } else if (logMessage.includes('won by') || logMessage.includes('HU')) {
      const text = randChoice([
        "HU! I win! Excellent game.",
        "胡! That's a winning hand for me!",
        "Haha, I won! Better luck next deal."
      ]);
      setTimeout(() => {
        this.addChatMessage({
          senderName: botName,
          senderSeatIndex: botIdx,
          message: text,
          isSelf: false,
          isBot: true,
          timestamp: Date.now()
        });
      }, 800);
    }
  }

  addLog(msg) {
    if (!msg || !msg.trim()) return;

    if (this.logHistory.length > 0 && this.logHistory[this.logHistory.length - 1] === msg) {
      return;
    }

    this.logHistory.push(msg);

    const el = document.createElement('div');
    
    let isHu = msg.includes('HU') || msg.includes('won') || msg.includes('WINNER');
    let isAction = msg.includes('discarded') || msg.includes('declared') || msg.includes('declares') || msg.includes('draws') || msg.includes('drew') || msg.includes('replacing');
    
    if (isHu) el.className = 'log-item hu';
    else if (isAction) el.className = 'log-item action';
    else el.className = 'log-item system';

    let formattedText = msg;
    const tileRegex = /(?:\[)?(character|dot|bamboo|wind|dragon|season|plant) (\d+)(?:\])?/gi;
    formattedText = formattedText.replace(tileRegex, (match, type, value) => {
      return this.createMiniTileHTML(type.toLowerCase(), value);
    });

    el.innerHTML = formattedText;
    this.logList.appendChild(el);
    this.logList.scrollTop = this.logList.scrollHeight;

    // Echo to console ticker at bottom
    this.consoleLogs.innerHTML = formattedText;

    // Game logs should not trigger notification badges
  }

  createMiniTileHTML(type, value) {
    const cdnBase = 'https://cdn.jsdelivr.net/gh/samoheen/mahjong-tiles@master/hongkong/svg/';
    let svgFile = '';
    const val = parseInt(value, 10);

    if (type === 'character') {
      const num = val + 7;
      const numStr = String(num).padStart(2, '0');
      svgFile = `${numStr}-characters-${val}.svg`;
    } else if (type === 'dot') {
      const num = val + 16;
      const numStr = String(num).padStart(2, '0');
      svgFile = `${numStr}-circles-${val}.svg`;
    } else if (type === 'bamboo') {
      const num = val + 25;
      const numStr = String(num).padStart(2, '0');
      svgFile = `${numStr}-bamboos-${val}.svg`;
    } else if (type === 'wind') {
      const windFiles = ['04-east-wind.svg', '05-south-wind.svg', '06-west-wind.svg', '07-north-wind.svg'];
      svgFile = windFiles[val - 1];
    } else if (type === 'dragon') {
      const dragonFiles = ['03-red-dragon.svg', '02-green-dragon.svg', '01-white-dragon.svg'];
      svgFile = dragonFiles[val - 1];
    } else if (type === 'season') {
      const seasonFiles = ['35-spring.svg', '36-summer.svg', '37-autumn.svg', '38-winter.svg'];
      svgFile = seasonFiles[val - 1];
    } else if (type === 'plant') {
      const plantFiles = ['39-plum.svg', '40-orchid.svg', '42-bamboo.svg', '41-chrysanthemum.svg'];
      svgFile = plantFiles[val - 1];
    }

    const tileName = getTileName({ type, value: val });
    if (svgFile) {
      return `<span class="inline-mini-tile" title="${tileName}"><img src="${cdnBase}${svgFile}" alt="${tileName}" /></span>`;
    }
    return `[${tileName}]`;
  }

  addChatMessage(data) {
    this.chatHistory.push(data);

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble-wrapper';

    if (data.isSelf) {
      wrapper.classList.add('self');
    } else if (data.isBot) {
      wrapper.classList.add('bot');
    } else {
      wrapper.classList.add('other');
    }

    const date = data.timestamp ? new Date(data.timestamp) : new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    meta.textContent = `${data.senderName} • ${timeStr}`;
    wrapper.appendChild(meta);

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = data.message;
    wrapper.appendChild(bubble);

    this.chatList.appendChild(wrapper);
    this.chatList.scrollTop = this.chatList.scrollHeight;

    soundManager.playChat();

    if (this.sidebar.classList.contains('collapsed') || this.currentTab !== 'chat') {
      this.unreadCount++;
      this.sidebarBadge.textContent = this.unreadCount;
      this.sidebarBadge.classList.remove('hidden');
    }
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
    // Detect newly drawn tile
    if (this.state) {
      const currentHand = this.state.players[0].hand.privateHand || [];
      if (this.state.phase === 'PLAYING' && this.state.currentPlayerIndex === 0) {
        if (this.prevPrivateHandIds && this.prevPrivateHandIds.length > 0) {
          const prevSet = new Set(this.prevPrivateHandIds);
          const newTile = currentHand.find(t => t && t.id && !prevSet.has(t.id));
          if (newTile) {
            this.newlyDrawnTileId = newTile.id;
          }
        }
      } else {
        this.newlyDrawnTileId = null;
      }

      if (this.newlyDrawnTileId && !currentHand.some(t => t && t.id === this.newlyDrawnTileId)) {
        this.newlyDrawnTileId = null;
      }
    }

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
    let wallCount = 144;
    if (this.state.wall) {
      if (typeof this.state.wall.getRemainingCount === 'function') {
        wallCount = this.state.wall.getRemainingCount();
      } else if (typeof this.state.wall.remainingCount === 'number') {
        wallCount = this.state.wall.remainingCount;
      } else if (this.state.wall.tiles) {
        wallCount = this.state.wall.tiles.length;
      }
    }
    this.hudWallCount.textContent = wallCount;
    this.hudStreak.textContent = this.state.lianzhuangCount;

    // Update scoreboard & player names
    for (let i = 0; i < 4; i++) {
      const player = this.state.players[i];
      const pScoreEl = document.getElementById(`score-p${i}`);
      const pPointsVal = pScoreEl.querySelector('.hud-points');
      pPointsVal.textContent = player.points;

      // Update top bar HUD name
      const nameHudEl = document.getElementById(`name-p${i}`);
      if (nameHudEl) {
        const diffText = player.isBot ? ` (${player.difficulty ? player.difficulty.charAt(0).toUpperCase() + player.difficulty.slice(1) : 'Medium'})` : '';
        nameHudEl.textContent = `${player.name}${diffText}:`;
      }

      // Update table zone profile name
      const tableNameEl = document.getElementById(`table-name-p${i}`);
      if (tableNameEl) {
        const diffText = player.isBot ? ` (${player.difficulty ? player.difficulty.charAt(0).toUpperCase() + player.difficulty.slice(1) : 'Medium'})` : '';
        tableNameEl.textContent = `${player.name}${diffText}`;
      }

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
        flowersRow.appendChild(this.createTileDOM(t, 'flower-tile'));
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
          group.appendChild(this.createTileDOM(t, 'meld-tile'));
        }
        meldsRow.appendChild(group);
      }

      // Render Discards
      const discardsPile = document.getElementById(`discards-p${i}`);
      discardsPile.innerHTML = '';
      for (const t of player.discards) {
        discardsPile.appendChild(this.createTileDOM(t, 'discard-tile'));
      }

      // Render Hands (closed or open)
      const handRow = document.getElementById(`hand-p${i}`);
      handRow.innerHTML = '';

      if (i === 0) {
        for (const t of player.hand.privateHand) {
          const tileEl = this.createTileDOM(t, '');
          if (t.id === this.newlyDrawnTileId) {
            tileEl.classList.add('newly-drawn-highlight');
            tileEl.addEventListener('mouseenter', () => {
              tileEl.classList.remove('newly-drawn-highlight');
              this.newlyDrawnTileId = null;
            }, { once: true });
          }
          tileEl.addEventListener('click', () => this.handleTileClick(t));
          handRow.appendChild(tileEl);
        }
      } else {
        // Bots hands (hidden unless game is over)
        const isGameOver = this.state.phase === GamePhase.GAME_OVER;
        for (const t of player.hand.privateHand) {
          if (isGameOver) {
            handRow.appendChild(this.createTileDOM(t, 'meld-tile')); // show small face-up
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

    // 6. Output log message to console ticker & sidebar log history
    if (logMessage) {
      this.addLog(logMessage);
      this.checkActionForBotChat(logMessage);
      
      // Play matching sounds based on log details
      if (logMessage.includes('discarded')) {
        soundManager.playDiscard();
      } else if (logMessage.includes('draws') || logMessage.includes('drew') || logMessage.includes('replacing') || logMessage.includes('turn to play')) {
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

    // Store current private hand tile IDs for next render comparison
    if (this.state && this.state.players && this.state.players[0] && this.state.players[0].hand) {
      this.prevPrivateHandIds = (this.state.players[0].hand.privateHand || []).map(t => t.id);
    } else {
      this.prevPrivateHandIds = [];
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
    const p = this.state.players[0];
    const discTile = this.state.discardedTile;
    const jinTemplate = this.state.wall?.jinTile;

    this.actionHud.classList.add('hidden'); // Hide HUD immediately

    if (this.state.phase === GamePhase.PLAYING) {
      if (this.socketClient && this.socketClient.isMultiplayer) {
        this.socketClient.declareAction(action);
        return;
      }
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
      if (action === 'chow') {
        const chows = RulesEngine.canChow(p.hand, discTile, jinTemplate, true);
        if (chows.length === 1) {
          const chowMeld = [discTile, ...chows[0]];
          if (this.socketClient && this.socketClient.isMultiplayer) {
            this.socketClient.declareAction('chow', chowMeld);
          } else {
            this.controller.handleHumanReaction('chow', chowMeld);
          }
        } else if (chows.length > 1) {
          this.showChowOptions(chows, discTile);
        } else {
          if (this.socketClient && this.socketClient.isMultiplayer) {
            this.socketClient.declareAction('chow');
          }
        }
        return;
      }

      if (this.socketClient && this.socketClient.isMultiplayer) {
        this.socketClient.declareAction(action);
        return;
      }

      if (action === 'pass') {
        this.controller.handleHumanReaction('pass');
      } else if (action === 'hu') {
        this.controller.handleHumanReaction('hu');
      } else if (action === 'pung') {
        this.controller.handleHumanReaction('pung');
      } else if (action === 'kong') {
        this.controller.handleHumanReaction('kong');
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
        optGroup.appendChild(this.createTileDOM(t, 'discard-tile'));
      }

      optGroup.addEventListener('click', () => {
        this.chowSelector.classList.add('hidden');
        if (this.socketClient && this.socketClient.isMultiplayer) {
          this.socketClient.declareAction('chow', tilesToDisplay);
        } else {
          this.controller.handleHumanReaction('chow', tilesToDisplay);
        }
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

      const diffText = winner.isBot ? ` (${winner.difficulty ? winner.difficulty.charAt(0).toUpperCase() + winner.difficulty.slice(1) : 'Medium'})` : '';
      winnerName.textContent = `${winner.name}${diffText} wins!`;
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
