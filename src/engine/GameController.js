import { GameState, GamePhase } from '../core/GameState.js';
import { Wall } from '../core/Wall.js';
import { RulesEngine } from '../core/RulesEngine.js';
import { BotAI } from './BotAI.js';
import { isFlower, sortTiles } from '../core/Tile.js';

export class GameController {
  constructor(state, onStateChange) {
    this.state = state;
    this.onStateChange = onStateChange;
    this.delayMs = 1000; // Delay for bot actions to feel natural
    this.reactionTimeout = null;
  }

  /**
   * Triggers the UI state change callback.
   */
  triggerUpdate(logMessage = '') {
    if (this.onStateChange) {
      this.onStateChange(this.state, logMessage);
    }
  }

  /**
   * Helper to sleep for a given duration.
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Starts a brand new deal (hand).
   */
  async startNewHand() {
    this.state.resetForNewDeal();
    this.state.wall = new Wall();
    this.state.wall.shuffle();

    this.triggerUpdate('Shuffling and building the wall...');
    await this.sleep(800);

    // Deal tiles: 17 to dealer, 16 to others
    // In Fuzhou rules, dealer starts with 17 cards, others with 16 cards.
    for (let p = 0; p < 4; p++) {
      const playerIndex = (this.state.dealerIndex + p) % 4;
      const player = this.state.players[playerIndex];
      const isDealer = playerIndex === this.state.dealerIndex;
      const dealCount = isDealer ? 17 : 16;
      
      for (let i = 0; i < dealCount; i++) {
        const tile = this.state.wall.drawFromFront();
        if (tile) player.hand.addTile(tile);
      }
    }

    for (const player of this.state.players) {
      player.hand.sort();
    }

    this.state.phase = GamePhase.FLOWER_REPLACEMENT;
    this.triggerUpdate('Hands dealt. Starting flower replacements...');
    await this.sleep(1800);

    await this.runFlowerReplacementLoop();
  }

  /**
   * Automates the flower replacement (补花) loop.
   * Checks players counter-clockwise starting from the dealer.
   * Loops until no players have any flower tiles in their private hands.
   */
  async runFlowerReplacementLoop() {
    for (let p = 0; p < 4; p++) {
      const playerIndex = (this.state.dealerIndex + p) % 4;
      const player = this.state.players[playerIndex];
      
      while (player.hand.privateHand.some(t => isFlower(t))) {
        const flowerIndex = player.hand.privateHand.findIndex(t => isFlower(t));
        const flower = player.hand.privateHand.splice(flowerIndex, 1)[0];
        player.hand.addFlower(flower);
        this.triggerUpdate(`${player.name} is replacing flower tile [${flower.type} ${flower.value}]...`);
        await this.sleep(400);

        const replacement = this.state.wall.drawFromBack();
        if (replacement) {
          player.hand.addTile(replacement);
        } else {
          break;
        }
      }
      player.hand.sort();
      this.triggerUpdate();
    }

    this.state.phase = GamePhase.OPEN_JIN;
    this.triggerUpdate('Flower replacement complete. Opening the Jin...');
    await this.sleep(1000);

    await this.openJin();
  }

  /**
   * Opens the Jin wildcard from the back of the wall.
   */
  async openJin() {
    const dealerHand = this.state.players[this.state.dealerIndex].hand;
    const { indicator, flowersGivenToDealer } = this.state.wall.revealJin(dealerHand);

    if (flowersGivenToDealer.length > 0) {
      this.triggerUpdate(`Flipped flower card(s) during Jin opening. Gained by dealer for free: ${flowersGivenToDealer.map(t => t.value).join(', ')}`);
      await this.sleep(800);
      dealerHand.sort();
    }

    this.triggerUpdate(`Jin opened! Indicator is [${indicator.type} ${indicator.value}]. The Jin wildcard is identical!`);
    await this.sleep(1500);

    // Starting playing phase
    this.state.phase = GamePhase.PLAYING;
    this.state.currentPlayerIndex = this.state.dealerIndex;

    this.triggerUpdate(`Game starts! Dealer ${this.state.players[this.state.dealerIndex].name}'s turn.`);
    await this.sleep(500);

    // Since dealer already has 17 cards, they do not draw; they must discard.
    await this.promptPlayerAction();
  }

