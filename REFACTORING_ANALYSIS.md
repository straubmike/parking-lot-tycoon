# DevModeScene Refactoring Analysis

## Overview
DevModeScene currently contains ~2450 lines of code that implements a complete parking lot building system. Since challenge scenes will share many of these systems (grids, ploppables, vehicles, pedestrians), this analysis identifies code that should be extracted into reusable components.

## Systems to Extract

### 1. **GridManager** (Core Data Management)
**Location**: Lines 199-306, 1472-1551, 1533-1551

**What it manages:**
- Cell data storage (`Map<string, CellData>`)
- Border segments storage (`Map<string, number>`)
- Cell key generation (`getCellKey`, `getBorderSegmentKey`)
- Border segment key resolution for shared edges
- Serialization/deserialization of grid state

**Extract to**: `src/core/GridManager.ts` or `src/systems/GridSystem.ts`

**Why**: Both dev mode and challenges need to store and manage grid state. This is pure data management logic.

**Key methods:**
- `getCellData(x, y)` → `CellData | undefined`
- `setCellData(x, y, data)` → `void`
- `getBorderSegmentKey(cellX, cellY, edge)` → `string`
- `findExistingBorderSegmentKey(cellX, cellY, edge)` → `string | null`
- `serializeGrid()` → `string`
- `deserializeGrid(jsonData)` → `boolean`

---

### 2. **GridRenderer** (Visual Grid Rendering)
**Location**: Lines 170-197, 311-347, 983-1021, 2290-2367

**What it renders:**
- Base grid cells (filled diamonds with borders)
- Border segments (curbs, fences, lane lines)
- Rails (dotted lines for vehicle/pedestrian paths)
- Parking spot borders
- Permanent labels

**Extract to**: `src/systems/GridRenderer.ts` or `src/renderers/GridRenderer.ts`

**Why**: All gameplay scenes need to render the grid visually. This is pure rendering logic.

**Key methods:**
- `drawGrid(gridManager, graphics, gridSize, offsetX, offsetY)` → `void`
- `drawCell(cellData, x, y, graphics, offsetX, offsetY)` → `void`
- `drawLines(borderSegments, graphics, gridSize, offsetX, offsetY)` → `void`
- `drawRails(graphics, gridSize, offsetX, offsetY)` → `void`
- `drawParkingSpotLines(cellData, x, y, graphics, offsetX, offsetY)` → `void`

**Dependencies**: Requires access to GridManager for cell data and border segments

---

### 3. **PloppableManager** (Ploppable Lifecycle)
**Location**: Lines 413-651, 767-815, 1807-1862

**What it handles:**
- Ploppable placement logic
- Ploppable removal/demolition
- Ploppable rendering (with orientation support)
- Orientation calculations (Type A/B positioning)
- Validation (cell occupancy checks)

**Extract to**: `src/systems/PloppableManager.ts` or `src/managers/PloppableManager.ts`

**Why**: Challenges will need to place and manage ploppables just like dev mode. This is core gameplay logic.

**Key methods:**
- `placePloppable(x, y, type, orientation, gridManager)` → `boolean`
- `removePloppable(x, y, gridManager)` → `void`
- `canPlacePloppable(x, y, gridManager)` → `boolean`
- `getPloppablePosition(centerX, centerY, orientation, orientationType)` → `{x, y}`

**Dependencies**: 
- Requires GridManager
- May need to integrate with VehicleSystem/PedestrianSystem (for spawner management)

---

### 4. **PathfindingUtilities** (Edge Blocking & Navigation)
**Location**: Lines 2044-2290

**What it provides:**
- Edge blocking checks for vehicles/pedestrians
- Parking spot edge blocking
- Rail intersection detection
- Neighbor cell resolution
- Line intersection math

**Extract to**: `src/utils/PathfindingUtilities.ts` or `src/systems/PathfindingUtilities.ts`

**Why**: Pathfinding logic is shared between VehicleSystem, PedestrianSystem, and scene validation. This is pure utility logic.

