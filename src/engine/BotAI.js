import { RulesEngine } from '../core/RulesEngine.js';

export class BotAI {
  /**
   * Helper to collect all tiles that are visible to a specific player.
   * Visible tiles include:
   * 1. All players' discards.
   * 2. All players' melded sets (chow, pung, kong).
   * 3. The Jin indicator tile (if revealed).
   * 4. The player's own private hand.
   */
  static collectVisibleTiles(gameState, currentPlayerIndex) {
    const visible = [];
    if (!gameState) return visible;

    // 1. All players' discards
    if (gameState.players) {
      for (const player of gameState.players) {
        if (player.discards) {
          visible.push(...player.discards);
        }
      }
    }

    // 2. All players' melds
    if (gameState.players) {
      for (const player of gameState.players) {
        if (player.hand && player.hand.melds) {
          for (const meld of player.hand.melds) {
            if (meld.tiles) {
              visible.push(...meld.tiles);
            }
          }
        }
      }
    }

    // 3. Jin indicator
    if (gameState.wall) {
      if (gameState.wall.jinIndicator) {
        visible.push(gameState.wall.jinIndicator);
      } else if (gameState.wall.jinTile) {
        visible.push(gameState.wall.jinTile);
      }
    }

    // 4. Current player's own private hand
    const currentPlayer = gameState.players[currentPlayerIndex];
    if (currentPlayer && currentPlayer.hand && currentPlayer.hand.privateHand) {
      visible.push(...currentPlayer.hand.privateHand);
    }

    return visible;
  }

  /**
   * Evaluates the utility score of a specific tile in a player's hand.
   * Lower score means the tile is less useful and a better candidate to discard.
   */
  static evaluateTileUtility(tile, privateHand, jinTileTemplate, difficulty = 'medium', visibleTiles = []) {
    // 1. Never discard a Jin tile
    if (RulesEngine.isJin(tile, jinTileTemplate)) {
      return 9999;
    }

    // 2. Flower tiles should already be replaced, but if any exist, discard immediately
    if (['wind', 'dragon', 'season', 'plant'].includes(tile.type)) {
      return -100;
    }

    let score = 0;
    const val = tile.value;
    const suit = tile.type;

    // Filter out Jin tiles for relative connection checking
    const normalTiles = privateHand.filter(t => !RulesEngine.isJin(t, jinTileTemplate) && t.id !== tile.id);

    // Helper to count visible matching tiles
    const getVisibleCount = (type, value) => {
      return visibleTiles.filter(t => t.type === type && t.value === value).length;
    };

    // 3. Check for duplicates (pairs and triplets)
    const duplicates = normalTiles.filter(t => t.type === suit && t.value === val).length;
    if (duplicates === 1) {
      score += 15; // Forms a pair
      if (difficulty === 'hard') {
        const visCount = getVisibleCount(suit, val);
        if (visCount >= 4) {
          score -= 10; // The pair is dead for forming triplets
        }
      }
    } else if (duplicates === 2) {
      score += 35; // Forms a triplet
    } else if (duplicates === 3) {
      score += 45; // Forms a quad
    }

    // 4. Check for sequence connections (only for suit tiles)
    const hasNeighbour1 = normalTiles.some(t => t.type === suit && t.value === val - 1);
    const hasNeighbour2 = normalTiles.some(t => t.type === suit && t.value === val + 1);
    const hasGap1 = normalTiles.some(t => t.type === suit && t.value === val - 2);
    const hasGap2 = normalTiles.some(t => t.type === suit && t.value === val + 2);

    if (hasNeighbour1 && hasNeighbour2) {
      score += 25; // Forms a double-sided sequence (e.g. have 3, 4 and evaluating 5)
      if (difficulty === 'hard') {
        const remainingWaits1 = 4 - getVisibleCount(suit, val - 2);
        const remainingWaits2 = 4 - getVisibleCount(suit, val + 2);
        if (remainingWaits1 <= 0 && remainingWaits2 <= 0) {
          score -= 20; // Both waits are dead!
        } else if (remainingWaits1 <= 0 || remainingWaits2 <= 0) {
          score -= 8; // One side of the wait is dead
        }
      }
    } else if (hasNeighbour1 || hasNeighbour2) {
      score += 10; // Forms a single connection (e.g. 4 and 5)
      if (difficulty === 'hard') {
        if (hasNeighbour1) {
          const remainingWaits1 = 4 - getVisibleCount(suit, val - 2);
          const remainingWaits2 = 4 - getVisibleCount(suit, val + 1);
          if (remainingWaits1 <= 0 && remainingWaits2 <= 0) {
            score -= 8;
          }
        } else if (hasNeighbour2) {
          const remainingWaits1 = 4 - getVisibleCount(suit, val - 1);
          const remainingWaits2 = 4 - getVisibleCount(suit, val + 2);
          if (remainingWaits1 <= 0 && remainingWaits2 <= 0) {
            score -= 8;
          }
        }
      }
    }

    if (hasGap1 || hasGap2) {
      score += 5;  // Forms a jump connection (e.g. 3 and 5)
      if (difficulty === 'hard') {
        if (hasGap1) {
          const remainingWaits = 4 - getVisibleCount(suit, val - 1);
          if (remainingWaits <= 0) {
            score -= 4;
          }
        }
        if (hasGap2) {
          const remainingWaits = 4 - getVisibleCount(suit, val + 1);
          if (remainingWaits <= 0) {
            score -= 4;
          }
        }
      }
    }

    // 5. Prefer middle tiles (2-8) over terminals (1 and 9) if isolated
    if (duplicates === 0 && !hasNeighbour1 && !hasNeighbour2 && !hasGap1 && !hasGap2) {
      if (difficulty === 'hard') {
        const visCount = getVisibleCount(suit, val);
        if (visCount >= 4) {
          score -= 15; // Isolated and completely dead
        } else if (visCount === 3) {
          score -= 5;  // Hard to pair
        }
      }
      if (val === 1 || val === 9) {
        score -= 5; // Terminal penalty
      } else {
        score -= 2; // Middle isolation penalty
      }
    }

    // Add a tiny random factor to avoid deterministic behavior when scores match
    score += Math.random() * 0.5;

    return score;
  }