  /**
   * Orchestrates the active player's draw or discard step.
   */
  async promptPlayerAction() {
    const activePlayer = this.state.players[this.state.currentPlayerIndex];

    if (activePlayer.isBot) {
      await this.sleep(this.delayMs);
      
      // 1. Check if bot has 3 Jins (San Jin Dao) in hand to win immediately
      const huCheck = RulesEngine.checkHu(activePlayer.hand, null, this.state.wall.jinTile, true);
      if (huCheck.hu) {
        await this.declareWin(this.state.currentPlayerIndex, null, huCheck.type, true);
        return;
      }

      // 2. Otherwise, bot discards
      const tileToDiscard = BotAI.decideDiscard(activePlayer.hand, this.state.wall.jinTile);
      if (tileToDiscard) {
        await this.executeDiscard(this.state.currentPlayerIndex, tileToDiscard);
      }
    } else {
      // Human player turn. UI will render buttons and allow card dragging/clicking.
      // Check if human can win on self-draw
      const huCheck = RulesEngine.checkHu(activePlayer.hand, null, this.state.wall.jinTile, true);
      if (huCheck.hu) {
        this.triggerUpdate('You drew a winning card! You can declare HU (胡) now or discard a card.');
      } else {
        this.triggerUpdate('Your turn. Select a tile to discard.');
      }
    }
  }

  /**
   * Draws a tile from the front of the wall for the current active player.
   */
  async drawCardForCurrentPlayer() {
    const player = this.state.players[this.state.currentPlayerIndex];
    let tile = this.state.wall.drawFromFront();

    if (!tile) {
      await this.declareFlow();
      return;
    }

    // If the drawn card is a flower, keep replacing it from the back
    while (tile && isFlower(tile)) {
      this.triggerUpdate(`${player.name} drew a flower [${tile.type} ${tile.value}] and replaces it...`);
      player.hand.addFlower(tile);
      await this.sleep(600);

      tile = this.state.wall.drawFromBack();
      if (!tile) {
        await this.declareFlow();
        return;
      }
    }

    // Standard card added to hand
    player.hand.addTile(tile);
    player.hand.sort();
    
    this.triggerUpdate(`${player.name} draws a card.`);
    
    // Check for self-draw wins
    const huCheck = RulesEngine.checkHu(player.hand, null, this.state.wall.jinTile, true);
    if (huCheck.hu) {
      if (player.isBot) {
        await this.sleep(800);
        await this.declareWin(this.state.currentPlayerIndex, null, huCheck.type, true);
        return;
      } else {
        this.triggerUpdate('You drew a winning card! Click HU (胡) to claim victory, or discard.');
      }
    }

    await this.promptPlayerAction();
  }

  /**
   * Executes a discard for a player.
   */
  async executeDiscard(playerIndex, tile) {
    const player = this.state.players[playerIndex];
    const removed = player.hand.removeTile(tile);

    if (!removed) return;

    player.hand.sort();
    player.discards.push(tile);
    
    this.state.discardedTile = tile;
    this.state.discarderIndex = playerIndex;

    this.triggerUpdate(`${player.name} discarded [${tile.type} ${tile.value}].`);
    
    // Check if other players can react (Hu, Kong, Pung, Chow)
    await this.resolveDiscardReactions();
  }

  /**
   * Checks other players' reactions to the discarded tile.
   */
  async resolveDiscardReactions() {
    const discardedTile = this.state.discardedTile;
    const discarderIdx = this.state.discarderIndex;
    const jinTemplate = this.state.wall.jinTile;

    const reactions = []; // List of valid reactions: { playerIdx, action, priority, tiles, details }

    // Priority rankings: Hu = 3, Kong/Pung = 2, Chow = 1
    for (let i = 0; i < 4; i++) {
      if (i === discarderIdx) continue; // Cannot react to own discard
      
      const player = this.state.players[i];
      const isNext = i === (discarderIdx + 1) % 4;

      if (player.isBot) {
        // Let bot decide
        const decision = BotAI.decideAction(player, discardedTile, discarderIdx, jinTemplate, isNext);
        if (decision.action !== 'pass') {
          reactions.push({
            playerIndex: i,
            action: decision.action,
            tiles: decision.tiles || [discardedTile],
            details: decision.details || null,
            priority: decision.action === 'hu' ? 3 : (['pung', 'kong'].includes(decision.action) ? 2 : 1)
          });
        }
      } else {
        // Check what actions human can take
        const canHu = RulesEngine.checkHu(player.hand, discardedTile, jinTemplate, false).hu;
        const canKong = RulesEngine.canKong(player.hand, discardedTile, jinTemplate);
        const canPung = RulesEngine.canPung(player.hand, discardedTile, jinTemplate);
        const possibleChows = RulesEngine.canChow(player.hand, discardedTile, jinTemplate, isNext);

        if (canHu || canKong || canPung || possibleChows.length > 0) {
          // Human has available reactions! Show control overlay.
          this.state.phase = GamePhase.WAITING_FOR_ACTION;
          this.triggerUpdate(`Waiting for your reaction to [${discardedTile.type} ${discardedTile.value}]...`);
          return; // Pause execution for human input
        }
      }
    }

    // If no human reactions were needed, resolve bot reactions immediately
    await this.executeBestReaction(reactions);
  }

