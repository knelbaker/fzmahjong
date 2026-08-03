import { isFlower } from './Tile.js';

export class RulesEngine {
  /**
   * Check if a tile is a Jin (wildcard).
   */
  static isJin(tile, jinTileTemplate) {
    if (!tile || !jinTileTemplate) return false;
    return tile.type === jinTileTemplate.type && tile.value === jinTileTemplate.value;
  }

  /**
   * Check if a player can Chow (吃) a discarded tile.
   * Rules:
   * 1. Only the next player in turn order (下家) can Chow.
   * 2. Cannot Chow if the discarded tile is a Jin (金).
   * 3. Cannot use Jin as a wildcard in the Chow meld.
   * 4. Discarded tile must form a consecutive sequence (e.g. 1-2-3) of the same suit.
   */
  static canChow(hand, discardedTile, jinTileTemplate, isNextPlayer) {
    if (!isNextPlayer) return [];
    if (!discardedTile) return [];
    if (this.isJin(discardedTile, jinTileTemplate)) return []; // Cannot Chow a discarded Jin
    if (isFlower(discardedTile)) return []; // Cannot Chow flower tiles

    const suit = discardedTile.type;
    if (!['character', 'dot', 'bamboo'].includes(suit)) return [];

    const val = discardedTile.value;
    const privateTiles = hand.privateHand.filter(t => !this.isJin(t, jinTileTemplate));

    const possibleChows = [];

    // Check for val-2, val-1
    const hasMinus2 = privateTiles.some(t => t.type === suit && t.value === val - 2);
    const hasMinus1 = privateTiles.some(t => t.type === suit && t.value === val - 1);
    if (hasMinus2 && hasMinus1) {
      possibleChows.push([
        privateTiles.find(t => t.type === suit && t.value === val - 2),
        privateTiles.find(t => t.type === suit && t.value === val - 1)
      ]);
    }

    // Check for val-1, val+1
    const hasPlus1 = privateTiles.some(t => t.type === suit && t.value === val + 1);
    if (hasMinus1 && hasPlus1) {
      possibleChows.push([
        privateTiles.find(t => t.type === suit && t.value === val - 1),
        privateTiles.find(t => t.type === suit && t.value === val + 1)
      ]);
    }

    // Check for val+1, val+2
    const hasPlus2 = privateTiles.some(t => t.type === suit && t.value === val + 2);
    if (hasPlus1 && hasPlus2) {
      possibleChows.push([
        privateTiles.find(t => t.type === suit && t.value === val + 1),
        privateTiles.find(t => t.type === suit && t.value === val + 2)
      ]);
    }

    return possibleChows;
  }

  /**
   * Check if a player can Pung (碰) a discarded tile.
   * Rules:
   * 1. Cannot Pung if the discarded tile is a Jin (金).
   * 2. Must have 2 identical suit/non-flower tiles in hand.
   * 3. Cannot use Jin as a wildcard in Pung.
   */
  static canPung(hand, discardedTile, jinTileTemplate) {
    if (!discardedTile) return false;
    if (this.isJin(discardedTile, jinTileTemplate)) return false; // Cannot Pung a discarded Jin
    if (isFlower(discardedTile)) return false;

    const privateTiles = hand.privateHand.filter(t => !this.isJin(t, jinTileTemplate));
    const matchingCount = privateTiles.filter(
      t => t.type === discardedTile.type && t.value === discardedTile.value
    ).length;

    return matchingCount >= 2;
  }

  /**
   * Check if a player can Kong (明杠) a discarded tile.
   * Rules:
   * 1. Cannot Kong if the discarded tile is a Jin (金).
   * 2. Must have 3 identical tiles in hand.
   */
  static canKong(hand, discardedTile, jinTileTemplate) {
    if (!discardedTile) return false;
    if (this.isJin(discardedTile, jinTileTemplate)) return false;
    if (isFlower(discardedTile)) return false;

    const privateTiles = hand.privateHand.filter(t => !this.isJin(t, jinTileTemplate));
    const matchingCount = privateTiles.filter(
      t => t.type === discardedTile.type && t.value === discardedTile.value
    ).length;

    return matchingCount === 3;
  }

