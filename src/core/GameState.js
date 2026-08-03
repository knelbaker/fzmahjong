import { Hand } from './Hand.js';

export const GamePhase = {
  SETUP: 'SETUP',
  FLOWER_REPLACEMENT: 'FLOWER_REPLACEMENT',
  OPEN_JIN: 'OPEN_JIN',
  PLAYING: 'PLAYING',
  WAITING_FOR_ACTION: 'WAITING_FOR_ACTION',
  GAME_OVER: 'GAME_OVER'
};

export class Player {
  constructor(id, name, isBot = false) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.hand = new Hand();
    this.discards = []; // Discard pile (河)
    this.points = 100;  // Initial points (e.g. 100 points)
  }

  reset() {
    this.hand = new Hand();
    this.discards = [];
  }
}

export class GameState {
  constructor() {
    this.players = [
      new Player(0, 'You (Player)', false),
      new Player(1, 'Chen', true),
      new Player(2, 'Lin', true),
      new Player(3, 'Wong', true)
    ];
    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.wall = null;
    this.phase = GamePhase.SETUP;
    
    this.discardedTile = null;
    this.discarderIndex = null;
    
    this.lianzhuangCount = 0; // Consecutive dealer wins count
    this.windRound = 1;       // 1 = East, 2 = South, 3 = West, 4 = North
    this.dealCount = 1;       // Current game hand index
    
    this.winnerIndex = null;
    this.winDetails = null;   // Scoring details if someone won
  }

  resetForNewDeal() {
    for (const player of this.players) {
      player.reset();
    }
    this.phase = GamePhase.SETUP;
    this.discardedTile = null;
    this.discarderIndex = null;
    this.winnerIndex = null;
    this.winDetails = null;
  }
}