  /**
   * Resolves human reactions (Pass, Chow, Pung, Kong, Hu).
   */
  async handleHumanReaction(action, payload = null) {
    const humanIdx = 0;
    const discardedTile = this.state.discardedTile;
    const discarderIdx = this.state.discarderIndex;
    const jinTemplate = this.state.wall.jinTile;

    const reactions = [];

    // Add human's choice
    if (action !== 'pass') {
      reactions.push({
        playerIndex: humanIdx,
        action,
        tiles: payload || [discardedTile],
        priority: action === 'hu' ? 3 : (['pung', 'kong'].includes(action) ? 2 : 1),
        details: action === 'hu' ? RulesEngine.checkHu(this.state.players[humanIdx].hand, discardedTile, jinTemplate, false).type : null
      });
    }

    // Add bots' choices
    for (let i = 1; i < 4; i++) {
      const bot = this.state.players[i];
      const isNext = i === (discarderIdx + 1) % 4;
      const decision = BotAI.decideAction(bot, discardedTile, discarderIdx, jinTemplate, isNext);
      
      if (decision.action !== 'pass') {
        reactions.push({
          playerIndex: i,
          action: decision.action,
          tiles: decision.tiles || [discardedTile],
          priority: decision.action === 'hu' ? 3 : (['pung', 'kong'].includes(decision.action) ? 2 : 1),
          details: decision.details || null
        });
      }
    }

    // Resolve the best reaction
    await this.executeBestReaction(reactions);
  }

