# Game Systems Implementation Plan

## Current Game Structure Analysis

### Core Architecture
- **Game.ts**: Phaser game initialization
- **GameState.ts**: Global state management (basic money/rating storage)
- **ChallengeScene.ts**: Main gameplay scene (currently minimal)
- **DevModeScene.ts**: Development/testing scene with full grid system

### Existing Systems
- **EconomySystem**: Basic budget management (spend/earn)
- **RatingSystem**: Basic rating storage (needs enhancement)
- **VehicleSystem**: Handles vehicle spawning, pathfinding, parking
- **PedestrianSystem**: Handles pedestrian movement
- **ChallengeSystem**: Challenge management (needs implementation)

### Key Entities
- **VehicleEntity**: Represents vehicles with parking logic
- **Ploppable**: Represents placeable items (parking spots, etc.)

---

## System Implementation Locations

### 1. Budget System

**Current State:**
- `EconomySystem` exists in `src/systems/EconomySystem.ts`
- Has basic `spend()` and `earn()` methods
- Initialized with `initialBudget` in constructor

**Implementation Areas:**

#### A. Enhance EconomySystem (`src/systems/EconomySystem.ts`)
- ✅ Already has basic structure
- **Add**: Budget change tracking/events
- **Add**: Budget validation before spending
- **Add**: Callbacks/events for budget changes

#### B. Initialize Budget in ChallengeScene (`src/scenes/ChallengeScene.ts`)
- Initialize `EconomySystem` with challenge budget from `Challenge.budget`
- Store reference in scene
- Connect to UI display

#### C. Decrement on Ploppable Placement
- **Location**: `DevModeScene.paintCell()` (line ~540) or `ChallengeScene` equivalent
- When ploppable is placed, call `economySystem.spend(ploppable.cost)`
- Validate budget before allowing placement

#### D. Increment on Conditions
- **Location**: `VehicleSystem` or new event system
- When vehicle parks successfully → earn parking fee
- When vehicle pays → earn money
- Hook into vehicle parking completion in `VehicleSystem.updateParkingVehicle()`

**Recommended Structure:**
```
ChallengeScene
  ├── economySystem: EconomySystem (initialized with challenge.budget)
  ├── onPloppablePlaced() → economySystem.spend(cost)
  └── onVehicleParked() → economySystem.earn(parkingFee)
```

---

### 2. Game Clock System

**Current State:**
- No time system exists
- Need to create new system

**Implementation Areas:**

#### A. Create TimeSystem (`src/systems/TimeSystem.ts`)
- **Properties:**
  - `gameMinutes`: number (0-1439, representing minutes in a day)
  - `gameHours`: number (1-12)
  - `gameMinutesDisplay`: number (0-59)
  - `isAM`: boolean
  - `realTimeAccumulator`: number (milliseconds)
- **Methods:**
  - `update(delta: number)`: Advance time (1 real second = 1 game minute)
  - `getTimeString()`: Returns "HH:MM AM/PM"
  - `getHour()`: Returns 1-12
  - `getMinute()`: Returns 0-59
  - `isMidnight()`: Returns true at 12:00 AM
  - `isElevenFiftyNine()`: Returns true at 11:59 PM

#### B. Integrate in ChallengeScene (`src/scenes/ChallengeScene.ts`)
- Initialize `TimeSystem` in `create()`
- Update in `update(time, delta)` method
- Display clock in UI

#### C. UI Display
- **Location**: `index.html` or scene UI
- Display: "HH:MM AM/PM" format
- Update every frame or on time change

**Time Calculation:**
- 1 real second = 1 game minute
- 1 real minute = 1 game hour
- 1 real hour = 1 game day (12 hours)
- Game day = 12 hours (AM/PM cycle)

---

### 3. Day Counter System

**Current State:**
- No day tracking exists

**Implementation Areas:**

#### A. Add to TimeSystem (`src/systems/TimeSystem.ts`)
- **Properties:**
  - `currentDay`: number (starts at 0)
  - `lastMidnightCheck`: number (game minutes)
- **Methods:**
  - `getCurrentDay()`: Returns current day number
  - `checkMidnight()`: Called in update, increments day at midnight

#### B. Initialize in ChallengeScene
- Reset day counter when challenge starts
- Day increments automatically when clock hits 12:00 AM

#### C. UI Display
- Display "Day X" in UI
- Update when day changes

**Logic:**
- Day starts at 0 when challenge begins
- Increments when clock transitions from 11:59 PM → 12:00 AM

---

### 4. Lot Rating System

**Current State:**
- `RatingSystem` exists but is basic
- No calculation logic
- No timing mechanism

**Implementation Areas:**

#### A. Enhance RatingSystem (`src/systems/RatingSystem.ts`)
- **Properties:**
  - `currentRating`: number (0-100)
  - `previousDayRating`: number (0-100)
  - `dailyScores`: number[] (array of potential parker scores for current day)
- **Methods:**
  - `addParkerScore(score: number)`: Add a potential parker's score
  - `calculateDailyRating()`: Average all scores in `dailyScores`
  - `finalizeDay()`: Calculate and store rating at 11:59 PM
  - `getCurrentRating()`: Returns current day's rating
  - `getPreviousDayRating()`: Returns previous day's rating
  - `resetDailyScores()`: Clear scores for new day

#### B. Integration with TimeSystem
- **Location**: `ChallengeScene.update()`
- Check if time is 11:59 PM → call `ratingSystem.finalizeDay()`
- At midnight → display previous day's rating
- Reset daily scores for new day

#### C. Integration with VehicleSystem
- Track potential parker scores when they spawn/despawn
- Call `ratingSystem.addParkerScore()` when vehicle despawns

