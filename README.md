# Parking Lot Tycoon

An isometric parking lot tycoon game built with Phaser 3 and TypeScript. Build and manage parking lots, optimize traffic flow, and satisfy customers to achieve high ratings.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (comes with Node.js)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server (see [Running the Dev Server](#running-the-dev-server) below for PowerShell-specific instructions):
```bash
npm run dev
```

The game will automatically open in your browser at `http://localhost:5173`

### Running the Dev Server

#### Standard Terminal (Bash, Git Bash, CMD)

Simply run:
```bash
npm run dev
```

#### PowerShell (Windows)

PowerShell may have execution policy restrictions that prevent npm scripts from running. If you encounter errors like:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

**Solution 1: Use npx directly (Recommended)**
```powershell
npx vite
```

**Solution 2: Change PowerShell execution policy (one-time setup)**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then you can use `npm run dev` normally.

**Solution 3: Use Command Prompt (CMD) instead**
Open Command Prompt (not PowerShell) and run:
```cmd
npm run dev
```

**Solution 4: Use Git Bash**
If you have Git installed, use Git Bash which handles npm scripts without issues:
```bash
npm run dev
```

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── config/              # Game configuration files
│   ├── game.config.ts   # Core game settings (tile sizes, colors)
│   └── challenges.config.ts  # Challenge definitions
├── core/                # Core game classes
│   ├── Game.ts          # Phaser game initialization
│   └── GameSystems.ts   # Centralized singleton access to all game systems
├── scenes/              # Phaser scenes
│   ├── DevModeScene.ts  # Development/testing sandbox scene
│   ├── ChallengeScene.ts # Challenge gameplay scene (minimal, to be expanded)
│   └── LeaderboardScene.ts # Leaderboard display scene
├── entities/            # Game entities
│   ├── Vehicle.ts       # Vehicle entity with parking logic
│   ├── Pedestrian.ts    # Pedestrian entity (spawned from parked vehicles)
│   ├── ParkingLot.ts    # Parking lot container
│   ├── Ploppable.ts     # Placeable items (parking spots, etc.)
│   └── structures/      # Building structures
│       ├── Entrance.ts
│       ├── Exit.ts
│       └── ParkingSpace.ts
├── systems/             # Game systems (singletons)
│   ├── TimeSystem.ts    # Game clock and day counter (1 real sec = 1 game min)
│   ├── RatingSystem.ts  # Lot rating based on parker satisfaction
│   ├── EconomySystem.ts # Budget and money management
│   ├── VehicleSystem.ts # Vehicle spawning, pathfinding, parking
│   ├── PedestrianSystem.ts # Pedestrian movement and behavior
│   ├── PathfindingSystem.ts # A* pathfinding for vehicles and pedestrians
│   ├── ChallengeSystem.ts # Challenge management
│   └── LeaderboardSystem.ts # Leaderboard tracking
├── utils/               # Utility functions
│   ├── isometric.ts     # Isometric coordinate conversion
│   └── validation.ts    # Input validation helpers
└── types/               # TypeScript type definitions
    └── index.ts         # All game type interfaces

public/
└── assets/              # Game assets
    ├── sprites/         # Sprite images (ploppables)
    └── vehicles/        # Vehicle sprite images
```

## Game Systems Architecture

The game uses a centralized singleton architecture for core systems:

### TimeSystem
- Manages game time: 1 real second = 1 game minute
- 24-hour game day = 24 real minutes
- 12-hour AM/PM display format
- Day counter with midnight rollover
- Triggers rating finalization at 11:59 PM

### RatingSystem
- Tracks parker satisfaction scores throughout their lifecycle
- Scores accumulate as events unfold (parking, pedestrian activities)
- Finalizes scores when parkers leave
- Calculates daily average rating
- Displays previous day's rating at midnight

### EconomySystem
- Manages player budget/money
- Tracks spending on ploppables
- Handles earnings from parking fees (via ParkingTimerSystem)

### GameSystems Facade
- Central access point: `GameSystems.time`, `GameSystems.rating`, `GameSystems.economy`
- Provides `resetForChallenge(budget)` for scene initialization
- Handles time-based triggers (rating finalization, day changes)

## Development

### Editing Code

- Edit TypeScript files in `src/`
- Add assets (sprites, sounds) to `public/assets/`
- The development server automatically reloads on file changes (HMR)

### DevModeScene

The `DevModeScene` is a sandbox for testing and development:
- Full grid editing capabilities
- Place ploppables (parking spots, spawners)
- Paint tiles and draw lines (curbs, fences, lane lines)
- Test vehicle and pedestrian systems
- Export/import grid layouts

Challenge map JSONs for each level live in `public/` (see **MAP_LAYOUTS.md** for adding new maps).

### Adding New Systems

All game systems should:
1. Be singletons (use `getInstance()` pattern)
2. Be accessible through `GameSystems` facade
3. Have `reset()` methods for challenge initialization
4. Be independent of specific scenes (usable by DevModeScene and ChallengeScenes)

### Code Style

- TypeScript strict mode enabled
- ES6 modules (`import`/`export`)
- Path aliases configured: `@/` maps to `src/`

## Troubleshooting

### Dev Server Won't Start

**PowerShell Execution Policy Error:**
- See [Running the Dev Server](#running-the-dev-server) section above
- Use `npx vite` directly or switch to CMD/Git Bash

**Port Already in Use:**
- Vite defaults to port 5173
- Kill the process using the port or change port in `vite.config.ts`

**Module Not Found Errors:**
- Run `npm install` to ensure all dependencies are installed
- Check that `node_modules/` exists

### TypeScript Errors

- Ensure `tsconfig.json` is properly configured
- Check that path aliases (`@/`) are working
- Run `npm run build` to see all TypeScript errors

### Game Not Loading

- Check browser console for errors
- Ensure Vite dev server is running
- Verify `index.html` references `/src/main.ts` correctly

## Launching the Hosted Game

### Environment variables

All client-visible env vars are prefixed `VITE_`. Copy `.env.example` to `.env.local`
for local development, or set them in your hosting provider's dashboard for
production.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (REST endpoint root). |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key. Safe to expose; RLS + table constraints gate writes. |
| `VITE_ENABLE_DEV_CHALLENGE` | Set to `true` to show the Dev Mode sandbox in a production-style build. Leave unset/`false` for the public site. |

The committed [.env.production](.env.production) pins `VITE_ENABLE_DEV_CHALLENGE=false`
so hosted builds never expose the sandbox. `npm run dev` always enables Dev Mode
regardless of the flag.

### Setting up the Supabase leaderboard

1. Create a Supabase project.
2. In the **SQL Editor**, paste and run [supabase/schema.sql](supabase/schema.sql). This creates the `scores` table, plausibility CHECK constraints, and Row Level Security policies that let anyone read and submit rows.
3. In **Project Settings > API**, copy the project URL and anon key into your hosting provider's env settings (or a local `.env.local`).

Cheat prevention is pragmatic: CHECK constraints reject out-of-range values, and
RLS blocks updates/deletes from browser clients. Add an Edge Function or rate
limiting later if spam becomes a problem.

### Deploying a static build

The production build is a static bundle in `dist/`, so any static host works.

1. Push the repo to GitHub/GitLab.
2. Connect it to Cloudflare Pages, Netlify, or Vercel.
3. Configure the build: **build command** `npm run build`, **publish directory** `dist`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's env settings.
5. In the host dashboard, attach a custom domain you purchased from a registrar. HTTPS is automatic on all three hosts.

Supabase's PostgREST endpoint returns permissive CORS headers for anonymous
clients, so no extra CORS configuration is needed on the Supabase side.

### Balance tuning

Per-challenge difficulty knobs live in [src/config/challenges.config.ts](src/config/challenges.config.ts):

- `maxDay` and `winConditions` for deadlines and objectives
- `needGenerationProbability` and `needTypeDistribution` for pedestrian needs
- `vehicleSpawnIntervalMs`, `vehicleSpawnSchedule`, and `potentialParkerChance` / `potentialParkerSchedule` for traffic shape
- `pedestrianRespawnBands` and related knobs for pedestrian turnover

All of these can be edited directly; no architecture changes are required to
retune them between playtests.

## Technologies

- **Phaser 3** - Game framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Isometric Rendering** - Custom isometric coordinate system

## License

MIT