  /**
   * Chooses the highest-priority reaction and executes it.
   * If there are no reactions, goes to the next turn.
   */
  async executeBestReaction(reactions) {
    if (reactions.length === 0) {
      // No reactions, move to next player's turn (they draw)
      this.state.phase = GamePhase.PLAYING;
      this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % 4;
      
      if (this.state.wall.isExhausted()) {
        await this.declareFlow();
      } else {
        await this.drawCardForCurrentPlayer();
      }
      return;
    }

    // Sort by priority (descending)
    reactions.sort((a, b) => b.priority - a.priority);
    const best = reactions[0];

    // Execute the action
    const player = this.state.players[best.playerIndex];
    const discarder = this.state.players[this.state.discarderIndex];

    // Remove the discarded card from discarder's pile
    discarder.discards.pop();

    if (best.action === 'hu') {
      await this.declareWin(best.playerIndex, this.state.discarderIndex, best.details, false);
    } else if (best.action === 'pung') {
      this.triggerUpdate(`${player.name} declares PUNG (碰) on [${this.state.discardedTile.type} ${this.state.discardedTile.value}]!`);
      
      // Remove 2 matching tiles from hand and capture them
      const removedTiles = [];
      for (let i = player.hand.privateHand.length - 1; i >= 0; i--) {
        const t = player.hand.privateHand[i];
        if (t.type === this.state.discardedTile.type && t.value === this.state.discardedTile.value) {
          player.hand.privateHand.splice(i, 1);
          removedTiles.push(t);
          if (removedTiles.length === 2) break;
        }
      }

      // Add meld using the discarded tile and the 2 actual tiles from hand
      player.hand.addMeld('pung', [this.state.discardedTile, ...removedTiles], this.state.discarderIndex);
      player.hand.sort();
      this.state.currentPlayerIndex = best.playerIndex;
      this.state.phase = GamePhase.PLAYING;
      
      await this.sleep(1000);
      await this.promptPlayerAction();
    } else if (best.action === 'kong') {
      this.triggerUpdate(`${player.name} declares KONG (杠) on [${this.state.discardedTile.type} ${this.state.discardedTile.value}]!`);
      
      // Remove 3 matching tiles from hand and capture them
      const removedTiles = [];
      for (let i = player.hand.privateHand.length - 1; i >= 0; i--) {
        const t = player.hand.privateHand[i];
        if (t.type === this.state.discardedTile.type && t.value === this.state.discardedTile.value) {
          player.hand.privateHand.splice(i, 1);
          removedTiles.push(t);
          if (removedTiles.length === 3) break;
        }
      }

      // Add meld using the discarded tile and the 3 actual tiles from hand
      player.hand.addMeld('kong', [this.state.discardedTile, ...removedTiles], this.state.discarderIndex);
      player.hand.sort();
      this.state.currentPlayerIndex = best.playerIndex;
      this.state.phase = GamePhase.PLAYING;
      
      await this.sleep(800);
      // Drawing replacement card from the back of the wall for the Kong!
      await this.drawReplacementFromBack(best.playerIndex);
    } else if (best.action === 'chow') {
      this.triggerUpdate(`${player.name} declares CHOW (吃) on [${this.state.discardedTile.type} ${this.state.discardedTile.value}]!`);
      
      let meldTiles = best.tiles;
      if (!meldTiles || !Array.isArray(meldTiles) || meldTiles.length !== 3) {
        const chows = RulesEngine.canChow(player.hand, this.state.discardedTile, this.state.wall?.jinTile, true);
        if (chows.length > 0) {
          meldTiles = [this.state.discardedTile, ...chows[0]];
        } else {
          meldTiles = [this.state.discardedTile];
        }
      }

      const handTiles = meldTiles.slice(1);
      for (const ht of handTiles) {
        player.hand.removeTile(ht);
      }

      player.hand.addMeld('chow', sortTiles(meldTiles), this.state.discarderIndex);
      player.hand.sort();
      this.state.currentPlayerIndex = best.playerIndex;
      this.state.phase = GamePhase.PLAYING;

      await this.sleep(1000);
      await this.promptPlayerAction();
    }
  }

  /**
   * Draws a replacement tile from the back of the wall (used after declaring a Kong).
   */
  async drawReplacementFromBack(playerIndex) {
    const player = this.state.players[playerIndex];
    const tile = this.state.wall.drawFromBack();

    if (!tile) {
      await this.declareFlow();
      return;
    }

    if (isFlower(tile)) {
      this.triggerUpdate(`${player.name} drew a flower [${tile.type} ${tile.value}] and replaces it...`);
      player.hand.addFlower(tile);
      await this.sleep(600);
      await this.drawReplacementFromBack(playerIndex);
      return;
    }

    player.hand.addTile(tile);
    player.hand.sort();
    this.triggerUpdate(`${player.name} draws a replacement tile for the Kong.`);
    
    // Check if the replacement card lets them win
    const huCheck = RulesEngine.checkHu(player.hand, null, this.state.wall.jinTile, true);
    if (huCheck.hu) {
      if (player.isBot) {
        await this.sleep(800);
        await this.declareWin(playerIndex, null, huCheck.type, true);
      } else {
        this.triggerUpdate('You drew a winning replacement card! Click HU (胡) to claim victory, or discard.');
      }
      return;
    }

    await this.promptPlayerAction();
  }