  /**
   * Check if a player has an An Kong (暗杠) in hand.
   * Returns list of matching tile templates { type, value } that can be Konged.
   */
  static checkAnKongs(hand, jinTileTemplate) {
    const anKongs = [];
    const privateTiles = hand.privateHand.filter(t => !this.isJin(t, jinTileTemplate));

    // Group tiles by type and value
    const counts = {};
    for (const t of privateTiles) {
      const key = `${t.type}_${t.value}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    for (const key in counts) {
      if (counts[key] === 4) {
        const [type, valStr] = key.split('_');
        anKongs.push({ type, value: parseInt(valStr) });
      }
    }

    return anKongs;
  }

  /**
   * Check if a player can promote an existing Pung to a Kong (补杠) using a drawn tile.
   */
  static checkBuKongs(hand, jinTileTemplate) {
    const buKongs = [];
    const privateTiles = hand.privateHand.filter(t => !this.isJin(t, jinTileTemplate));

    for (const meld of hand.melds) {
      if (meld.type === 'pung') {
        const pungTile = meld.tiles[0];
        const hasFourth = privateTiles.some(
          t => t.type === pungTile.type && t.value === pungTile.value
        );
        if (hasFourth) {
          buKongs.push({ type: pungTile.type, value: pungTile.value });
        }
      }
    }

    return buKongs;
  }

  /**
   * Checks if the hand is winning (Hu).
   * Returns: { hu: boolean, type: string | null }
   */
  static checkHu(hand, drawnTile, jinTileTemplate, isSelfDraw) {
    // 1. Setup temporary hand for analysis
    const tempHand = (hand && typeof hand.clone === 'function')
      ? hand.clone()
      : {
          privateHand: [...(hand?.privateHand || [])],
          melds: hand?.melds ? hand.melds.map(m => ({ ...m, tiles: [...m.tiles] })) : [],
          flowers: [...(hand?.flowers || [])],
          clone() {
            return {
              privateHand: [...this.privateHand],
              melds: this.melds.map(m => ({ ...m, tiles: [...m.tiles] })),
              flowers: [...this.flowers],
              clone: this.clone
            };
          }
        };
    if (drawnTile) {
      tempHand.addTile(drawnTile);
    }

    // Filter out Jin tiles to count wildcards
    const jinCount = tempHand.getJinCount(jinTileTemplate);
    const nonJinTiles = tempHand.privateHand.filter(t => !this.isJin(t, jinTileTemplate));

    // 2. Check San Jin Dao (三金倒) - 3 or more Jins in hand is an immediate win
    if (jinCount >= 3) {
      return { hu: true, type: 'SanJinDao' };
    }

    // 3. Perform standard Hu validation (5 melds + 1 pair)
    // Note: Fuzhou Mahjong is played with 16 tiles in hand, 17 when drawing.
    // Each open meld reduces private hand by 3.
    // The equation: total melds = open melds + closed melds.
    // Total tiles to match = private hand size.
    // If we have total tiles, we need (tiles.length - 2) / 3 melds and 1 pair.
    if ((nonJinTiles.length + jinCount - 2) % 3 !== 0) {
      return { hu: false, type: null };
    }

    // Let's check standard Hu paths and pick the highest scoring type.
    const standardHuResult = this.validateStandardHu(nonJinTiles, jinCount);
    if (standardHuResult.hu) {
      if (jinCount === 0) {
        return { hu: true, type: 'NoJin' };
      }
      return standardHuResult;
    }

    return { hu: false, type: null };
  }

  /**
   * Recursively validates if tiles + wildcards can form melds and a pair.
   * Prioritizes checking Special Wins like JinQue and JinLong.
   */
  static validateStandardHu(tiles, jinCount) {
    let canWin = false;
    let winType = 'PingHu';

    // Sort tiles to make sequence matching easy
    const sortedTiles = [...tiles].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.value - b.value;
    });

    // Extract unique tiles to try as pairs (Eye / 将)
    const uniqueTiles = [];
    const seen = new Set();
    for (const t of sortedTiles) {
      const key = `${t.type}_${t.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTiles.push(t);
      }
    }

    // Helper for removing one instance of a tile
    const removeOne = (arr, type, val) => {
      const idx = arr.findIndex(t => t.type === type && t.value === val);
      if (idx === -1) return arr;
      const copy = [...arr];
      copy.splice(idx, 1);
      return copy;
    };

    // Helper to recursively check if the remaining tiles can form melds
    const checkMelds = (remainingTiles, jinsLeft, usedJinForDragon = false) => {
      if (remainingTiles.length === 0) {
        return { success: jinsLeft % 3 === 0, usedJinForDragon: usedJinForDragon || (jinsLeft >= 3) };
      }

      const first = remainingTiles[0];
      const count = remainingTiles.filter(t => t.type === first.type && t.value === first.value).length;

      // Path A: Try to make a Triplet (刻子)
      for (let jUsed = 0; jUsed <= 2; jUsed++) {
        if (count + jUsed >= 3 && jinsLeft >= jUsed) {
          let nextTiles = [...remainingTiles];
          let removed = 0;
          for (let i = nextTiles.length - 1; i >= 0; i--) {
            if (nextTiles[i].type === first.type && nextTiles[i].value === first.value) {
              nextTiles.splice(i, 1);
              removed++;
              if (removed === 3 - jUsed) break;
            }
          }
          const res = checkMelds(nextTiles, jinsLeft - jUsed, usedJinForDragon || (jUsed > 0));
          if (res.success) return res;
        }
      }

      // Path B: Try to make a Sequence (顺子 - only for suits)
      if (['character', 'dot', 'bamboo'].includes(first.type)) {
        const v1 = first.value;
        const v2 = v1 + 1;
        const v3 = v1 + 2;

        if (v3 <= 9) {
          const hasV2 = remainingTiles.some(t => t.type === first.type && t.value === v2);
          const hasV3 = remainingTiles.some(t => t.type === first.type && t.value === v3);

          // Option B1: Have both v2 and v3 (0 Jin)
          if (hasV2 && hasV3) {
            const nextTiles = removeOne(removeOne(removeOne(remainingTiles, first.type, v1), first.type, v2), first.type, v3);
            const res = checkMelds(nextTiles, jinsLeft, usedJinForDragon);
            if (res.success) return res;
          }
          // Option B2: Have v2, need v3 (1 Jin)
          if (hasV2 && jinsLeft >= 1) {
            const nextTiles = removeOne(removeOne(remainingTiles, first.type, v1), first.type, v2);
            const res = checkMelds(nextTiles, jinsLeft - 1, usedJinForDragon);
            if (res.success) return res;
          }
          // Option B3: Have v3, need v2 (1 Jin)
          if (hasV3 && jinsLeft >= 1) {
            const nextTiles = removeOne(removeOne(remainingTiles, first.type, v1), first.type, v3);
            const res = checkMelds(nextTiles, jinsLeft - 1, usedJinForDragon);
            if (res.success) return res;
          }
          // Option B4: Need both v2 and v3 (2 Jins)
          if (jinsLeft >= 2) {
            const nextTiles = removeOne(remainingTiles, first.type, v1);
            const res = checkMelds(nextTiles, jinsLeft - 2, usedJinForDragon);
            if (res.success) return res;
          }
        }
      }

      return { success: false, usedJinForDragon: false };
    };

    // 1. Try Jin Que (金雀) - Using 2 Jins as the pair
    if (jinCount >= 2) {
      const res = checkMelds(sortedTiles, jinCount - 2);
      if (res.success) {
        canWin = true;
        winType = 'JinQue'; // 2 Jins as pair
      }
    }

    // 2. Try standard pairs
    for (const t of uniqueTiles) {
      const count = sortedTiles.filter(x => x.type === t.type && x.value === t.value).length;

      // Case A: Natural pair (0 Jin used for pair)
      if (count >= 2) {
        const nextTiles = removeOne(removeOne(sortedTiles, t.type, t.value), t.type, t.value);
        const res = checkMelds(nextTiles, jinCount);
        if (res.success) {
          canWin = true;
          // Check if we used 3 Jins in a triplet elsewhere (Jin Long)
          if (res.usedJinForDragon || jinCount >= 3) {
            winType = 'JinLong';
          } else if (winType !== 'JinQue') {
            winType = 'PingHu';
          }
        }
      }

      // Case B: Pair made with 1 Jin (1 Jin used for pair)
      if (count >= 1 && jinCount >= 1) {
        const nextTiles = removeOne(sortedTiles, t.type, t.value);
        const res = checkMelds(nextTiles, jinCount - 1);
        if (res.success) {
          canWin = true;
          if (winType !== 'JinQue' && winType !== 'JinLong') {
            winType = 'PingHu';
          }
        }
      }
    }

    return { hu: canWin, type: canWin ? winType : null };
  }

