import { Wall } from '../src/core/Wall.js';
import { GameState, GamePhase, Player } from '../src/core/GameState.js';
import { RulesEngine } from '../src/core/RulesEngine.js';
import { BotAI } from '../src/engine/BotAI.js';
import { isFlower, sortTiles } from '../src/core/Tile.js';

export class MultiplayerGame {
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async startNewHand(room, broadcastUpdate) {
    if (!room.gameState) {
      room.gameState = new GameState();
    }
    const gs = room.gameState;
    gs.resetForNewDeal();

    // Setup players matching room seats
    gs.players = room.seats.map(seat => new Player(seat.seatIndex, seat.name, seat.isBot, seat.difficulty || 'medium'));

    gs.wall = new Wall();
    gs.wall.shuffle();

    broadcastUpdate(room, 'Shuffling and building the wall...');
    await MultiplayerGame.sleep(800);

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
    broadcastUpdate(room, 'Hands dealt. Starting flower replacements...');
    await MultiplayerGame.sleep(1800);

    // Execute flower replacement loop
    await MultiplayerGame.runFlowerReplacements(room, gs, broadcastUpdate);

    gs.phase = GamePhase.OPEN_JIN;
    broadcastUpdate(room, 'Flower replacement complete. Opening the Jin...');
    await MultiplayerGame.sleep(1000);

    // Reveal Jin indicator (exact Fuzhou rule)
    const dealer = gs.players[gs.dealerIndex];
    const { indicator, flowersGivenToDealer } = gs.wall.revealJin(dealer.hand);

    if (flowersGivenToDealer.length > 0) {
      broadcastUpdate(room, `Flipped flower card(s) during Jin opening. Gained by dealer for free: ${flowersGivenToDealer.map(t => t.value).join(', ')}`);
      await MultiplayerGame.sleep(800);
      dealer.hand.sort();
    }

    broadcastUpdate(room, `Jin opened! Indicator is [${indicator ? indicator.type + ' ' + indicator.value : ''}]. The Jin wildcard is identical!`);
    await MultiplayerGame.sleep(1500);

    // Check dealer initial hand win (San Jin Dao or Qiang Jin)
    const initialHu = RulesEngine.checkHu(dealer.hand, null, gs.wall.jinTile, true);
    if (initialHu.hu) {
      const winDetails = RulesEngine.calculateScore(dealer.hand, gs.wall.jinTile, 'self_draw', true, gs.dealerIndex, gs.dealerIndex, gs.lianzhuangCount);
      MultiplayerGame.handleWin(room, gs.dealerIndex, winDetails, broadcastUpdate);
      return;
    }

    // Set to PLAYING phase with dealer as current turn
    gs.phase = GamePhase.PLAYING;
    gs.currentPlayerIndex = gs.dealerIndex;
    broadcastUpdate(room, `Game starts! Dealer ${gs.players[gs.currentPlayerIndex].name}'s turn.`);
    await MultiplayerGame.sleep(500);
    MultiplayerGame.triggerBotTurnIfBot(room, broadcastUpdate);
  }

