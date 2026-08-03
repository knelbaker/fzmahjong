import { RulesEngine } from '../core/RulesEngine.js';

export class BotAI {
  /**
   * Evaluates the utility score of a specific tile in a player's hand.
   * Lower score means the tile is less useful and a better candidate to discard.
   */
  static evaluateTileUtility(tile, privateHand, jinTileTemplate) {
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

    // 3. Check for duplicates (pairs and triplets)
    const duplicates = normalTiles.filter(t => t.type === suit && t.value === val).length;
    if (duplicates === 1) {
      score += 15; // Forms a pair
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
    } else if (hasNeighbour1 || hasNeighbour2) {
      score += 10; // Forms a single connection (e.g. 4 and 5)
    }

    if (hasGap1 || hasGap2) {
      score += 5;  // Forms a jump connection (e.g. 3 and 5)
    }

    // 5. Prefer middle tiles (2-8) over terminals (1 and 9) if isolated
    if (duplicates === 0 && !hasNeighbour1 && !hasNeighbour2 && !hasGap1 && !hasGap2) {
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
  static decideDiscard(hand, jinTileTemplate) {
    const tiles = hand.privateHand;
    if (tiles.length === 0) return null;

    let lowestScore = Infinity;
    let chosenTile = tiles[0];

    for (const tile of tiles) {
      const score = this.evaluateTileUtility(tile, tiles, jinTileTemplate);
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
  static decideAction(botPlayer, discardedTile, discarderIndex, jinTileTemplate, isNextPlayer) {
    const hand = botPlayer.hand;

    // 1. Can bot Hu?
    const huCheck = RulesEngine.checkHu(hand, discardedTile, jinTileTemplate, false);
    if (huCheck.hu) {
      return { action: 'hu', tile: discardedTile, details: huCheck.type };
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
      // For simplicity, take the first chow option
      return { action: 'chow', tiles: [discardedTile, ...possibleChows[0]] };
    }

    // 5. Pass
    return { action: 'pass' };
  }
}
