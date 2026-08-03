# Fuzhounese Mahjong: System Hierarchy & Architecture Plan

This document outlines the software architecture, class hierarchy, rules engine, bot AI strategy, and UI hierarchy for the **Fuzhounese Mahjong (福州麻将)** game. 

---

## 1. Project Directory Structure
We will organize the project using a modern, modular TypeScript structure. This ensures a clean separation of concerns between core Mahjong rules, bot AI, game state machine, and the visual rendering layer.

```
fzmahjong/
│
├── src/
│   ├── core/                  # Core game logic (independent of UI)
│   │   ├── Tile.ts            # Tile definitions, types, and sequence mappings
│   │   ├── Hand.ts            # Player hand representation and meld tracking
│   │   ├── Wall.ts            # Mahjong wall/deck (144 tiles, draw/replace flow)
│   │   ├── RulesEngine.ts     # Fuzhou Mahjong rules (Hu validation, scoring)
│   │   └── GameState.ts       # Central game state type definitions
│   │
│   ├── engine/                # Game loop and orchestration
│   │   ├── GameController.ts  # State machine, turn driver, action resolution
│   │   └── BotAI.ts           # Heuristic-based bot decision maker
│   │
│   ├── ui/                    # Presentation and interaction
│   │   ├── components/
│   │   │   ├── Table.ts       # Main green felt mahjong table component
│   │   │   ├── HandView.ts    # Player's tiles, including hover and selection
│   │   │   ├── MeldView.ts    # Open melds (Chow, Pung, Kong) & Flowers
│   │   │   ├── DiscardView.ts # Discard piles (河) for all 4 players
│   │   │   └── ControlPanel.ts# Action buttons (Chow, Pung, Kong, Hu, Pass)
│   │   ├── SoundManager.ts    # Game sounds (discards, announcements, wins)
│   │   └── Renderer.ts        # Main UI orchestrator (DOM updates, animations)
│   │
│   ├── assets/                # Images, sounds, and global stylesheets
│   │   ├── styles/
│   │   │   └── index.css      # Core styling, variables, theme, and animations
│   │   └── audio/             # Sound effects
│   │
│   └── index.ts               # Application entry point
│
├── system_hierarchy.md        # Architectural documentation (this file)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 2. Core Domain Models (Data Structures)

### 2.1. Tile Representation (`Tile.ts`)
Fuzhounese Mahjong uses **144 tiles**. All Winds (东南西北) and Dragons (中发白), along with Seasons and Plants, are classified as **Flower (花) tiles** and cannot form melds in the hand.

```typescript
export type Suit = 'character' | 'dot' | 'bamboo'; // 万, 饼, 条
export type FlowerType = 'wind' | 'dragon' | 'season' | 'plant'; // 风, 箭, 季, 花

export type TileType = Suit | FlowerType;

export interface Tile {
  id: string;        // Unique ID for UI rendering keys and tracking
  type: TileType;
  value: number;     // 1-9 for Suits; 1-4 for Winds/Seasons/Plants; 1-3 for Dragons
}
```

### 2.2. Player Hand (`Hand.ts`)
Tracks a player's private tiles, declared melds, and revealed flower tiles.

```typescript
export type MeldType = 'chow' | 'pung' | 'kong';

export interface Meld {
  type: MeldType;
  tiles: Tile[];      // The 3 or 4 tiles forming the meld
  sourcePlayerId: number; // Who discarded the tile (for scoring/liability)
}

export class Hand {
  privateHand: Tile[] = []; // Hidden tiles in player's hand (typically 16 tiles)
  melds: Meld[] = [];       // Declared open sets (Chow, Pung, Kong)
  flowers: Tile[] = [];     // Disclosed flower tiles (Winds, Dragons, Seasons, Plants)
  
  // Methods for sorting, adding, removing, and checking tile counts
  sort(): void;
  addTile(tile: Tile): void;
  removeTile(tile: Tile): boolean;
  getSuitCount(suit: Suit): number;
}
```

### 2.3. Tile Wall (`Wall.ts`)
Handles the deck of 144 tiles. In Fuzhou rules, drawing occurs from the front, while flower replacement drawing occurs from the back.

```typescript
export class Wall {
  private tiles: Tile[] = [];
  private deadWallCount: number = 18; // Fuzhou dead wall (海底) is usually 18 tiles (9 stacks)
  
  constructor() {
    this.initializeWall();
  }

  // Set up all 144 tiles
  private initializeWall(): void;
  
  // Shuffles tiles
  shuffle(): void;
  
  // Draws from the front of the wall for normal turns
  drawFromFront(): Tile | null;
  
