# Challenge Map Layouts

## Where map JSONs live

**Location:** `public/` (project root of the `public` folder, not inside `public/assets`).

- Example: `public/learninglot.json` is loaded by the game at `/learninglot.json`.
- This keeps URLs simple and works the same in dev and when the game is hosted (static hosts serve `public` contents at the site root).

## Adding new challenge maps

1. Design the map in Dev Mode and export the grid JSON.
2. You can save the file to the **project root** (same folder as `package.json`) and ask the agent to:
   - Move it into `public/` with the right name (e.g. `pizzaparking.json`, `rushhour.json`, `drivein.json`, `airport.json`), and
   - Add the corresponding `initialGridPath` (e.g. `'/pizzaparking.json'`) to that challenge in `src/config/challenges.config.ts`.

Naming suggestion: one lowercase word or short slug per file (e.g. `learninglot.json`, `pizzaparking.json`) so `initialGridPath` stays simple: `'/pizzaparking.json'`.