  static async runFlowerReplacements(room, gs, broadcastUpdate) {
    for (let p = 0; p < 4; p++) {
      const playerIndex = (gs.dealerIndex + p) % 4;
      const player = gs.players[playerIndex];
      while (player.hand.privateHand.some(t => isFlower(t))) {
        const flowerIndex = player.hand.privateHand.findIndex(t => isFlower(t));
        const flower = player.hand.privateHand.splice(flowerIndex, 1)[0];
        player.hand.addFlower(flower);
        broadcastUpdate(room, `${player.name} is replacing flower tile [${flower.type} ${flower.value}]...`);
        await MultiplayerGame.sleep(400);

        const replacement = gs.wall.drawFromBack();
        if (replacement) {
          player.hand.addTile(replacement);
        } else {
          break;
        }
        player.hand.sort();
        broadcastUpdate(room, `${player.name} drew a replacement tile.`);
        await MultiplayerGame.sleep(400);
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
      
      const huCheck = RulesEngine.checkHu(other.hand, tile, gs.wall.jinTile, false);
      const pungCheck = RulesEngine.canPung(other.hand, tile, gs.wall.jinTile);
      const kongCheck = RulesEngine.canKong(other.hand, tile, gs.wall.jinTile);
      const chowOptions = isNextPlayer ? RulesEngine.canChow(other.hand, tile, gs.wall.jinTile, true) : [];

      const options = {
        canHu: huCheck.hu,
        canPung: pungCheck,
        canKong: kongCheck,
        canChow: chowOptions.length > 0,
        chowOptions
      };

      if (options.canHu || options.canPung || options.canKong || options.canChow) {
        anyPossibleActions = true;

        if (room.seats[i].isBot) {
          // Bot evaluates reaction decision immediately
          const botChoice = BotAI.decideAction(other, tile, gs.discarderIndex, gs.wall.jinTile, isNextPlayer, gs);
          room.pendingActions[i] = { type: botChoice.action, chowMeld: botChoice.tiles };
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
      const winDetails = RulesEngine.calculateScore(
        winnerPlayer.hand,
        gs.wall.jinTile,
        'discard',
        false,
        gs.dealerIndex,
        winner,
        gs.lianzhuangCount
      );

      winnerPlayer.hand.addTile(tile);
      MultiplayerGame.handleWin(room, winner, winDetails, broadcastUpdate);
      return;
    }

    if (kongSeat !== null) {
      const p = gs.players[kongSeat];
      const removedTiles = [];
      for (let k = 0; k < 3; k++) {
        const matchingTile = p.hand.privateHand.find(t => t.type === tile.type && t.value === tile.value);
        if (matchingTile) {
          p.hand.removeTile(matchingTile);
          removedTiles.push(matchingTile);
        }
      }
      p.hand.addMeld('kong', [tile, ...removedTiles], gs.discarderIndex);
      gs.players[gs.discarderIndex].discards.pop();
      gs.currentPlayerIndex = kongSeat;
      // Kong replacement draw from back of wall (recursive flower check)
      let replacementTile = gs.wall.drawFromBack();
      while (replacementTile && isFlower(replacementTile)) {
        p.hand.addFlower(replacementTile);
        broadcastUpdate(room, `${p.name} drew a flower (${replacementTile.type} ${replacementTile.value}) for Kong replacement.`);
        replacementTile = gs.wall.drawFromBack();
      }
      if (replacementTile) p.hand.addTile(replacementTile);
      p.hand.sort();
      gs.phase = GamePhase.PLAYING;
      broadcastUpdate(room, `${p.name} declared Kong (杠)!`);
      MultiplayerGame.triggerBotTurnIfBot(room, broadcastUpdate);
      return;
    }

    if (pungSeat !== null) {
      const p = gs.players[pungSeat];
      const removedTiles = [];
      for (let k = 0; k < 2; k++) {
        const matchingTile = p.hand.privateHand.find(t => t.type === tile.type && t.value === tile.value);
        if (matchingTile) {
          p.hand.removeTile(matchingTile);
          removedTiles.push(matchingTile);
        }
      }
      p.hand.addMeld('pung', [tile, ...removedTiles], gs.discarderIndex);
      gs.players[gs.discarderIndex].discards.pop();
      gs.currentPlayerIndex = pungSeat;
      p.hand.sort();
      gs.phase = GamePhase.PLAYING;
      broadcastUpdate(room, `${p.name} declared Pung (碰)!`);
      MultiplayerGame.triggerBotTurnIfBot(room, broadcastUpdate);
      return;
    }

    if (chowSeat !== null) {
      const p = gs.players[chowSeat];
      const chowAction = room.pendingActions[chowSeat];
      let meldTiles = chowAction ? chowAction.chowMeld : null;

      if (!meldTiles || !Array.isArray(meldTiles) || meldTiles.length !== 3) {
        const chows = RulesEngine.canChow(p.hand, tile, gs.wall.jinTile, true);
        if (chows.length > 0) {
          meldTiles = [tile, ...chows[0]];
        } else {
          meldTiles = [tile];
        }
      }

      for (const t of meldTiles) {
        if (t.id !== tile.id) {
          const matchingTile = p.hand.privateHand.find(ht => (ht.id && ht.id === t.id) || (ht.type === t.type && ht.value === t.value));
          if (matchingTile) p.hand.removeTile(matchingTile);
        }
      }
      p.hand.addMeld('chow', sortTiles(meldTiles), gs.discarderIndex);
      gs.players[gs.discarderIndex].discards.pop();
      gs.currentPlayerIndex = chowSeat;
      p.hand.sort();
      gs.phase = GamePhase.PLAYING;
      broadcastUpdate(room, `${p.name} declared Chow (吃)!`);
      MultiplayerGame.triggerBotTurnIfBot(room, broadcastUpdate);
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

    let drawnTile = gs.wall.drawFromFront();
    while (drawnTile && isFlower(drawnTile)) {
      player.hand.addFlower(drawnTile);
      broadcastUpdate(room, `${player.name} drew a flower (${drawnTile.type} ${drawnTile.value}) and drew a replacement.`);
      drawnTile = gs.wall.drawFromBack();
    }

    if (drawnTile) {
      player.hand.addTile(drawnTile);
      player.hand.sort();
    }

    gs.phase = GamePhase.PLAYING;
    broadcastUpdate(room, `${player.name}'s turn to play.`);
    MultiplayerGame.triggerBotTurnIfBot(room, broadcastUpdate);
  }

  static triggerBotTurnIfBot(room, broadcastUpdate) {
    const gs = room.gameState;
    if (gs.phase !== GamePhase.PLAYING) return;
    const seatIdx = gs.currentPlayerIndex;
    if (room.seats[seatIdx].isBot) {
      setTimeout(() => {
        if (gs.phase === GamePhase.PLAYING && gs.currentPlayerIndex === seatIdx) {
          const player = gs.players[seatIdx];
          const botTile = BotAI.decideDiscard(player, gs.wall.jinTile, gs);
          if (botTile) {
            MultiplayerGame.handleDiscard(room, seatIdx, botTile.id, broadcastUpdate);
          }
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