  /**
   * Decides which tile the bot should discard on its turn.
   * Returns the selected Tile object.
   */
  static decideDiscard(player, jinTileTemplate, gameState = null) {
    const hand = player.hand;
    const tiles = hand.privateHand;
    if (tiles.length === 0) return null;

    const difficulty = player.difficulty || 'medium';
    const allVisibleTiles = gameState ? this.collectVisibleTiles(gameState, player.id) : [];

    // Easy bot has a 30% chance to discard a completely random non-Jin tile
    if (difficulty === 'easy' && Math.random() < 0.3) {
      const nonJinTiles = tiles.filter(t => !RulesEngine.isJin(t, jinTileTemplate));
      if (nonJinTiles.length > 0) {
        return nonJinTiles[Math.floor(Math.random() * nonJinTiles.length)];
      }
    }

    let lowestScore = Infinity;
    let chosenTile = tiles[0];

    for (const tile of tiles) {
      const score = this.evaluateTileUtility(tile, tiles, jinTileTemplate, difficulty, allVisibleTiles);
      if (score < lowestScore) {
        lowestScore = score;
        chosenTile = tile;
      }
    }

    return chosenTile;
  }

  /**
   * Decides what action the bot should take in response to another player's discard.
   * Order of priority: Hu (胡) > Kong (杠) > Pung (碰) > Chow (吃) > Pass
   */
  static decideAction(botPlayer, discardedTile, discarderIndex, jinTileTemplate, isNextPlayer, gameState = null) {
    const hand = botPlayer.hand;
    const difficulty = botPlayer.difficulty || 'medium';
    const allVisibleTiles = gameState ? this.collectVisibleTiles(gameState, botPlayer.id) : [];

    // 1. Can bot Hu?
    const huCheck = RulesEngine.checkHu(hand, discardedTile, jinTileTemplate, false);
    if (huCheck.hu) {
      // Easy bots might miss a Hu with a small probability (5% chance)
      if (difficulty === 'easy' && Math.random() < 0.05) {
        // Missed Hu
      } else {
        return { action: 'hu', tile: discardedTile, details: huCheck.type };
      }
    }

    // Easy bots have a 30% chance to pass on other meld actions (Kong, Pung, Chow)
    if (difficulty === 'easy' && Math.random() < 0.3) {
      return { action: 'pass' };
    }

    // 2. Can bot Kong?
    if (RulesEngine.canKong(hand, discardedTile, jinTileTemplate)) {
      return { action: 'kong', tile: discardedTile };
    }

    // 3. Can bot Pung?
    if (RulesEngine.canPung(hand, discardedTile, jinTileTemplate)) {
      return { action: 'pung', tile: discardedTile };
    }

    // 4. Can bot Chow?
    const possibleChows = RulesEngine.canChow(hand, discardedTile, jinTileTemplate, isNextPlayer);
    if (possibleChows.length > 0) {
      // Hard difficulty: Select chow option that maximizes remaining hand utility
      if (difficulty === 'hard') {
        let bestChow = possibleChows[0];
        let bestHandUtility = -Infinity;
        for (const chowOption of possibleChows) {
          const tempPrivateHand = hand.privateHand.filter(t => !chowOption.some(ct => ct.id === t.id));
          let utility = 0;
          for (const t of tempPrivateHand) {
            utility += this.evaluateTileUtility(t, tempPrivateHand, jinTileTemplate, 'hard', allVisibleTiles);
          }
          if (utility > bestHandUtility) {
            bestHandUtility = utility;
            bestChow = chowOption;
          }
        }
        return { action: 'chow', tiles: [discardedTile, ...bestChow] };
      }

      // Medium/default: take the first chow option
      return { action: 'chow', tiles: [discardedTile, ...possibleChows[0]] };
    }

    // 5. Pass
    return { action: 'pass' };
  }
}