  /**
   * Declares an active player's An Kong (暗杠) or Bu Kong (补杠) during their turn.
   */
  async declareSelfKong(tileTemplate, isAnKong) {
    const idx = this.state.currentPlayerIndex;
    const player = this.state.players[idx];
    const jinTemplate = this.state.wall.jinTile;

    if (isAnKong) {
      this.triggerUpdate(`${player.name} declares An Kong (暗杠)!`);
      
      // Remove 4 tiles from private hand and capture them
      const removedTiles = [];
      for (let i = player.hand.privateHand.length - 1; i >= 0; i--) {
        const t = player.hand.privateHand[i];
        if (t.type === tileTemplate.type && t.value === tileTemplate.value) {
          player.hand.privateHand.splice(i, 1);
          removedTiles.push(t);
          if (removedTiles.length === 4) break;
        }
      }

      // Add as public meld using original tile objects (with IDs)
      player.hand.addMeld('kong', removedTiles, idx);
    } else {
      // Bu Kong (碰上加杠)
      this.triggerUpdate(`${player.name} promotes Pung to Kong (补杠)!`);
      
      // Find the Pung meld
      const meldIdx = player.hand.melds.findIndex(
        m => m.type === 'pung' && m.tiles[0].type === tileTemplate.type && m.tiles[0].value === tileTemplate.value
      );
      
      if (meldIdx !== -1) {
        // Remove 1 matching tile from private hand and get its actual object
        const pHandIdx = player.hand.privateHand.findIndex(
          t => t.type === tileTemplate.type && t.value === tileTemplate.value
        );
        if (pHandIdx !== -1) {
          const removedTile = player.hand.privateHand.splice(pHandIdx, 1)[0];
          
          // Promote meld
          const meld = player.hand.melds[meldIdx];
          meld.type = 'kong';
          meld.tiles.push(removedTile);
        }
      }
    }

    player.hand.sort();
    this.triggerUpdate();
    await this.sleep(800);
    
    // Draw replacement card
    await this.drawReplacementFromBack(idx);
  }

  /**
   * Handles winning (Hu) resolution.
   */
  async declareWin(winnerIdx, discarderIdx, winType, isSelfDraw) {
    const winner = this.state.players[winnerIdx];
    this.state.phase = GamePhase.GAME_OVER;
    this.state.winnerIndex = winnerIdx;

    // Calculate score
    const scoreBreakdown = RulesEngine.calculateScore(
      winner.hand,
      this.state.wall.jinTile,
      winType,
      isSelfDraw,
      this.state.dealerIndex,
      winnerIdx,
      this.state.lianzhuangCount
    );

    this.state.winDetails = {
      winType,
      isSelfDraw,
      scoreBreakdown
    };

    // Calculate points transfers
    const totalPoints = scoreBreakdown.total;
    if (isSelfDraw) {
      // Everyone pays the winner
      for (let i = 0; i < 4; i++) {
        if (i === winnerIdx) continue;
        this.state.players[i].points -= totalPoints;
        winner.points += totalPoints;
      }
      this.triggerUpdate(`${winner.name} won by SELF-DRAW (自摸) using [${winType}]! Earned +${totalPoints * 3} points (+${totalPoints} from each player).`);
    } else {
      // Discarder pays double, others pay single
      // Or in standard: discarder pays the full amount, or discarder pays double.
      // Under Fuzhou Rules: Discarder pays the full liability (包牌) or pays double.
      // Let's implement standard liability: Discarder pays totalPoints, others do not pay, or discarder pays double and others pay single.
      // Fuzhou Mahjong is typically "放炮者包三家" (the discarder pays for all three players' points!).
      // This is a highly authentic Fuzhou rule! Let's implement this "Bao Pai" (liability) rule: discarder pays 3 * totalPoints.
      const discarder = this.state.players[discarderIdx];
      const lossPoints = totalPoints * 3;
      discarder.points -= lossPoints;
      winner.points += lossPoints;
      
      this.triggerUpdate(`${winner.name} won by HU (胡) on ${discarder.name}'s discard! ${discarder.name} pays full liability of -${lossPoints} points.`);
    }

    // Update dealer streak
    if (winnerIdx === this.state.dealerIndex) {
      this.state.lianzhuangCount++; // Dealer streak continues
    } else {
      this.state.dealerIndex = (this.state.dealerIndex + 1) % 4; // Shift dealer
      this.state.lianzhuangCount = 0;
    }

    this.triggerUpdate();
  }

  /**
   * Handles draw (流局) resolution.
   */
  async declareFlow() {
    this.state.phase = GamePhase.GAME_OVER;
    this.state.winnerIndex = null;
    this.state.winDetails = null;

    // Shift dealer in case of flow (臭庄)
    // In Fuzhou rules, if it is a flow, does the dealer shift or stay?
    // Usually, dealer stays (consecutive Lianzhuang counts, or stays without increasing count).
    // Let's keep dealer as is.
    this.triggerUpdate('The Wall is exhausted! The game ends in a DRAW (流局). Dealer remains.');
    this.triggerUpdate();
  }
}
