import { generateAllTiles, isFlower } from './Tile.js';

export class Wall {
  constructor() {
    this.tiles = generateAllTiles();
    this.jinIndicator = null;
    this.jinTile = null;
    this.deadWallCount = 18; // Game ends in a draw (流局) when 18 tiles remain
  }

  /**
   * Shuffles the tiles using the Fisher-Yates algorithm.
   */
  shuffle() {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  /**
   * Draws a tile from the front of the wall.
   */
  drawFromFront() {
    if (this.isExhausted()) return null;
    return this.tiles.shift();
  }

  /**
   * Draws a tile from the back of the wall (used for flower replacement and Kongs).
   */
  drawFromBack() {
    if (this.isExhausted()) return null;
    return this.tiles.pop();
  }

  /**
   * Checks if the wall has reached the dead wall threshold (usually 18 tiles).
   */
  isExhausted() {
    return this.tiles.length <= this.deadWallCount;
  }

  /**
   * Gets the total number of tiles remaining in the wall.
   */
  getRemainingCount() {
    return this.tiles.length;
  }

  /**
   * Opens the Jin.
   * Flips a tile from the back of the wall. 
   * If it is a flower tile, it is given to the dealer (player index 0) and we flip another,
   * until a suit tile is revealed.
   * Returns: { indicator: Tile, flowersGivenToDealer: Tile[] }
   */
  revealJin(dealerHand) {
    console.log("revealJin started. Wall size:", this.tiles.length);
    const flowersGivenToDealer = [];
    let indicator = null;

    while (this.tiles.length > this.deadWallCount) {
      // Pop the indicator tile from the back end of the wall
      const tile = this.tiles.pop();
      console.log("Popped tile:", JSON.stringify(tile));

      if (isFlower(tile)) {
        console.log("Tile is flower. Moving to dealer flowers.");
        // Flower tile goes directly to dealer's flower pile (without replacement)
        dealerHand.addFlower(tile);
        flowersGivenToDealer.push(tile);
      } else {
        console.log("Tile is SUIT. Setting indicator!");
        // Suit tile is the Jin indicator
        indicator = tile;
        this.jinIndicator = tile;
        // The wildcard tile is identical to the indicator tile itself
        this.jinTile = { type: tile.type, value: tile.value };
        break;
      }
    }

    console.log("revealJin completed. Indicator:", indicator, "Flowers count:", flowersGivenToDealer.length);
    return { indicator, flowersGivenToDealer };
  }
}