#### D. UI Display
- Display rating prominently
- Show "Previous Day Rating: X" at midnight
- Update rating display when new scores are added

**Calculation Flow:**
```
11:59 PM → finalizeDay() → calculateDailyRating() → store in previousDayRating
12:00 AM → display previousDayRating → resetDailyScores()
Throughout day → addParkerScore() for each potential parker
```

---

### 5. Potential Parker Scoring

**Current State:**
- `VehicleSystem` already tracks `isPotentialParker`
- Vehicles reserve spots on spawn
- Vehicles despawn if no spot found

**Implementation Areas:**

#### A. Track Score in VehicleEntity (`src/entities/Vehicle.ts`)
- **Add Property:**
  - `parkingScore?: number` (undefined until vehicle despawns)
- **Set Score:**
  - 100 if vehicle successfully parks (reaches reserved spot and parks)
  - 0 if vehicle cannot find spot or fails to park

#### B. Update VehicleSystem (`src/systems/VehicleSystem.ts`)
- **In `spawnVehicle()` (line ~114):**
  - When potential parker reserves spot → mark for scoring
  - When potential parker can't find spot → set score to 0 immediately
- **In `updateMovingVehicle()` (line ~250):**
  - When vehicle reaches reserved spot → mark for 100 score
- **In `updateLeavingVehicle()` or when despawning:**
  - If vehicle successfully parked → score = 100
  - If vehicle never parked → score = 0
  - Report score to RatingSystem before removing vehicle

#### C. Integration with RatingSystem
- **Location**: `VehicleSystem.update()` or vehicle removal logic
- When vehicle despawns:
  - If `isPotentialParker === true`:
    - Determine score (100 if parked, 0 if not)
    - Call `ratingSystem.addParkerScore(score)`

**Scoring Logic:**
```typescript
// On vehicle spawn (VehicleSystem.spawnVehicle)
if (isPotentialParker) {
  if (reservedSpot && reserveParkingSpot()) {
    // Will score 100 if reaches spot
    vehicle.parkingScore = undefined; // To be determined
  } else {
    // No spot found, score 0
    vehicle.parkingScore = 0;
    ratingSystem.addParkerScore(0);
  }
}

// On vehicle reaching parking spot (VehicleSystem.updateMovingVehicle)
if (vehicle.state === 'parking' && vehicle.isPotentialParker) {
  vehicle.parkingScore = 100;
}

// On vehicle despawn (VehicleSystem.update)
if (vehicle.state === 'despawning' && vehicle.isPotentialParker) {
  const score = vehicle.parkingScore ?? 0; // Default to 0 if never set
  ratingSystem.addParkerScore(score);
}
```

---

## Recommended Implementation Order

1. **TimeSystem** (Foundation for other systems)
   - Create `TimeSystem.ts`
   - Integrate in `ChallengeScene`
   - Add UI display

2. **Day Counter** (Simple addition to TimeSystem)
   - Add day tracking to `TimeSystem`
   - Add UI display

3. **Potential Parker Scoring** (Foundation for rating)
   - Add score tracking to `VehicleEntity`
   - Update `VehicleSystem` to track scores
   - Connect to `RatingSystem`

4. **Lot Rating System** (Depends on scoring)
   - Enhance `RatingSystem`
   - Integrate with `TimeSystem` for 11:59 PM calculation
   - Add UI display

5. **Budget System** (Independent but important)
   - Enhance `EconomySystem`
   - Integrate ploppable costs
   - Add parking fee earnings
   - Add UI display

---

## File Structure Summary

### New Files to Create:
- `src/systems/TimeSystem.ts` - Game clock and day counter

### Files to Modify:
- `src/systems/EconomySystem.ts` - Enhance budget management
- `src/systems/RatingSystem.ts` - Add daily rating calculation
- `src/systems/VehicleSystem.ts` - Add score tracking
- `src/entities/Vehicle.ts` - Add parkingScore property
- `src/scenes/ChallengeScene.ts` - Integrate all systems
- `src/types/index.ts` - Add any needed type definitions

### UI Integration:
- `index.html` - Add UI elements for clock, day, budget, rating
- Or create UI system in `ChallengeScene`

---

## Integration Points in ChallengeScene

```typescript
export class ChallengeScene extends Phaser.Scene {
  private timeSystem!: TimeSystem;
  private economySystem!: EconomySystem;
  private ratingSystem!: RatingSystem;
  private vehicleSystem!: VehicleSystem;
  
  create(): void {
    // Initialize systems
    const challenge = this.getCurrentChallenge();
    this.economySystem = new EconomySystem(challenge.budget);
    this.timeSystem = new TimeSystem();
    this.ratingSystem = new RatingSystem();
    
    // Initialize vehicle system with rating callback
    this.vehicleSystem = new VehicleSystem(..., (score) => {
      this.ratingSystem.addParkerScore(score);
    });
  }
  
  update(time: number, delta: number): void {
    // Update time (1 real second = 1 game minute)
    this.timeSystem.update(delta);
    
    // Check for 11:59 PM rating calculation
    if (this.timeSystem.isElevenFiftyNine()) {
      this.ratingSystem.finalizeDay();
    }
    
    // Check for midnight day increment
    if (this.timeSystem.isMidnight() && !this.timeSystem.hasIncrementedDay()) {
      this.timeSystem.incrementDay();
      this.ratingSystem.resetDailyScores();
      // Display previous day's rating
      this.displayRating(this.ratingSystem.getPreviousDayRating());
    }
    
    // Update other systems...
  }
}
```

---

## Notes

- All systems should be initialized when a challenge starts
- Systems should reset when a new challenge begins
- UI updates should happen in the scene's update loop or via events
- Consider using Phaser's event system for cross-system communication
- Time system is critical as other systems depend on it

