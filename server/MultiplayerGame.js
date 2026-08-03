import { Wall } from '../src/core/Wall.js';
import { GameState, GamePhase, Player } from '../src/core/GameState.js';
import { RulesEngine } from '../src/core/RulesEngine.js';
import { BotAI } from '../src/engine/BotAI.js';
import { isFlower } from '../src/core/Tile.js';

export class MultiplayerGame {
  static async startNewHand(room, broadcastUpdate) {
    if (!room.gameState) {
      room.gameState = new GameState();
    }
    const gs = room.gameState;
    gs.resetForNewDeal();

    // Setup players matching room seats
    gs.players = room.seats.map(seat => new Player(seat.seatIndex, seat.name, seat.isBot));

    gs.wall = new Wall();
    gs.wall.shuffle();

    // Deal tiles: 17 to dealer, 16 to others
    for (let p = 0; p < 4; p++) {
      const playerIndex = (gs.dealerIndex + p) % 4;
      const player = gs.players[playerIndex];
      const isDealer = playerIndex === gs.dealerIndex;
      const dealCount = isDealer ? 17 : 16;
      for (let i = 0; i < dealCount; i++) {
        const tile = gs.wall.drawFromFront();
        if (tile) player.hand.addTile(tile);
      }
    }

    for (const p of gs.players) {
      p.hand.sort();
    }

    gs.phase = GamePhase.FLOWER_REPLACEMENT;
    broadcastUpdate(room, 'Hands dealt. Performing flower replacement...');

    // Execute flower replacement loop
    await MultiplayerGame.runFlowerReplacements(gs);

    // Reveal Jin indicator
    gs.phase = GamePhase.OPEN_JIN;
    gs.wall.revealJinIndicator();
    broadcastUpdate(room, `Jin indicator flipped: ${gs.wall.jinIndicator ? gs.wall.jinIndicator.type + ' ' + gs.wall.jinIndicator.value : ''}`);

    // Check dealer initial hand win (San Jin Dao or Qiang Jin)
    const dealer = gs.players[gs.dealerIndex];
    const initialHu = RulesEngine.checkSelfDrawnHu(dealer.hand, gs.wall.jinTile, dealer.hand.privateHand[dealer.hand.privateHand.length - 1]);
    if (initialHu.canHu) {
      MultiplayerGame.handleWin(room, gs.dealerIndex, initialHu, broadcastUpdate);
      return;
    }

    // Set to PLAYING phase with dealer as current turn
    gs.phase = GamePhase.PLAYING;
    gs.currentPlayerIndex = gs.dealerIndex;
    broadcastUpdate(room, `${gs.players[gs.currentPlayerIndex].name}'s turn to discard.`);
  }

  static async runFlowerReplacements(gs) {
    let replacedAny = true;
    let loopCount = 0;
    while (replacedAny && loopCount < 10) {
      replacedAny = false;
      loopCount++;
      for (let p = 0; p < 4; p++) {
        const playerIndex = (gs.dealerIndex + p) % 4;
        const player = gs.players[playerIndex];
        const flowers = player.hand.privateHand.filter(t => isFlower(t));
        if (flowers.length > 0) {
          replacedAny = true;
          for (const tile of flowers) {
            player.hand.removeTile(tile);
            player.hand.addFlower(tile);
            const newTile = gs.wall.drawFromBack();
            if (newTile) {
              player.hand.addTile(newTile);
            }
          }
          player.hand.sort();
        }
      }
    }
  }