**Key methods:**
- `isEdgeBlockedForEntity(cellX, cellY, edge, entityType, gridManager, isEntryEdge, movementDirection)` → `boolean`
- `isEdgeImpassable(cellX, cellY, edge, gridManager)` → `boolean`
- `isParkingSpotEdgeBlocked(cellX, cellY, edge, gridManager)` → `boolean`
- `doesRailSegmentCrossImpassable(startX, startY, endX, endY, gridManager)` → `boolean`
- `getNeighborCellForEdge(cellX, cellY, edge)` → `{cellX, cellY, edge} | null`
- `linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4)` → `boolean`

**Dependencies**: Requires GridManager for cell data and border segments

---

### 5. **EntityRenderer** (Vehicle & Pedestrian Rendering)
**Location**: Lines 2370-2450

**What it renders:**
- Vehicles (red diamonds)
- Pedestrians (blue rectangles with yellow dots)
- Entity state indicators (destinations, vehicle locations)

**Extract to**: `src/renderers/EntityRenderer.ts` or `src/systems/EntityRenderer.ts`

**Why**: All gameplay scenes need to render entities. This is pure rendering logic.

**Key methods:**
- `drawVehicles(vehicles, graphics, offsetX, offsetY)` → `void`
- `drawPedestrians(pedestrians, graphics, offsetX, offsetY)` → `void`

**Dependencies**: 
- VehicleSystem.getVehicles()
- PedestrianSystem.getActivePedestrians()
- isoToScreen utility

---

### 6. **GridInteractionHandler** (Input/Interaction)
**Location**: Lines 1023-1134, 875-981

**What it handles:**
- Pointer to grid cell conversion
- Edge detection from pointer position
- Hover highlighting
- Cell/edge coordinate resolution

**Extract to**: `src/systems/GridInteractionHandler.ts` or `src/handlers/GridInteractionHandler.ts`

**Why**: All gameplay scenes need to convert screen coordinates to grid coordinates and detect hover states.

**Key methods:**
- `getCellAtPointer(pointer, gridSize, gridOffsetX, gridOffsetY)` → `{x, y} | null`
- `getNearestEdge(cellX, cellY, pointer, gridOffsetX, gridOffsetY)` → `number`
- `drawHighlight(cellX, cellY, graphics, edge?, mode?, previewData?)` → `void`

**Note**: Some of this might remain in scene-specific code (e.g., demolish mode highlight style), but the core coordinate conversion should be shared.

---

### 7. **BaseGameplayScene** (Scene Foundation)
**Location**: Entire scene structure (lines 56-150, 1891-1933)

**What it provides:**
- Common scene setup (grid, systems initialization)
- Entity systems integration (VehicleSystem, PedestrianSystem)
- Update loop structure
- Grid positioning/centering
- Camera controls (basic)
- Game UI updates (clock, budget, rating)

**Extract to**: `src/scenes/BaseGameplayScene.ts` (abstract base class)

**Why**: ChallengeScene and DevModeScene will share this foundation. This reduces duplication.

**Structure:**
```typescript
abstract class BaseGameplayScene extends Phaser.Scene {
  protected gridManager: GridManager;
  protected gridRenderer: GridRenderer;
  protected ploppableManager: PloppableManager;
  protected vehicleSystem: VehicleSystem;
  protected pedestrianSystem: PedestrianSystem;
  protected gridSize: number;
  protected gridOffsetX: number;
  protected gridOffsetY: number;
  
  // Abstract methods for scene-specific behavior
  abstract setupScene(): void;
  abstract handleInput(): void;
  
  // Shared initialization
  create(): void {
    this.initializeGrid();
    this.initializeSystems();
    this.setupScene();
    this.setupCamera();
  }
  
  update(time: number, delta: number): void {
    GameSystems.update(delta);
    this.updateEntities(delta);
    this.updateUI();
    this.render();
  }
}
```

**Benefits**: 
- Challenges inherit grid, entity systems, rendering, and update loop
- Dev mode extends this base and adds dev-specific UI/controls
- Reduces code duplication significantly

---

### 8. **SpawnerManager** (Spawner/Despawner Management)
**Location**: Lines 413-432, 695-765, 1573-1609, 1953-2009

**What it handles:**
- Vehicle spawner/despawner pairing
- Pedestrian spawner registration
- Spawner/despawner rendering
- Rebuilding pairs from loaded data

