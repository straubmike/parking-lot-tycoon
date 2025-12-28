# Ploppable Development Guide

This guide provides a comprehensive overview of how to add new ploppables to the Parking Lot Tycoon game. It covers all the necessary components, systems, and patterns to follow.

## Table of Contents

1. [Overview](#overview)
2. [Ploppable Types and Orientation Systems](#ploppable-types-and-orientation-systems)
3. [Implementation Checklist](#implementation-checklist)
4. [File Locations and Responsibilities](#file-locations-and-responsibilities)
5. [Step-by-Step Implementation](#step-by-step-implementation)
6. [2-Tile Ploppables](#2-tile-ploppables)
7. [Common Patterns](#common-patterns)

## Overview

Ploppables are interactive objects that can be placed on the game grid. They include items like parking spots, trash cans, vending machines, and dumpsters. Each ploppable must implement:

1. Button selection and targeted cell(s) location highlight mouseover visualization
2. Left click adding ploppable logic to the cell(s), adding the draw logic
3. Type A or B orientation logic during placement
4. Compatibility with the demolition tool after placement
5. Passability logic for pathing vehicles and pedestrians
6. Function-specific logic (needs fulfillment, appeal, etc.)

## Ploppable Types and Orientation Systems

### Orientation Type A
- **Examples**: Trash Can
- **Behavior**: Positioned along rail extremities (cell border midpoints), but inside the cell
- **Placement**: Uses Q/E keys to cycle through 4 positions (0=north, 1=east, 2=south, 3=west)
- **Visual**: Small emoji at border position
- **Use Case**: Small, passable objects that sit at cell edges

### Orientation Type B
- **Examples**: Vending Machine, Dumpster
- **Behavior**: Central position with rotation indicator (arrow showing facing direction)
- **Placement**: Uses Q/E keys to rotate orientation (0=north, 1=east, 2=south, 3=west)
- **Visual**: Large emoji at cell center with green arrow indicating front face
- **Use Case**: Larger objects that block movement, require facing direction for interaction

### Size: Single-Tile vs 2-Tile

Most ploppables occupy a single cell. However, some ploppables (like Dumpster) span 2 cells:

- **Single-Tile**: Placed on one cell, stored in that cell's data
- **2-Tile**: Placed on primary cell, stored in both primary and second cell
  - Primary cell coordinates are stored in `ploppable.x` and `ploppable.y`
  - Second cell is calculated based on orientation
  - Rendering draws across both cells from the primary cell only
  - Removal clears both cells

## Implementation Checklist

When adding a new ploppable, ensure you complete all of the following:

- [ ] Add button to `index.html` in the ploppables container
- [ ] Add emoji mapping in `PloppableManager.drawPloppable()`
- [ ] Add passability rule in `PassabilitySystem.DEFAULT_PASSABILITY`
- [ ] Add need type mapping in `NeedsSystem.getPloppableNeedType()` (if applicable)
- [ ] Add appeal config in `AppealSystem.ploppableConfigs` (if applicable)
- [ ] Add security config in `SecuritySystem.ploppableConfigs` (if applicable)
- [ ] Update `DevModeScene` to handle placement, preview, and rotation
- [ ] Update `PloppableManager.canPlacePloppable()` for 2-tile ploppables (if applicable)
- [ ] Update `PloppableManager.placePloppable()` for 2-tile ploppables (if applicable)
- [ ] Update `PloppableManager.removePloppable()` for 2-tile ploppables (if applicable)
- [ ] Update `PloppableManager.drawPloppable()` for 2-tile rendering (if applicable)
- [ ] Update `NeedsSystem.getNeedTargetPosition()` if needed for special cases
- [ ] Add any special logic (appeal, requirements, etc.)

## File Locations and Responsibilities

### Core Files

#### `index.html`
- **Location**: Root directory
- **Purpose**: UI button definition
- **What to add**: Button in `.ploppables-container` with data attributes:
  - `data-name`: Display name (must match type string)
  - `data-description`: Tooltip description
  - `data-orientation-type`: "A" or "B"
  - `data-passable`: "true" or "false"
  - `data-size`: "1" or "2" (optional, defaults to 1)
- **Example**:
  ```html
  <button class="ploppable-button" 
          data-name="Dumpster" 
          data-description="Large trash receptacle..." 
          data-orientation-type="B" 
          data-passable="false" 
          data-size="2">🗄️</button>
  ```

#### `src/systems/PassabilitySystem.ts`
- **Purpose**: Defines which ploppables block movement
- **What to add**: Entry in `DEFAULT_PASSABILITY` object
- **Values**: `true` = passable, `false` = impassable
- **Example**:
  ```typescript
  'Dumpster': false, // Dumpsters are impassable (block movement)
  ```

#### `src/systems/PloppableManager.ts`
- **Purpose**: Core ploppable management (placement, removal, rendering)
- **Key methods to update**:
  - `drawPloppable()`: Add emoji mapping
  - `canPlacePloppable()`: Add 2-tile logic if needed
  - `placePloppable()`: Add 2-tile logic if needed
  - `removePloppable()`: Add 2-tile logic if needed
  - `getPloppableSize()`: Add size mapping for 2-tile ploppables
  - `getSecondCellForTwoTile()`: Already handles 2-tile calculations

#### `src/systems/NeedsSystem.ts`
- **Purpose**: Defines which ploppables fulfill pedestrian needs
- **What to add**: Entry in `getPloppableNeedType()` if ploppable fulfills needs
- **Need types**: `'trash'` or `'thirst'`
- **Example**:
  ```typescript
  if (ploppable.type === 'Trash Can' || ploppable.type === 'Dumpster') {
    return 'trash';
  }
  ```

#### `src/systems/AppealSystem.ts`
- **Purpose**: Defines which ploppables affect appeal values in surrounding cells
- **What to add**: Entry in `ploppableConfigs` object
- **Configuration**: `appealDelta` (positive or negative), `radius` (cells), `shape` ('circular' or 'square'), optional `isTwoTile`
- **Example**:
  ```typescript
  'Tree': { appealDelta: 1, radius: 3, shape: 'circular' },
  'Dumpster': { appealDelta: -1, radius: 3, shape: 'circular', isTwoTile: true },
  ```

#### `src/systems/SecuritySystem.ts`
- **Purpose**: Defines which ploppables affect security values in surrounding cells
- **What to add**: Entry in `ploppableConfigs` object
- **Configuration**: `securityDelta` (positive or negative), `radius` (cells), `shape` ('circular' or 'square'), optional `isTwoTile`
- **Example**:
  ```typescript
  'Street Light': { securityDelta: 1, radius: 2, shape: 'circular' },
  'Security Camera': { securityDelta: 1, radius: 8, shape: 'circular' },
  ```

#### `src/scenes/DevModeScene.ts`
- **Purpose**: Handles user interaction and placement logic
- **What to update**:
  - `paintCell()`: Already handles placement generically
  - `drawHighlight()`: Add preview rendering for new ploppable
  - `setupKeyboardControls()`: Add Q/E rotation handlers (if Type A or B)
  - `updateSelectionInfo()`: Add description/instructions

### Supporting Files

#### `src/types/index.ts`
- **Purpose**: TypeScript type definitions
- **Note**: `Ploppable` interface already supports orientation and passability
- **Only update if**: Adding new ploppable properties

#### `src/core/GridManager.ts`
- **Purpose**: Cell data storage and management
- **Note**: No changes typically needed for new ploppables

## Step-by-Step Implementation

### Step 1: Add UI Button

In `index.html`, add a button to the ploppables container:

```html
<button class="ploppable-button" 
        data-name="YourPloppableName" 
        data-description="Description text here" 
        data-orientation-type="B" 
        data-passable="false">🔲</button>
```

### Step 2: Add Passability Rule

In `src/systems/PassabilitySystem.ts`, add to `DEFAULT_PASSABILITY`:

```typescript
'YourPloppableName': false, // true = passable, false = impassable
```

### Step 3: Add Emoji Mapping

In `src/systems/PloppableManager.ts`, in `drawPloppable()`, add emoji:

```typescript
if (ploppable.type === 'YourPloppableName') emoji = '🔲';
```

### Step 4: Add Need Type (if applicable)

In `src/systems/NeedsSystem.ts`, in `getPloppableNeedType()`:

```typescript
if (ploppable.type === 'YourPloppableName') {
  return 'trash'; // or 'thirst'
}
```

### Step 5: Update DevModeScene

In `src/scenes/DevModeScene.ts`:

1. **Add to `drawHighlight()`** for preview:
   ```typescript
   else if (this.selectedPloppableType === 'YourPloppableName') {
     // Add preview rendering logic
   }
   ```

2. **Add to keyboard rotation handlers** (if Type A or B):
   ```typescript
   else if (this.selectedPloppableType === 'YourPloppableName') {
     // Add Q/E rotation logic
   }
   ```

3. **Add to `updateSelectionInfo()`** for instructions:
   ```typescript
   if (this.selectedPloppableType === 'YourPloppableName') {
     description += '\n\nUse Q and E keys to rotate orientation.';
   }
   ```

### Step 6: Test Placement

1. Select the ploppable button
2. Verify preview appears on mouseover
3. Test Q/E rotation (if applicable)
4. Place the ploppable with left click
5. Verify rendering is correct
6. Test demolition tool removal

## 2-Tile Ploppables

2-tile ploppables require additional implementation:

### Orientation Mapping

For 2-tile ploppables, orientations determine layout:
- **Orientation 0 (North)**: Cells at (x,y) and (x,y+1), front face at north edge
- **Orientation 1 (East)**: Cells at (x,y) and (x-1,y), front face at east edge
- **Orientation 2 (South)**: Cells at (x,y) and (x,y-1), front face at south edge
- **Orientation 3 (West)**: Cells at (x,y) and (x+1,y), front face at west edge

### Implementation Steps

1. **Add size mapping** in `PloppableManager.getPloppableSize()`:
   ```typescript
   if (ploppableType === 'Dumpster') {
     return 2;
   }
   ```

2. **Update `canPlacePloppable()`**: Already handles 2-tile via optional parameters
   - Pass `ploppableType`, `orientation`, `gridWidth`, `gridHeight` when calling

3. **Update `placePloppable()`**: Already handles 2-tile placement
   - Pass `gridWidth`, `gridHeight` when calling

4. **Update `removePloppable()`**: Already handles 2-tile removal
   - Pass `gridWidth`, `gridHeight` when calling

5. **Update `drawPloppable()`**: Add 2-tile rendering logic
   - Check `size === 2`
   - Calculate center between two cells
   - Only render from primary cell (check `gridX === ploppable.x && gridY === ploppable.y`)

6. **Update `drawHighlight()`** in DevModeScene for preview:
   - Calculate second cell using `PloppableManager.getSecondCellForTwoTile()`
   - Draw highlight on both cells
   - Draw arrow at center between cells

7. **Update `getPloppablesForNeed()`** in NeedsSystem:
   - Filter to only include primary cells: `if (ploppable.x === x && ploppable.y === y)`

## Common Patterns

### Type A Ploppable (Trash Can Pattern)

```typescript
// In drawHighlight():
if (orientationType === 'A') {
  const indicatorPos = PloppableManager.getTypeAPosition(centerX, centerY, this.ploppableOrientation);
  this.highlightGraphics.fillStyle(0x00ff00, 0.8);
  this.highlightGraphics.fillCircle(indicatorPos.x, indicatorPos.y, 4);
}

// In keyboard handler (Q key):
this.ploppableOrientation = (this.ploppableOrientation + 3) % 4; // Counter-clockwise

// In keyboard handler (E key):
this.ploppableOrientation = (this.ploppableOrientation + 1) % 4; // Clockwise
```

### Type B Ploppable (Vending Machine Pattern)

```typescript
// In drawHighlight():
PloppableManager.drawOrientationArrow(
  this.highlightGraphics,
  centerX,
  centerY,
  this.ploppableOrientation,
  20, // arrow length
  0x00ff00, // green color
  0.8 // semi-transparent for preview
);

// In keyboard handler (Q key):
this.ploppableOrientation = (this.ploppableOrientation + 3) % 4; // Counter-clockwise

// In keyboard handler (E key):
this.ploppableOrientation = (this.ploppableOrientation + 1) % 4; // Clockwise
```

### 2-Tile Type B Ploppable (Dumpster Pattern)

```typescript
// In drawHighlight():
const secondCell = PloppableManager.getSecondCellForTwoTile(
  gridX, gridY, this.ploppableOrientation, this.gridWidth, this.gridHeight
);
if (secondCell) {
  // Draw highlights on both cells
  // Calculate center between cells
  // Draw arrow at center
}

// Placement already handled by PloppableManager with proper parameters
```

## Notes

- **Passability**: Impassable ploppables block both vehicles and pedestrians
- **Needs Fulfillment**: Type A targets the ploppable's cell center; Type B targets the cell adjacent to the front face
- **Appeal System**: Ploppables can affect appeal values in cells within a radius. Configure in `AppealSystem.ploppableConfigs` with `appealDelta`, `radius`, `shape`, and optional `isTwoTile`.
- **Security System**: Ploppables can affect security values in cells within a radius. Configure in `SecuritySystem.ploppableConfigs` with `securityDelta`, `radius`, `shape`, and optional `isTwoTile`. Security contributes 15 points to lot rating based on percentage of cells with positive security.
- **Cost**: Currently set to 0 in DevModeScene, but can be added to ploppable object
- **Serialization**: GridManager automatically handles saving/loading ploppables
- **Demolition**: Works automatically via `PloppableManager.removePloppable()`
- **Special Placement Rules**: Some ploppables (like Security Camera) can only be placed on cells that already contain specific ploppables (like Street Light). Implement validation in `DevModeScene.paintCell()` and handle replacement/restoration logic in `DevModeScene.demolishAtCell()`.
- **Special Placement Rules**: Some ploppables (like Security Camera) can only be placed on cells that already contain specific ploppables (like Street Light). Implement validation in `DevModeScene.paintCell()` and handle replacement/restoration logic in `DevModeScene.demolishAtCell()`.

## Testing Checklist

After implementing a new ploppable:

- [ ] Button appears and is selectable
- [ ] Preview highlight shows correctly on mouseover
- [ ] Q/E rotation works (if Type A or B)
- [ ] Placement works with left click
- [ ] Rendering appears correct (emoji and arrow if Type B)
- [ ] Demolition tool removes the ploppable
- [ ] Passability works correctly (entities can/cannot pass)
- [ ] Needs fulfillment works (if applicable)
- [ ] Appeal/Security AoE works correctly (if applicable)
- [ ] 2-tile ploppables place/remove from both cells correctly
- [ ] No duplicate ploppables in needs system (for 2-tile)
- [ ] Special placement rules work (if applicable, e.g., Security Camera on Street Light)

