import { Ploppable } from '@/types';
import { GridManager } from '@/core/GridManager';
import { isoToScreen } from '@/utils/isometric';

/**
 * NeedsSystem - Manages pedestrian needs and need fulfillment
 */
export class NeedsSystem {
  /**
   * Get the need type that a ploppable fulfills, if any
   */
  static getPloppableNeedType(ploppable: Ploppable): 'trash' | 'thirst' | null {
    if (ploppable.type === 'Trash Can' || ploppable.type === 'Dumpster') {
      return 'trash';
    } else if (ploppable.type === 'Vending Machine') {
      return 'thirst';
    }
    return null;
  }

  /**
   * Get all ploppables that fulfill a specific need
   * For 2-tile ploppables, only includes them once (from the primary cell)
   */
  static getPloppablesForNeed(
    needType: 'trash' | 'thirst',
    gridManager: GridManager,
    gridWidth: number,
    gridHeight: number
  ): Ploppable[] {
    const ploppables: Ploppable[] = [];
    
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        const cellData = gridManager.getCellData(x, y);
        const ploppable = cellData?.ploppable;
        if (ploppable && this.getPloppableNeedType(ploppable) === needType) {
          // For 2-tile ploppables, only include from the primary cell (where ploppable.x, ploppable.y matches)
          // This avoids duplicates since 2-tile ploppables are stored in both cells
          if (ploppable.x === x && ploppable.y === y) {
            ploppables.push(ploppable);
          }
        }
      }
    }
    
    return ploppables;
  }

  /**
   * Calculate the target grid position for fulfilling a need at a ploppable
   * For Type A (passable): returns the centerpoint of the cell containing the ploppable
   * For Type B (impassable): returns the midpoint of the cell adjacent to the face of the ploppable
   * For 2-tile Type B (dumpster): target is adjacent to the front face (primary cell's front face)
   */
  static getNeedTargetPosition(
    ploppable: Ploppable
  ): { x: number; y: number } {
    if (ploppable.orientationType === 'A') {
      // Type A: Target is the centerpoint of the cell containing the ploppable
      return { x: ploppable.x, y: ploppable.y };
    } else {
      // Type B: Target is the midpoint of the cell adjacent to the face of the ploppable
      // Orientation: 0=north, 1=east, 2=south, 3=west
      // For vending machine and dumpster, the "face" is the side it's facing
      // For 2-tile dumpsters, the front face is on the primary cell (ploppable.x, ploppable.y)
      const orientation = ploppable.orientation || 0;
      
      switch (orientation) {
        case 0: // North (facing up) - adjacent cell is north (y-1)
          return { x: ploppable.x, y: ploppable.y - 1 };
        case 1: // East (facing right) - adjacent cell is east (x+1)
          return { x: ploppable.x + 1, y: ploppable.y };
        case 2: // South (facing down) - adjacent cell is south (y+1)
          return { x: ploppable.x, y: ploppable.y + 1 };
        case 3: // West (facing left) - adjacent cell is west (x-1)
          return { x: ploppable.x - 1, y: ploppable.y };
        default:
          return { x: ploppable.x, y: ploppable.y };
      }
    }
  }

  /**
   * Get screen position for need target (used for pathfinding visualization if needed)
   */
  static getNeedTargetScreenPosition(
    ploppable: Ploppable
  ): { x: number; y: number } {
    const targetGrid = this.getNeedTargetPosition(ploppable);
    return isoToScreen(targetGrid.x, targetGrid.y);
  }

  /**
   * Check if a pedestrian has reached their need fulfillment target
   */
  static hasReachedNeedTarget(
    pedestrianX: number,
    pedestrianY: number,
    ploppable: Ploppable
  ): boolean {
    const target = this.getNeedTargetPosition(ploppable);
    return pedestrianX === target.x && pedestrianY === target.y;
  }

  /**
   * Check if a need requires a timer (e.g., vending machine)
   */
  static needRequiresTimer(needType: 'trash' | 'thirst'): boolean {
    return needType === 'thirst'; // Vending machine requires a 2-minute timer
  }

  /**
   * Get the timer duration for a need (in game minutes)
   */
  static getNeedTimerDuration(needType: 'trash' | 'thirst'): number {
    if (needType === 'thirst') {
      return 2; // 2 in-game minutes for vending machine
    }
    return 0; // Trash can is instant
  }
}

