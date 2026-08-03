/* global io */

export class SocketClient {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.playerToken = null;
    this.seatIndex = null;
    this.isMultiplayer = false;

    this.onLobbyState = null;
    this.onRoomState = null;
    this.onChatMessage = null;
    this.onError = null;
  }

  init() {
    if (typeof io === 'undefined') {
      console.warn('Socket.io library not loaded.');
      return;
    }

    // Connect to the same origin host
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('[SocketClient] Connected to server, ID:', this.socket.id);
      this.checkAutoRejoin();
    });

    this.socket.on('room_created', (data) => {
      this.roomCode = data.roomCode;
      this.playerToken = data.playerToken;
      this.seatIndex = data.seatIndex;
      this.isMultiplayer = true;

      sessionStorage.setItem('fz_room_code', this.roomCode);
      sessionStorage.setItem('fz_player_token', this.playerToken);
      sessionStorage.setItem('fz_seat_index', this.seatIndex);
    });

    this.socket.on('room_joined', (data) => {
      this.roomCode = data.roomCode;
      this.playerToken = data.playerToken;
      this.seatIndex = data.seatIndex;
      this.isMultiplayer = true;

      sessionStorage.setItem('fz_room_code', this.roomCode);
      sessionStorage.setItem('fz_player_token', this.playerToken);
      sessionStorage.setItem('fz_seat_index', this.seatIndex);
    });

    this.socket.on('rejoin_success', (data) => {
      this.roomCode = data.roomCode;
      this.seatIndex = data.seatIndex;
      this.isMultiplayer = true;
      console.log(`[SocketClient] Rejoined room ${this.roomCode} as Seat ${this.seatIndex}`);
    });

    this.socket.on('rejoin_failed', () => {
      sessionStorage.removeItem('fz_room_code');
      sessionStorage.removeItem('fz_player_token');
      sessionStorage.removeItem('fz_seat_index');
    });

    this.socket.on('lobby_state_update', (data) => {
      if (this.onLobbyState) this.onLobbyState(data);
    });

    this.socket.on('room_state_update', (data) => {
      if (this.onRoomState) this.onRoomState(data);
    });

    this.socket.on('chat_message', (data) => {
      if (this.onChatMessage) this.onChatMessage(data);
    });

    this.socket.on('error_message', (msg) => {
      if (this.onError) this.onError(msg);
      else alert(msg);
    });
  }

  checkAutoRejoin() {
    const savedCode = sessionStorage.getItem('fz_room_code');
    const savedToken = sessionStorage.getItem('fz_player_token');
    if (savedCode && savedToken) {
      this.playerToken = savedToken;
      this.socket.emit('rejoin_room', { roomCode: savedCode, playerToken: savedToken });
    }
  }

  createRoom(playerName) {
    if (!this.socket) this.init();
    this.socket.emit('create_room', { playerName });
  }

  joinRoom(roomCode, playerName) {
    if (!this.socket) this.init();
    this.socket.emit('join_room', { roomCode, playerName });
  }

  toggleBots(fillBots) {
    if (this.roomCode) {
      this.socket.emit('toggle_fill_bots', { roomCode: this.roomCode, fillBots });
    }
  }

  startGame() {
    if (this.roomCode) {
      this.socket.emit('start_game', { roomCode: this.roomCode });
    }
  }

  discardTile(tileId) {
    if (this.roomCode) {
      this.socket.emit('discard_tile', { roomCode: this.roomCode, tileId });
    }
  }

  declareAction(actionType, chowMeld = null) {
    if (this.roomCode) {
      this.socket.emit('declare_action', { roomCode: this.roomCode, actionType, chowMeld });
    }
  }

  sendChatMessage(message) {
    if (this.roomCode && this.socket) {
      this.socket.emit('send_chat_message', { roomCode: this.roomCode, message });
    }
  }

  leaveRoom() {
    sessionStorage.removeItem('fz_room_code');
    sessionStorage.removeItem('fz_player_token');
    sessionStorage.removeItem('fz_seat_index');
    this.roomCode = null;
    this.playerToken = null;
    this.seatIndex = null;
    this.isMultiplayer = false;
    window.location.reload();
  }
}
