import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager.js';
import { MultiplayerGame } from './MultiplayerGame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const app = express();
app.use(cors());

// Serve static frontend files
app.use(express.static(projectRoot));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager();

function broadcastRoomState(room, message = '') {
  for (const seat of room.seats) {
    if (seat.socketId) {
      const sanitized = roomManager.getSanitizedStateForSeat(room, seat.seatIndex);
      io.to(seat.socketId).emit('room_state_update', {
        roomCode: room.code,
        status: room.status,
        seats: room.seats,
        fillBots: room.fillBots,
        hostSocketId: room.hostSocketId,
        yourSeatIndex: seat.seatIndex,
        gameState: sanitized,
        message
      });
    }
  }
}

function broadcastLobbyState(room, message = '') {
  for (const seat of room.seats) {
    if (seat.socketId) {
      io.to(seat.socketId).emit('lobby_state_update', {
        roomCode: room.code,
        status: room.status,
        seats: room.seats,
        fillBots: room.fillBots,
        hostSocketId: room.hostSocketId,
        yourSeatIndex: seat.seatIndex,
        message
      });
    }
  }
}

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create_room', ({ playerName }) => {
    const { room, playerToken, seatIndex } = roomManager.createRoom(socket.id, playerName);
    socket.join(room.code);
    socket.emit('room_created', {
      roomCode: room.code,
      playerToken,
      seatIndex,
      room
    });
    broadcastLobbyState(room, `Room ${room.code} created!`);
  });

  // 2. Join Room
  socket.on('join_room', ({ roomCode, playerName }) => {
    const result = roomManager.joinRoom(roomCode, socket.id, playerName);
    if (result.error) {
      socket.emit('error_message', result.error);
      return;
    }

    const { room, playerToken, seatIndex } = result;
    socket.join(room.code);
    socket.emit('room_joined', {
      roomCode: room.code,
      playerToken,
      seatIndex
    });
    broadcastLobbyState(room, `${playerName} joined the room!`);
  });

  // 3. Rejoin Room (Refresh Recovery)
  socket.on('rejoin_room', ({ roomCode, playerToken }) => {
    const result = roomManager.rejoinRoom(roomCode, playerToken, socket.id);
    if (!result) {
      socket.emit('rejoin_failed', 'Session expired or room no longer exists.');
      return;
    }

    const { room, seatIndex } = result;
    socket.join(room.code);
    socket.emit('rejoin_success', {
      roomCode: room.code,
      seatIndex
    });

    if (room.status === 'PLAYING') {
      broadcastRoomState(room, `Player reconnected to room!`);
    } else {
      broadcastLobbyState(room, `Player reconnected to lobby.`);
    }
  });

  // 4. Toggle Fill Bots
  socket.on('toggle_fill_bots', ({ roomCode, fillBots }) => {
    roomManager.toggleFillBots(roomCode, fillBots);
    const room = roomManager.rooms.get(roomCode);
    if (room) {
      broadcastLobbyState(room, `Updated bot settings.`);
    }
  });

  // Change Bot Difficulty
  socket.on('change_bot_difficulty', ({ roomCode, seatIndex, difficulty }) => {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    if (room.hostSocketId !== socket.id) {
      socket.emit('error_message', 'Only the room host can change bot difficulty.');
      return;
    }

    if (seatIndex < 0 || seatIndex >= 4) return;
    const seat = room.seats[seatIndex];
    if (seat && seat.isBot) {
      seat.difficulty = difficulty;
      broadcastLobbyState(room, `Changed ${seat.name} difficulty to ${difficulty}.`);
    }
  });

  // 5. Start Game
  socket.on('start_game', async ({ roomCode }) => {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    if (room.hostSocketId !== socket.id) {
      socket.emit('error_message', 'Only the room host can start the game.');
      return;
    }

    room.status = 'PLAYING';
    await MultiplayerGame.startNewHand(room, (r, msg) => broadcastRoomState(r, msg));
  });

  // 6. Player Discard Tile
  socket.on('discard_tile', async ({ roomCode, tileId }) => {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    const seat = room.seats.find(s => s.socketId === socket.id);
    if (!seat) return;

    await MultiplayerGame.handleDiscard(room, seat.seatIndex, tileId, (r, msg) => broadcastRoomState(r, msg));
  });

  // 7. Declare Reaction Action (Pass, Chow, Pung, Kong, Hu)
  socket.on('declare_action', async ({ roomCode, actionType, chowMeld }) => {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    const seat = room.seats.find(s => s.socketId === socket.id);
    if (!seat) return;

    await MultiplayerGame.handlePlayerAction(room, seat.seatIndex, { type: actionType, chowMeld }, (r, msg) => broadcastRoomState(r, msg));
  });

  // Chat Message
  socket.on('send_chat_message', ({ roomCode, message }) => {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;
    const seat = room.seats.find(s => s.socketId === socket.id);
    if (!seat) return;
    io.to(room.code).emit('chat_message', {
      senderName: seat.name,
      senderSeatIndex: seat.seatIndex,
      message: message,
      timestamp: Date.now()
    });
  });

  // 8. Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    const info = roomManager.leaveRoomBySocketId(socket.id);
    if (info) {
      const room = roomManager.rooms.get(info.roomCode);
      if (room) {
        if (room.status === 'PLAYING') {
          broadcastRoomState(room, `A player disconnected.`);
        } else {
          broadcastLobbyState(room, `A player disconnected.`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🀄 Fuzhou Mahjong Server running at http://localhost:${PORT}`);
  console.log(`=================================================`);
});
