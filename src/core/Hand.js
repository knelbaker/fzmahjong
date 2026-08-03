import { sortTiles } from './Tile.js';

export class Hand {
  constructor() {
    this.privateHand = []; // Hidden tiles in hand
    this.melds = [];       // Declared melds: { type: 'chow'|'pung'|'kong', tiles: Tile[], sourcePlayerId: number }
    this.flowers = [];     // Disclosed flower tiles (Winds, Dragons, Seasons, Plants)
  }

  /**
   * Adds a tile to the private hand.
   */
  addTile(tile) {
    this.privateHand.push(tile);
  }

  /**
   * Removes a tile from the private hand.
   * Checks by ID first, then falls back to type/value (helpful for simulations/AI).
   */
  removeTile(tile) {
    const idx = this.privateHand.findIndex(t => t.id === tile.id);
    if (idx !== -1) {
      this.privateHand.splice(idx, 1);
      return true;
    }
    const fallbackIdx = this.privateHand.findIndex(
      t => t.type === tile.type && t.value === tile.value
    );
    if (fallbackIdx !== -1) {
      this.privateHand.splice(fallbackIdx, 1);
      return true;
    }
    return false;
  }

  /**
   * Sorts the private hand.
   */
  sort() {
    this.privateHand = sortTiles(this.privateHand);
  }

  /**
   * Adds a declared meld to the player's public hand.
   */
  addMeld(type, tiles, sourcePlayerId) {
    this.melds.push({ type, tiles, sourcePlayerId });
  }

  /**
   * Adds a flower tile to the player's flower collection.
   */
  addFlower(tile) {
    this.flowers.push(tile);
  }

  /**
   * Creates a deep clone of the Hand, useful for AI lookaheads and rules validation.
   */
  clone() {
    const cloned = new Hand();
    cloned.privateHand = [...this.privateHand];
    cloned.melds = this.melds.map(m => ({ ...m, tiles: [...m.tiles] }));
    cloned.flowers = [...this.flowers];
    return cloned;
  }

  /**
   * Gets the count of active Jin (wildcard) tiles in the private hand.
   */
  getJinCount(jinTileTemplate) {
    if (!jinTileTemplate) return 0;
    return this.privateHand.filter(
      t => t.type === jinTileTemplate.type && t.value === jinTileTemplate.value
    ).length;
  }
}
