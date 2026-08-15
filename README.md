# Fuzhounese Mahjong (福州麻将)

A web-based implementation of traditional Fuzhounese Mahjong (福州麻将). Play locally in single-player mode against heuristic-based AI bots, or host and join online multiplayer rooms with friends using real-time Socket.io networking.
https://fzmahjong.onrender.com/

---

## Features

- **Game Modes**:
  - **Single Player**: Play offline against three adaptive AI bots.
  - **Online Multiplayer**: Host or join lobbies using a unique 4-character room code.
- **Dynamic Bot Integration**: Host-controlled option to fill empty seats with AI bots in multiplayer lobbies.
- **Polished Visuals & Interaction**: 
  - Central 2D mahjong table styling with a green-felt aesthetic.
  - Responsive layouts scaling between desktop, tablet, and mobile browsers.
  - Interactive player hand interfaces with hover actions.
  - Custom micro-animations for drawing, discarding, and overlay action announcements (Chow, Pung, Kong, Hu).
  - Sound effects for key gameplay events.
- **Fuzhou Mahjong Mechanics**: Supported via the rules engine including wildcard (Jin) determination, flower replacement phases, priority action checks (Hu > Pung/Kong > Chow), and multi-tiered scoring rules.

---

## Setup & Running Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended)
- npm (installed automatically with Node.js)

### Installation
1. Clone or download this repository to your local machine.
2. Open a terminal in the project's root directory and run the following command to install dependencies:
   ```bash
   npm install
   ```

### Running the Application

- **Development Mode** (Runs with `nodemon` for auto-restarting on changes):
  ```bash
  npm run dev
  ```

- **Production Mode**:
  ```bash
  npm start
  ```

Once the server starts, open your browser and navigate to:
```
http://localhost:3000
```

*Note: For testing multiplayer locally, you can open multiple browser tabs or windows and connect them to the same room code.*

---

## File Structure

The project is structured with a modular, custom ES module layout separating game logic, backend networking, and frontend rendering:

```
fzmahjong/
│
├── css/
│   └── style.css            # Styling, layout themes, grids, and animations
│
├── server/                  # Node.js backend logic
│   ├── server.js            # Express server and Socket.io events entry point
│   ├── RoomManager.js       # Handles room lifecycle, seat mapping, and connection states
│   └── MultiplayerGame.js   # Orchestrates multiplayer turn loop, bot fillers, and timers
│
├── src/                     # Frontend client codebase
│   ├── core/                # Core Mahjong rules and states (independent of UI)
│   │   ├── Tile.js          # Definitions, categories, values, and identifiers for the 144 tiles
│   │   ├── Hand.js          # Manages player hands, sorting, melds, and revealed flower tiles
│   │   ├── Wall.js          # Manages the tile deck, drawing flows, and the Jin indicator
│   │   ├── RulesEngine.js   # Validates win conditions (Hu), parses Jins, and calculates scores
│   │   └── GameState.js     # Shared structure templates for game phases
│   │
│   ├── engine/              # Game loop controllers
│   │   ├── GameController.js# Client game loop, turn driver, and single-player orchestrator
│   │   └── BotAI.js         # Heuristic-based AI decision maker for solo play & multiplayer bot fillers
│   │
│   ├── net/                 # Client networking
│   │   └── SocketClient.js  # Wrapper for Socket.io events, connection recovery, and lobby interactions
│   │
│   ├── ui/                  # Visuals and Audio
│   │   ├── Renderer.js      # Coordinates DOM rendering, click listeners, and animations
│   │   └── SoundManager.js  # Plays audio files for discards, meld declarations, and wins
│   │
│   └── index.js             # Client-side application entry point
│
├── index.html               # Main page layout containing game screens, lobbies, and UI views
├── package.json             # Node.js script actions and dependencies
└── system_hierarchy.md      # Extended architecture documentation
```