**Extract to**: `src/managers/SpawnerManager.ts` or `src/systems/SpawnerManager.ts`

**Why**: Challenges will need to manage spawners. This logic is currently mixed into DevModeScene but is core gameplay.

**Key methods:**
- `addVehicleSpawnerPair(spawnerX, spawnerY, despawnerX, despawnerY, vehicleSystem)` → `void`
- `removeVehicleSpawnerPair(spawnerX, spawnerY, vehicleSystem)` → `void`
- `addPedestrianSpawner(x, y, pedestrianSystem)` → `void`
- `removePedestrianSpawner(x, y, pedestrianSystem)` → `void`
- `rebuildSpawnerPairsFromGrid(gridManager, vehicleSystem, pedestrianSystem)` → `void`

---

## Systems That Should Stay Scene-Specific

### 1. **Dev-Specific UI Setup** (Lines 1224-1425, 1588-1805)
- Color selection buttons
- Ploppable placement buttons
- Demolish button
- Export/import buttons
- Selection info display

**Why**: Dev mode has unique UI that challenges won't need.

### 2. **Painting/Editing Logic** (Lines 653-873)
- Cell painting (color selection)
- Line/border painting
- Permanent marking
- Demolish mode

**Why**: Challenges will have different placement rules (cost validation, challenge constraints). Dev mode is "free build" mode.

### 3. **Keyboard Controls for Orientation** (Lines 1427-1470)
- Q/E rotation keys

**Note**: This might actually be shared if challenges allow rotation, but the implementation might differ (e.g., challenges might have rotation costs).

### 4. **Export/Import Functionality** (Lines 1553-1589)
- Grid serialization UI
- File import/export

**Why**: Dev mode specific feature for saving/loading test layouts.

---

## Recommended Extraction Order

1. **Start with GridManager** - Foundation that everything else depends on
2. **Extract PathfindingUtilities** - Used by systems and can be tested independently
3. **Extract GridRenderer** - Visual layer, depends on GridManager
4. **Extract EntityRenderer** - Depends on systems but is independent otherwise
5. **Extract PloppableManager** - Depends on GridManager
6. **Extract SpawnerManager** - Depends on systems and GridManager
7. **Create BaseGameplayScene** - Wires everything together
8. **Refactor DevModeScene** - Extends BaseGameplayScene and adds dev-specific features

---

## File Structure Proposal

```
src/
├── core/
│   ├── GridManager.ts          # NEW: Cell data, border segments, serialization
│   └── BaseGameplayScene.ts    # NEW: Base class for gameplay scenes
├── systems/
│   ├── GridRenderer.ts         # NEW: Grid/cell/border/rail rendering
│   ├── PloppableManager.ts     # NEW: Ploppable placement/removal
│   ├── SpawnerManager.ts       # NEW: Spawner/despawner management
│   └── GridInteractionHandler.ts # NEW: Pointer-to-grid conversion, hover
├── renderers/
│   └── EntityRenderer.ts       # NEW: Vehicle/pedestrian rendering
├── utils/
│   └── PathfindingUtilities.ts # NEW: Edge blocking, rail checks, line intersection
└── scenes/
    ├── BaseGameplayScene.ts    # MOVED: From core/ (if placed there initially)
    ├── DevModeScene.ts         # REFACTORED: Extends BaseGameplayScene
    └── ChallengeScene.ts       # REFACTORED: Extends BaseGameplayScene
```

---

## Benefits of This Refactoring

1. **Code Reuse**: Challenge scenes inherit all core functionality
2. **Maintainability**: Changes to grid/rendering logic happen in one place
3. **Testability**: Extracted systems can be unit tested independently
4. **Clarity**: DevModeScene becomes much smaller (~800-1000 lines instead of ~2450)
5. **Consistency**: All scenes use the same grid/entity management, ensuring consistency
6. **Extensibility**: Easy to add new gameplay scenes (e.g., tutorial, sandbox mode)

---

## Estimated Impact

- **DevModeScene.ts**: ~2450 lines → ~800-1000 lines (60% reduction)
- **New shared code**: ~1500-2000 lines across multiple files
- **Net code organization**: Better separation of concerns, easier to maintain

