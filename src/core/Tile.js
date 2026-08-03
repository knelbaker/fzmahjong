export const SUITS = ['character', 'dot', 'bamboo']; // 万, 筒, 条
export const FLOWERS = ['wind', 'dragon', 'season', 'plant']; // 风, 箭, 季, 花

export const TILE_SORT_ORDER = {
  'character': 1,
  'dot': 2,
  'bamboo': 3,
  'wind': 4,
  'dragon': 5,
  'season': 6,
  'plant': 7
};

export const WIND_NAMES = {
  1: 'East',   // 东
  2: 'South',  // 南
  3: 'West',   // 西
  4: 'North'   // 北
};

export const DRAGON_NAMES = {
  1: 'Zhong',  // 中
  2: 'Fa',     // 发
  3: 'Bai'     // 白
};

export const SEASON_NAMES = {
  1: 'Spring', // 春
  2: 'Summer', // 夏
  3: 'Autumn', // 秋
  4: 'Winter'  // 冬
};

export const PLANT_NAMES = {
  1: 'Plum',         // 梅
  2: 'Orchid',       // 兰
  3: 'Bamboo',       // 竹
  4: 'Chrysanthemum' // 菊
};

export function createTile(type, value, id) {
  return { id, type, value };
}

/**
 * Generates the complete set of 144 Fuzhounese Mahjong tiles.
 */
export function generateAllTiles() {
  const tiles = [];
  let idCounter = 0;

  // 1. Suit tiles (4 of each card: 9 * 3 * 4 = 108 tiles)
  for (const suit of SUITS) {
    for (let value = 1; value <= 9; value++) {
      for (let i = 0; i < 4; i++) {
        tiles.push(createTile(suit, value, `tile_${idCounter++}`));
      }
    }
  }

  // 2. Winds (4 of each: East, South, West, North = 16 tiles)
  for (let value = 1; value <= 4; value++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(createTile('wind', value, `tile_${idCounter++}`));
    }
  }

  // 3. Dragons (4 of each: Zhong, Fa, Bai = 12 tiles)
  for (let value = 1; value <= 3; value++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(createTile('dragon', value, `tile_${idCounter++}`));
    }
  }

  // 4. Seasons (1 of each: Spring, Summer, Autumn, Winter = 4 tiles)
  for (let value = 1; value <= 4; value++) {
    tiles.push(createTile('season', value, `tile_${idCounter++}`));
  }

  // 5. Plants (1 of each: Plum, Orchid, Bamboo, Chrysanthemum = 4 tiles)
  for (let value = 1; value <= 4; value++) {
    tiles.push(createTile('plant', value, `tile_${idCounter++}`));
  }

  return tiles;
}

/**
 * Sorts an array of tiles by suit/flower order and then by numerical value.
 */
export function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    if (a.type !== b.type) {
      return TILE_SORT_ORDER[a.type] - TILE_SORT_ORDER[b.type];
    }
    return a.value - b.value;
  });
}

/**
 * In Fuzhou rules, Winds, Dragons, Seasons, and Plants are all treated as Flower tiles
 * that must be replaced (补花) and count towards scoring.
 */
export function isFlower(tile) {
  return FLOWERS.includes(tile.type);
}

/**
 * Helper to display the tile in a human-readable format.
 */
export function getTileName(tile) {
  if (tile.type === 'character') return `${tile.value} Wan`;
  if (tile.type === 'dot') return `${tile.value} Tong`;
  if (tile.type === 'bamboo') return `${tile.value} Tiao`;
  if (tile.type === 'wind') return `${WIND_NAMES[tile.value]} Wind`;
  if (tile.type === 'dragon') return `${DRAGON_NAMES[tile.value]}`;
  if (tile.type === 'season') return `${SEASON_NAMES[tile.value]}`;
  if (tile.type === 'plant') return `${PLANT_NAMES[tile.value]}`;
  return 'Unknown';
}