  // Draws from the back of the wall for flower replacement (补花)
  drawFromBack(): Tile | null;
  
  // Checks if the playable wall is exhausted (excluding dead wall)
  isExhausted(): boolean;
  
  // Reveals the "Jin" indicator tile from the back of the wall
  revealJinIndicator(): Tile;
}
```

---

## 3. Fuzhounese Mahjong Rules & Scoring Engine (`RulesEngine.ts`)

The rules engine handles the highly specific Fuzhou mechanics, particularly **Jin (金 - wildcard)** and **Flower Replacement (补花)**.

### 3.1. Jin (金) Resolution
After flower replacement is complete, a tile is flipped from the back end. This exact tile becomes the "Jin" (wildcard):
* **Suits**: The exact flipped suit tile is the Jin.
* **Winds & Dragons**: Excluded from becoming the Jin. If a flower card is flipped, it is given to the dealer, and another card is flipped until a suit tile is revealed.

```typescript
export class RulesEngine {
  /**
   * Resolves which tile type is the wildcard "Jin" based on the revealed indicator tile.
   */
  static determineJinTile(indicator: Tile): Omit<Tile, 'id'> {
    const { type, value } = indicator;
    return { type, value };
  }

  /**
   * Checks if a tile is a Jin (wildcard).
   */
  static isJin(tile: Tile, jinTemplate: Omit<Tile, 'id'> | null): boolean {
    if (!jinTemplate) return false;
    return tile.type === jinTemplate.type && tile.value === jinTemplate.value;
  }
}
```

### 3.2. Hu (胡) Validation
To check for a valid winning hand (平胡):
1. Group the player's `privateHand` (including the drawn tile).
2. Count the number of "Jin" tiles in hand.
3. Validate if the tiles can form **4 melds (顺子/刻子) and 1 pair (将/雀头)**, treating Jin as a wildcard that can match any suit tile.
4. Support special instant-win hands:
   * **San Jin Dao (三金倒)**: Having 3 Jin tiles in hand $\rightarrow$ automatic win.
   * **Jin Que (金雀)**: Two Jin tiles used exactly as the eye/pair $\rightarrow$ high-multiplier win.
   * **Jin Long (金龙)**: Three Jin tiles acting as a triplet $\rightarrow$ high-multiplier win.
   * **Qiang Jin (抢金)**: Drawing a Jin on the first turn (dealer's first draw/idle player's first draw) $\rightarrow$ automatic win.

### 3.3. Score Calculation (水 / Points)
Fuzhounese Mahjong scores are calculated by summing base elements and applying a multiplier based on the win type:

$$\text{Total Score} = (\text{Base} + \text{Flowers} + \text{Jin count} + \text{Kongs} + \text{Dealer Streak}) \times \text{Win Multiplier}$$

* **Base**: Typically 3 points.
* **Flowers**: 1 point per flower. Having a set of 4 identical winds (e.g. 4 Easts) or a complete Season/Plant run counts as 6 flowers.
* **Kongs**: Ming Kong (1), An Kong (2), Wind Kong (2).
* **Multipliers**:
  * Ping Hu (平胡): 1x (or 2x if self-drawn/自摸)
  * San Jin Dao (三金倒): 3x
  * Jin Que (金雀) / Jin Long (金龙): 4x
  * Robbing Jin (抢金): 5x
  * No Jin (无金): 2x (winning without using any Jin card)

---

## 4. Game State Machine (`GameState.ts` & `GameController.ts`)

```
                  ┌────────────────────────┐
                  │         SETUP          │
                  └───────────┬────────────┘
                              │ Deal hands (17 to dealer, 16 to others)
                              ▼
                  ┌────────────────────────┐
                  │   FLOWER_REPLACEMENT   │ ◄───┐
                  └───────────┬────────────┘     │ If replaced tile is a flower,
                              │ All players replace flowers until hands have only suits
                              ▼                  │ loop back (ordered counter-clockwise)
                  ┌────────────────────────┐     │
                  │        OPEN_JIN        │ ────┘
                  └───────────┬────────────┘
                              │ Flip indicator from back of wall
                              ▼
                  ┌────────────────────────┐
                  │      PLAYING_DRAW      │
                  └───────────┬────────────┘
                              │ Player draws a tile (checks San Jin Dao / Qiang Jin)
                              ▼
                  ┌────────────────────────┐
                  │    PLAYING_DISCARD     │
                  └───────────┬────────────┘
                              │ Player selects a tile to discard
                              ▼
                  ┌────────────────────────┐
                  │   WAITING_FOR_ACTION   │
                  └───────────┬────────────┘
                              │ Other players can Chow, Pung, Kong, or Hu
                              ├───────────────────────────────┐
                              ▼ (No action or Pass)           ▼ (Action accepted)
                     [Next Player's Turn]           [Meld declared, skip turns if Pung]
                              │                               │
                              └───────────────┬───────────────┘
                                              ▼
                                      Check Wall Exhaustion
                                     (18 tiles left = Flow)
```

### 4.1. Action Prioritization
When a tile is discarded, multiple players can declare actions. The controller resolves them in order of priority:
1. **Hu (胡)** (Highest priority, overrides all)
2. **Pung (碰) / Kong (杠)**
3. **Chow (吃)** (Lowest priority, only valid for the next player in turn order)

---

## 5. Bot AI Engine (`BotAI.ts`)
Since the game is played offline against bots, the AI must feel smart and human-like. 

### 5.1. Evaluation Strategy
1. **Jin Hoarding**: The AI prioritizes keeping Jin cards in hand due to their wildcard versatility. It will rarely discard a Jin unless it has 4 Jin and is looking to optimize a win, or if it is close to a high-scoring hand.
2. **Shantz-ten (向听数) Calculation**: The bot calculates its distance to a winning hand:
   $$\text{Shantz-ten} = 8 - 2 \times \text{Melds} - \text{Meld-candidates} - \text{Pairs}$$
   It runs a search algorithm simulating which discards minimize this value.
3. **Discard Safety**: As the wall depletes, the bot shifts from offensive play to defensive play by discarding tiles already in the discard pile (safe tiles) to avoid letting other players win.
4. **Action Response**:
   * **Pung/Kong**: The bot will Pung if it advances its hand structure significantly, but avoids open melds if it wants to keep its hand concealed for strategic flexibility.
   * **Chow**: Evaluated defensively; only eats if it completes a vital run.

---

## 6. Frontend UI Hierarchy & Visual Design (`ui/`)

### 6.1. UI Component Hierarchy
```
App (index.html / Renderer.ts)
 ├── GameHeader (Scoreboard, Wind Round, Active Turn Indicator, Wall Count)
 ├── MahjongTable (2D / Isometric Green Felt Grid)
 │    ├── OpponentHand (Top - Bot 2: Tiles hidden/shown as count)
 │    ├── OpponentHand (Left - Bot 1: Oriented vertically)
 │    ├── OpponentHand (Right - Bot 3: Oriented vertically)
 │    ├── PlayerHand (Bottom - Human: High-fidelity tiles with hover-lift)
 │    ├── DiscardZone (Center-aligned 4x grid of discarded tiles)
 │    └── InfoPanel (Center: Shows the flipped Jin Indicator and active Jin)
 ├── ControlHUD (Popups for 吃, 碰, 杠, 胡, 过 / Pass)
 └── EndGameModal (Scoring breakdown, flowers, Kongs, Lianzhuang multiplier)
```

### 6.2. Visual Aesthetic Guidelines
To deliver a premium, modern experience, the UI will feature:
* **Theming**: Sleek dark mode wrapper with a central table made of a rich green felt texture (`radial-gradient`) bordered by polished dark walnut wood panels.
* **Tile Styling**: 3D-effect Mahjong tiles using CSS shadows, precise borders, and customized SVG vectors or high-resolution text styles for tile faces.
* **Micro-Animations**:
  * Smooth animations for tiles sliding from the wall into the player's hand.
  * Discard action: Tiles scale down slightly and slide from the hand to the center discard pile.
  * Gold glow effects around the "Jin" tiles in the hand to clearly signify their status.
  * Dramatic slide-in overlays with glowing text for `PUNG` (碰), `KONG` (杠), and `HU` (胡) actions.
* **Responsiveness**: Flexbox/CSS Grid to scale the mahjong table fluidly between desktop screens and tablets/mobile.

---

## 7. Next Steps for Implementation
1. **Establish Foundation**: Configure the Vite/TypeScript build pipeline in the workspace directory.
2. **Implement Core Rules**: Build `Tile.ts`, `Wall.ts`, `Hand.ts`, and `RulesEngine.ts`. Write unit tests to verify the wildcard matching (Hu) and scoring formulas.
3. **Build the State Machine**: Implement `GameController.ts` to manage turn sequences, flower replacement loops, and action priorities.
4. **Develop Bot AI**: Write `BotAI.ts` with hand evaluation.
5. **Craft UI and Styling**: Build the high-fidelity CSS and DOM renderer. Add sound effects and visual animations.