  static async handleDiscard(room, seatIndex, tileId, broadcastUpdate) {
    const gs = room.gameState;
    if (gs.phase !== GamePhase.PLAYING || gs.currentPlayerIndex !== seatIndex) return;

    const player = gs.players[seatIndex];
    const tile = player.hand.privateHand.find(t => t.id === tileId);
    if (!tile) return;

    player.hand.removeTile(tile);
    player.hand.sort();
    player.discards.push(tile);

    gs.discardedTile = tile;
    gs.discarderIndex = seatIndex;

    broadcastUpdate(room, `${player.name} discarded ${tile.type} ${tile.value}.`);

    // Check possible actions for other players
    room.pendingActions = {};
    let anyPossibleActions = false;

    for (let i = 0; i < 4; i++) {
      if (i === seatIndex) continue;
      const other = gs.players[i];
      const isNextPlayer = (seatIndex + 1) % 4 === i;
      
      const huCheck = RulesEngine.checkDiscardHu(other.hand, gs.wall.jinTile, tile);
      const pungCheck = RulesEngine.canPung(other.hand, tile);
      const kongCheck = RulesEngine.canKongOnDiscard(other.hand, tile);
      const chowCheck = isNextPlayer ? RulesEngine.canChow(other.hand, tile) : { canChow: false, options: [] };

      const options = {
        canHu: huCheck.canHu,
        canPung: pungCheck,
        canKong: kongCheck,
        canChow: chowCheck.canChow,
        chowOptions: chowCheck.options
      };

      if (options.canHu || options.canPung || options.canKong || options.canChow) {
        anyPossibleActions = true;

        if (room.seats[i].isBot) {
          // Bot evaluates reaction decision immediately
          const botChoice = BotAI.evaluateDiscardReaction(other, tile, isNextPlayer, gs.wall.jinTile);
          room.pendingActions[i] = botChoice;
        }
      } else {
        // Player has no valid actions, auto pass
        room.pendingActions[i] = { type: 'pass' };
      }
    }

    if (anyPossibleActions) {
      gs.phase = GamePhase.WAITING_FOR_ACTION;
      broadcastUpdate(room, `Waiting for player actions on discarded tile...`);
      MultiplayerGame.checkAndResolveActions(room, broadcastUpdate);
    } else {
      await MultiplayerGame.advanceTurn(room, broadcastUpdate);
    }
  }

  static async handlePlayerAction(room, seatIndex, action, broadcastUpdate) {
    const gs = room.gameState;
    if (gs.phase !== GamePhase.WAITING_FOR_ACTION) return;

    room.pendingActions[seatIndex] = action;
    MultiplayerGame.checkAndResolveActions(room, broadcastUpdate);
  }

  static checkAndResolveActions(room, broadcastUpdate) {
    const gs = room.gameState;
    // Check if all 3 non-discarding players have submitted an action
    for (let i = 0; i < 4; i++) {
      if (i === gs.discarderIndex) continue;
      if (!room.pendingActions[i]) return; // Still waiting for this seat
    }

    // Resolve priority: Hu > Pung / Kong > Chow
    let winner = null;
    let pungSeat = null;
    let kongSeat = null;
    let chowSeat = null;

    for (let i = 0; i < 4; i++) {
      if (i === gs.discarderIndex) continue;
      const act = room.pendingActions[i];
      if (act.type === 'hu') winner = i;
      else if (act.type === 'pung') pungSeat = i;
      else if (act.type === 'kong') kongSeat = i;
      else if (act.type === 'chow') chowSeat = i;
    }

    const tile = gs.discardedTile;

    if (winner !== null) {
      const winnerPlayer = gs.players[winner];
      const winDetails = RulesEngine.calculateScore({
        winType: 'discard',
        hand: winnerPlayer.hand,
        jinTile: gs.wall.jinTile,
        lianzhuangCount: gs.lianzhuangCount,
        isDealer: winner === gs.dealerIndex,
        claimedTile: tile
      });

      winnerPlayer.hand.addTile(tile);
      MultiplayerGame.handleWin(room, winner, winDetails, broadcastUpdate);
      return;
    }

    if (kongSeat !== null) {
      const p = gs.players[kongSeat];
      p.hand.addMeld({ type: 'kong', tiles: [tile, tile, tile, tile], sourcePlayerId: gs.discarderIndex });
      for (let k = 0; k < 3; k++) p.hand.removeTileBySuitValue(tile.type, tile.value);
      gs.players[gs.discarderIndex].discards.pop();
      gs.currentPlayerIndex = kongSeat;
      // Kong replacement draw from back of wall
      const replacementTile = gs.wall.drawFromBack();
      if (replacementTile) p.hand.addTile(replacementTile);
      gs.phase = GamePhase.PLAYING;
      broadcastUpdate(room, `${p.name} declared Kong (杠)!`);
      return;
    }

    if (pungSeat !== null) {
      const p = gs.players[pungSeat];
      p.hand.addMeld({ type: 'pung', tiles: [tile, tile, tile], sourcePlayerId: gs.discarderIndex });
      for (let k = 0; k < 2; k++) p.hand.removeTileBySuitValue(tile.type, tile.value);
      gs.players[gs.discarderIndex].discards.pop();
      gs.currentPlayerIndex = pungSeat;
      gs.phase = GamePhase.PLAYING;
      broadcastUpdate(room, `${p.name} declared Pung (碰)!`);
      return;
    }

    if (chowSeat !== null) {
      const p = gs.players[chowSeat];
      const chowAction = room.pendingActions[chowSeat];
      const meldTiles = chowAction.chowMeld || [tile];
      p.hand.addMeld({ type: 'chow', tiles: meldTiles, sourcePlayerId: gs.discarderIndex });
      for (const t of meldTiles) {
        if (t.id !== tile.id) p.hand.removeTileBySuitValue(t.type, t.value);
      }
      gs.players[gs.discarderIndex].discards.pop();
      gs.currentPlayerIndex = chowSeat;
      gs.phase = GamePhase.PLAYING;
      broadcastUpdate(room, `${p.name} declared Chow (吃)!`);
      return;
    }

    // Everyone passed! Advance turn to next player
    MultiplayerGame.advanceTurn(room, broadcastUpdate);
  }

