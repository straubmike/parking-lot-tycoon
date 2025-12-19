# Parking Lot Tycoon

An isometric parking lot tycoon game built with Phaser 3 and TypeScript.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (comes with Node.js)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The game will automatically open in your browser at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
src/
├── config/          # Game configuration files
├── core/            # Core game classes (Game, GameState, SceneManager)
├── scenes/          # Phaser scenes (Menu, Challenge, Leaderboard)
├── entities/        # Game entities (ParkingLot, NPCs, Ploppables)
├── systems/         # Game systems (Economy, Rating, Challenges, Leaderboard)
├── utils/           # Utility functions (isometric conversion, pathfinding)
└── types/           # TypeScript type definitions
```

## Development

- Edit TypeScript files in `src/`
- Add assets (sprites, sounds) to `public/assets/`
- The development server automatically reloads on file changes

