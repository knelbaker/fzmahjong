import { GameState } from './core/GameState.js';
import { GameController } from './engine/GameController.js';
import { Hand } from './core/Hand.js';
import { Renderer } from './ui/Renderer.js';
import { SocketClient } from './net/SocketClient.js';
import { soundManager } from './ui/SoundManager.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Single Player state & controller
  const state = new GameState();
  const socketClient = new SocketClient();
  let renderer = null;

  const controller = new GameController(state, (updatedState, logMessage) => {
    if (renderer) {
      renderer.state = updatedState;
      renderer.render(logMessage);
    }
  });

  // 2. Initialize Renderer with controller and socketClient
  renderer = new Renderer(controller, socketClient);
  renderer.render('Welcome to Fuzhounese Mahjong! Select a game mode to begin.');

  // DOM Elements
  const startOverlay = document.getElementById('start-overlay');
  const mpOverlay = document.getElementById('multiplayer-overlay');
  const gameContainer = document.getElementById('game-container');

  const btnModeSingle = document.getElementById('btn-mode-single');
  const btnModeMulti = document.getElementById('btn-mode-multi');

  const mpInitialForm = document.getElementById('mp-initial-form');
  const mpRoomView = document.getElementById('mp-room-view');
  const playerNameInput = document.getElementById('mp-player-name');

  const tabCreateRoom = document.getElementById('tab-create-room');
  const tabJoinRoom = document.getElementById('tab-join-room');
  const viewCreateRoom = document.getElementById('view-create-room');
  const viewJoinRoom = document.getElementById('view-join-room');

  const btnCreateSubmit = document.getElementById('btn-create-room-submit');
  const btnJoinSubmit = document.getElementById('btn-join-room-submit');
  const roomCodeInput = document.getElementById('mp-room-code-input');

  const displayRoomCode = document.getElementById('display-room-code');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const chkFillBots = document.getElementById('chk-fill-bots');

  const btnMpStartGame = document.getElementById('btn-mp-start-game');
  const btnMpLeaveRoom = document.getElementById('btn-mp-leave-room');
  const btnCloseMpModal = document.getElementById('btn-close-mp-modal');
  const roomCodeTag = document.getElementById('room-code-tag');
  const btnLeaveGame = document.getElementById('btn-leave-game');

  // --- 1. Mode Selection Handlers ---
  btnModeSingle.addEventListener('click', () => {
    soundManager.playAction();
    document.getElementById('landing-menu-view').classList.add('hidden');
    document.getElementById('sp-difficulty-view').classList.remove('hidden');
  });

  const btnSpDiffBack = document.getElementById('btn-sp-diff-back');
  if (btnSpDiffBack) {
    btnSpDiffBack.addEventListener('click', () => {
      soundManager.playAction();
      document.getElementById('sp-difficulty-view').classList.add('hidden');
      document.getElementById('landing-menu-view').classList.remove('hidden');
    });
  }

  const spDiffBtns = document.querySelectorAll('.sp-diff-btn');
  spDiffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      soundManager.playAction();
      const diff = btn.getAttribute('data-diff');
      for (let i = 1; i < 4; i++) {
        state.players[i].difficulty = diff;
      }
      // Hide overlays and transition to game board
      document.getElementById('sp-difficulty-view').classList.add('hidden');
      document.getElementById('landing-menu-view').classList.remove('hidden'); // Reset for next time
      startOverlay.classList.add('hidden');
      gameContainer.classList.remove('hidden');
      if (btnLeaveGame) {
        btnLeaveGame.textContent = 'Leave Game';
        btnLeaveGame.classList.remove('hidden');
      }
      controller.startNewHand();
    });
  });

  btnModeMulti.addEventListener('click', () => {
    soundManager.playAction();
    startOverlay.classList.add('hidden');
    mpOverlay.classList.remove('hidden');
    socketClient.init();
  });

  btnCloseMpModal.addEventListener('click', () => {
    mpOverlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
  });

  // --- Rules Page Handlers ---
  const rulesOverlay = document.getElementById('rules-overlay');
  const btnLandingRules = document.getElementById('btn-landing-rules');
  const btnOpenRules = document.getElementById('btn-open-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');
  const rulesTabBtns = document.querySelectorAll('.rules-tab-btn');
  const rulesTabContents = document.querySelectorAll('.rules-tab-content');

  const openRules = () => {
    soundManager.playAction();
    rulesOverlay.classList.remove('hidden');
  };

  const closeRules = () => {
    soundManager.playAction();
    rulesOverlay.classList.add('hidden');
  };

  if (btnLandingRules) {
    btnLandingRules.addEventListener('click', openRules);
  }
  if (btnOpenRules) {
    btnOpenRules.addEventListener('click', openRules);
  }
  if (btnCloseRules) {
    btnCloseRules.addEventListener('click', closeRules);
  }

  if (rulesOverlay) {
    rulesOverlay.addEventListener('click', (e) => {
      if (e.target === rulesOverlay) {
        closeRules();
      }
    });
  }

  rulesTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      soundManager.playAction();
      const targetTabId = btn.getAttribute('data-tab');
      
      rulesTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      rulesTabContents.forEach(content => {
        if (content.id === targetTabId) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });


  // --- 2. Tab Navigation ---
  tabCreateRoom.addEventListener('click', () => {
    tabCreateRoom.classList.add('active');
    tabJoinRoom.classList.remove('active');
    viewCreateRoom.classList.remove('hidden');
    viewJoinRoom.classList.add('hidden');
  });

  tabJoinRoom.addEventListener('click', () => {
    tabJoinRoom.classList.add('active');
    tabCreateRoom.classList.remove('active');
    viewJoinRoom.classList.remove('hidden');
    viewCreateRoom.classList.add('hidden');
  });

  // --- 3. Room Creation & Joining ---
  btnCreateSubmit.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player 1';
    socketClient.createRoom(name);
  });

  btnJoinSubmit.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    const name = playerNameInput.value.trim() || 'Player';
    if (code.length !== 4) {
      alert('Please enter a valid 4-letter room code.');
      return;
    }
    socketClient.joinRoom(code, name);
  });

  btnCopyCode.addEventListener('click', () => {
    const code = displayRoomCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
      btnCopyCode.textContent = 'Copied!';
      setTimeout(() => { btnCopyCode.textContent = 'Copy'; }, 2000);
    });
  });

  chkFillBots.addEventListener('change', () => {
    socketClient.toggleBots(chkFillBots.checked);
  });

  btnMpStartGame.addEventListener('click', () => {
    socketClient.startGame();
  });

  btnMpLeaveRoom.addEventListener('click', () => {
    socketClient.leaveRoom();
  });

  if (btnLeaveGame) {
    btnLeaveGame.addEventListener('click', () => {
      soundManager.playAction();
      const isMulti = socketClient.isMultiplayer;
      const message = isMulti ? 
        'Are you sure you want to leave the room? This will disconnect you from the match.' :
        'Are you sure you want to leave the game?';
      if (confirm(message)) {
        if (isMulti) {
          socketClient.leaveRoom();
        } else {
          window.location.reload();
        }
      }
    });
  }

  // --- Bot Difficulty Change Listeners ---
  for (let i = 1; i < 4; i++) {
    const botDiffSelect = document.getElementById(`bot-diff-select-${i}`);
    if (botDiffSelect) {
      botDiffSelect.addEventListener('change', () => {
        const difficulty = botDiffSelect.value;
        socketClient.changeBotDifficulty(i, difficulty);
      });
    }
  }

  // --- 4. Socket Client Callbacks ---
  socketClient.onLobbyState = (data) => {
    mpInitialForm.classList.add('hidden');
    mpRoomView.classList.remove('hidden');
    displayRoomCode.textContent = data.roomCode;
    chkFillBots.checked = data.fillBots;

    // Render seats
    for (let i = 0; i < 4; i++) {
      const seat = data.seats[i];
      const seatNameEl = document.getElementById(`seat-name-${i}`);
      const seatStatusEl = document.getElementById(`seat-status-${i}`);
      if (seat) {
        seatNameEl.textContent = seat.name;
        if (seat.socketId === data.hostSocketId) {
          seatStatusEl.textContent = '👑 Host';
        } else if (seat.isBot) {
          seatStatusEl.textContent = '🤖 Bot';
        } else if (seat.connected) {
          seatStatusEl.textContent = '🟢 Connected';
        } else {
          seatStatusEl.textContent = '🔴 Offline';
        }
      }
    }

    // Show/hide and update bot difficulty selectors in lobby
    const isHost = socketClient.socket && socketClient.socket.id === data.hostSocketId;
    for (let i = 1; i < 4; i++) {
      const seat = data.seats[i];
      const botDiffContainer = document.getElementById(`bot-diff-container-${i}`);
      const botDiffSelect = document.getElementById(`bot-diff-select-${i}`);

      if (seat && seat.isBot) {
        if (botDiffContainer) botDiffContainer.classList.remove('hidden');
        if (botDiffSelect) {
          botDiffSelect.value = seat.difficulty || 'medium';
          if (isHost) {
            botDiffSelect.removeAttribute('disabled');
          } else {
            botDiffSelect.setAttribute('disabled', 'true');
          }
        }
      } else {
        if (botDiffContainer) botDiffContainer.classList.add('hidden');
      }
    }

    // Host button state
    if (isHost) {
      btnMpStartGame.removeAttribute('disabled');
      btnMpStartGame.textContent = 'Start Game';
    } else {
      btnMpStartGame.setAttribute('disabled', 'true');
      btnMpStartGame.textContent = 'Waiting for Host to start...';
    }
  };

  socketClient.onRoomState = (data) => {
    startOverlay.classList.add('hidden');
    mpOverlay.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    if (roomCodeTag) {
      roomCodeTag.classList.remove('hidden');
      roomCodeTag.textContent = `ROOM: ${data.roomCode}`;
    }

    if (btnLeaveGame) {
      btnLeaveGame.textContent = 'Leave Room';
      btnLeaveGame.classList.remove('hidden');
    }

    // Adapt sanitized server state for local Renderer
    const gs = data.gameState;
    if (!gs) return;

    const isHost = socketClient.socket && socketClient.socket.id === data.hostSocketId;

    // Build adapter object matching local GameState interface
    const adaptedState = {
      isHost: isHost,
      phase: gs.phase,
      dealerIndex: gs.dealerIndex,
      currentPlayerIndex: gs.currentPlayerIndex,
      discardedTile: gs.discardedTile,
      discarderIndex: gs.discarderIndex,
      lianzhuangCount: gs.lianzhuangCount,
      windRound: gs.windRound,
      dealCount: gs.dealCount,
      winnerIndex: gs.winnerIndex,
      winDetails: gs.winDetails,
      wall: {
        tiles: { length: gs.wallCount },
        jinIndicator: gs.jinIndicator || (gs.jinTile ? gs.jinTile : null),
        jinTile: gs.jinTile
      },
      players: gs.players.map((p, idx) => {
        const h = new Hand();
        h.privateHand = p.privateHand.length > 0 ? [...p.privateHand] : new Array(p.handCount).fill(null).map((_, tileIdx) => ({ id: `hidden_${idx}_${tileIdx}` }));
        h.melds = p.melds ? p.melds.map(m => ({ ...m, tiles: [...m.tiles] })) : [];
        h.flowers = p.flowers ? [...p.flowers] : [];
        return {
          id: p.id,
          name: p.name,
          isBot: p.isBot,
          difficulty: p.difficulty || 'medium',
          points: p.points,
          discards: p.discards,
          hand: h
        };
      })
    };

    // Re-orient seats relative to local player (local seat is always at bottom = p0)
    const mySeatIndex = data.yourSeatIndex || 0;
    const reorderedPlayers = [];
    for (let i = 0; i < 4; i++) {
      const targetSeat = (mySeatIndex + i) % 4;
      reorderedPlayers.push(adaptedState.players[targetSeat]);
    }

    adaptedState.players = reorderedPlayers;
    adaptedState.dealerIndex = (adaptedState.dealerIndex - mySeatIndex + 4) % 4;
    adaptedState.currentPlayerIndex = (adaptedState.currentPlayerIndex - mySeatIndex + 4) % 4;
    if (adaptedState.discarderIndex !== null && adaptedState.discarderIndex !== undefined) {
      adaptedState.discarderIndex = (adaptedState.discarderIndex - mySeatIndex + 4) % 4;
    }
    if (adaptedState.winnerIndex !== null && adaptedState.winnerIndex !== undefined) {
      adaptedState.winnerIndex = (adaptedState.winnerIndex - mySeatIndex + 4) % 4;
    }

    renderer.state = adaptedState;
    renderer.render(data.message);
  };

  socketClient.onChatMessage = (data) => {
    if (renderer) {
      const localSeatIndex = (data.senderSeatIndex - socketClient.seatIndex + 4) % 4;
      const isSelf = localSeatIndex === 0;
      const isBot = (renderer.state?.players[localSeatIndex]?.isBot) || ['Chen', 'Lin', 'Wong'].some(name => data.senderName.includes(name)) || data.senderName.includes('Bot');

      renderer.addChatMessage({
        senderName: data.senderName,
        senderSeatIndex: localSeatIndex,
        message: data.message,
        isSelf: isSelf,
        isBot: isBot,
        timestamp: data.timestamp
      });
    }
  };
});