  static async advanceTurn(room, broadcastUpdate) {
    const gs = room.gameState;
    gs.discardedTile = null;

    if (gs.wall.isExhausted()) {
      gs.phase = GamePhase.GAME_OVER;
      broadcastUpdate(room, 'Wall exhausted! Game ends in a Draw (流局).');
      return;
    }

    gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % 4;
    const player = gs.players[gs.currentPlayerIndex];

    const drawnTile = gs.wall.drawFromFront();
    if (drawnTile) {
      if (isFlower(drawnTile)) {
        player.hand.addFlower(drawnTile);
        broadcastUpdate(room, `${player.name} drew a flower (${drawnTile.type} ${drawnTile.value}) and drew a replacement.`);
        const replacement = gs.wall.drawFromBack();
        if (replacement) player.hand.addTile(replacement);
      } else {
        player.hand.addTile(drawnTile);
      }
      player.hand.sort();
    }

    gs.phase = GamePhase.PLAYING;
    broadcastUpdate(room, `${player.name}'s turn to play.`);

    // If bot turn, evaluate and discard after short delay
    if (room.seats[gs.currentPlayerIndex].isBot) {
      setTimeout(() => {
        const botTile = BotAI.chooseDiscard(player, gs.wall.jinTile);
        if (botTile) {
          MultiplayerGame.handleDiscard(room, gs.currentPlayerIndex, botTile.id, broadcastUpdate);
        }
      }, 1000);
    }
  }

  static handleWin(room, winnerSeat, winDetails, broadcastUpdate) {
    const gs = room.gameState;
    gs.phase = GamePhase.GAME_OVER;
    gs.winnerIndex = winnerSeat;
    gs.winDetails = winDetails;

    // Apply scoring transfers
    const totalScore = winDetails.totalScore || 10;
    for (let i = 0; i < 4; i++) {
      if (i === winnerSeat) {
        gs.players[i].points += totalScore * 3;
      } else {
        gs.players[i].points -= totalScore;
      }
    }

    if (winnerSeat === gs.dealerIndex) {
      gs.lianzhuangCount++;
    } else {
      gs.dealerIndex = (gs.dealerIndex + 1) % 4;
      gs.lianzhuangCount = 0;
    }

    broadcastUpdate(room, `🎉 WINNER! ${gs.players[winnerSeat].name} won the hand!`);
  }
}
