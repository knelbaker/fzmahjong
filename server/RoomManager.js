import { Wall } from '../src/core/Wall.js';
import { GameState, GamePhase } from '../src/core/GameState.js';
import { RulesEngine } from '../src/core/RulesEngine.js';
import { BotAI } from '../src/engine/BotAI.js';
import { isFlower } from '../src/core/Tile.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room
  }

  createRoom(socketId, playerName = 'Player 1') {
    let roomCode = generateRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const hostToken = generateToken();
    const room = {
      code: roomCode,
      created: Date.now(),
      status: 'LOBBY', // LOBBY, PLAYING, GAME_OVER
      hostSocketId: socketId,
      fillBots: true,
      seats: [
        { seatIndex: 0, socketId, token: hostToken, name: playerName, isBot: false, connected: true },
        { seatIndex: 1, socketId: null, token: generateToken(), name: 'Fuzhou Bot 1', isBot: true, connected: true },
        { seatIndex: 2, socketId: null, token: generateToken(), name: 'Fuzhou Bot 2', isBot: true, connected: true },
        { seatIndex: 3, socketId: null, token: generateToken(), name: 'Fuzhou Bot 3', isBot: true, connected: true }
      ],
      gameState: null,
      pendingActions: {}, // seatIndex -> action chosen
      actionTimeout: null
    };

    this.rooms.get(roomCode) || this.rooms.set(roomCode, room);
    return { room, playerToken: hostToken, seatIndex: 0 };
  }

  joinRoom(roomCode, socketId, playerName) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      return { error: 'Room not found. Check the code and try again.' };
    }

    if (room.status !== 'LOBBY') {
      return { error: 'Room is already playing a game.' };
    }

    // Find first available seat currently occupied by a bot or open
    const openSeat = room.seats.find(s => s.isBot || !s.connected);
    if (!openSeat) {
      return { error: 'Room is full (4 human players maximum).' };
    }

    const playerToken = generateToken();
    openSeat.socketId = socketId;
    openSeat.token = playerToken;
    openSeat.name = playerName || `Player ${openSeat.seatIndex + 1}`;
    openSeat.isBot = false;
    openSeat.connected = true;

    return { room, playerToken, seatIndex: openSeat.seatIndex };
  }

  rejoinRoom(roomCode, playerToken, socketId) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return null;

    const seat = room.seats.find(s => s.token === playerToken);
    if (!seat) return null;

    seat.socketId = socketId;
    seat.connected = true;
    if (room.seats[0].token === playerToken) {
      room.hostSocketId = socketId;
    }

    return { room, seatIndex: seat.seatIndex };
  }

  toggleFillBots(roomCode, fillBots) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.fillBots = fillBots;
    // Replace empty seats with bots if true, or vacate them if false
    for (let i = 1; i < 4; i++) {
      if (!room.seats[i].socketId) {
        room.seats[i].isBot = fillBots;
        room.seats[i].name = fillBots ? `Fuzhou Bot ${i}` : 'Empty Seat';
      }
    }
  }

  leaveRoomBySocketId(socketId) {
    for (const [code, room] of this.rooms.entries()) {
      const seat = room.seats.find(s => s.socketId === socketId);
      if (seat) {
        seat.connected = false;
        // If lobby, clear human seat back to bot or empty
        if (room.status === 'LOBBY') {
          seat.socketId = null;
          seat.isBot = true;
          seat.name = `Fuzhou Bot ${seat.seatIndex}`;
        }
        // If all humans disconnected and room > 1 hour old, clean up
        const anyHumans = room.seats.some(s => !s.isBot && s.connected);
        if (!anyHumans && room.status === 'LOBBY') {
          this.rooms.delete(code);
        }
        return { roomCode: code, seatIndex: seat.seatIndex };
      }
    }
    return null;
  }

  getSanitizedStateForSeat(room, seatIndex) {
    if (!room.gameState) return null;

    const gs = room.gameState;
    return {
      code: room.code,
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
      wallCount: gs.wall ? gs.wall.tiles.length : 0,
      jinTile: gs.wall ? gs.wall.jinTile : null,

      // Players array with private hands masked except for current seatIndex
      players: gs.players.map((p, idx) => {
        const isSelf = idx === seatIndex;
        return {
          id: p.id,
          name: room.seats[idx].name,
          isBot: room.seats[idx].isBot,
          connected: room.seats[idx].connected,
          points: p.points,
          handCount: p.hand.privateHand.length,
          // Only show private hand to the player who owns it!
          privateHand: isSelf ? p.hand.privateHand : [],
          melds: p.hand.melds,
          flowers: p.hand.flowers,
          discards: p.discards
        };
      })
    };
  }
}