  /**
   * Calculates final points (水) based on hand configuration.
   * Formula:
   * Total = (Base + Flowers + JinCount + Kongs + DealerStreak) * WinMultiplier
   */
  static calculateScore(winnerHand, jinTileTemplate, winType, isSelfDraw, dealerIndex, winnerIndex, lianzhuangCount) {
    const baseScore = 3;

    // 1. Count Flowers
    // Winds, Dragons, Seasons, Plants are all flowers.
    // Plus, 4 identical winds/dragons (字杠) or full seasons/plants sets count as 6 flowers.
    let flowerCount = 0;
    const flowerMap = {};
    for (const f of winnerHand.flowers) {
      const key = `${f.type}_${f.value}`;
      flowerMap[key] = (flowerMap[key] || 0) + 1;
    }

    // Add normal flower count
    flowerCount += winnerHand.flowers.length;

    // Check for special groups of 4 (字杠) or seasons/plants runs
    // 4 of same Wind or Dragon adds 2 extra flower points (usually 4 natural + 2 extra = 6 total)
    for (const key in flowerMap) {
      if (flowerMap[key] === 4) {
        flowerCount += 2; 
      }
    }

    // 2. Count Jin cards in hand
    const jinsInHand = winnerHand.getJinCount(jinTileTemplate);

    // 3. Count Kongs
    let kongPoints = 0;
    for (const meld of winnerHand.melds) {
      if (meld.type === 'kong') {
        // If it's a wind or dragon kong, it counts as a word-kong (字杠, 2 pts), otherwise 1 pt.
        const firstTile = meld.tiles[0];
        const isWord = ['wind', 'dragon'].includes(firstTile.type);
        kongPoints += isWord ? 2 : 1;
      }
    }

    // Add 暗杠 (An Kong) points
    // Fuzhou rules usually give An Kong 2x flower points
    // We will parse An Kongs during state and award points.
    // If it's passed as part of player's melds:
    // Let's assume meld.type === 'kong' and meld.isAnKong = true adds +2 instead of +1.

    // 4. Dealer consecutive streak (连庄)
    let dealerPoints = 0;
    if (winnerIndex === dealerIndex) {
      dealerPoints = lianzhuangCount * 2;
    }

    // Sum base elements
    const subtotal = baseScore + flowerCount + jinsInHand + kongPoints + dealerPoints;

    // 5. Multipliers based on Win Type (番)
    let multiplier = 1;
    switch (winType) {
      case 'SanJinDao':
        multiplier = 3;
        break;
      case 'JinQue':
      case 'JinLong':
        multiplier = 4;
        break;
      case 'NoJin':
        multiplier = 2; // Win without using Jin
        break;
      case 'PingHu':
      default:
        multiplier = 1;
        break;
    }

    // Self draw (自摸) doubles the score
    if (isSelfDraw) {
      multiplier *= 2;
    }

    const total = subtotal * multiplier;

    return {
      base: baseScore,
      flowers: flowerCount,
      jins: jinsInHand,
      kongs: kongPoints,
      dealerStreak: dealerPoints,
      subtotal,
      multiplier,
      total
    };
  }
}
