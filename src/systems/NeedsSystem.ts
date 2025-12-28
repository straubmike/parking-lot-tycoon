import { Ploppable } from '@/types';
import { GridManager } from '@/core/GridManager';
import { isoToScreen } from '@/utils/isometric';
import { PloppableManager } from './PloppableManager';

/**
 * NeedsSystem - Manages pedestrian needs and need fulfillment
 */
export class NeedsSystem {
  /**
   * Get the need type that a ploppable fulfills, if any
   */
  static getPloppableNeedType(ploppable: Ploppable): 'trash' | 'thirst' | 'toilet' | null {
    if (ploppable.type === 'Trash Can' || ploppable.type === 'Dumpster') {
      return 'trash';
    } else if (ploppable.type === 'Vending Machine') {
      return 'thirst';
    } else if (ploppable.type === 'Portable Toilet') {
      return 'toilet';
    }
    return null;
  }

  /**
   * Get all ploppables that fulfill a specific need
   * For 2-tile ploppables, only includes them once (from the primary cell)
   */
  static getPloppablesForNeed(
    needType: 'trash' | 'thirst' | 'toilet',
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
   * 
   * For both single-tile Type B (vending machine) and 2-tile Type B (dumpster) ploppables:
   * - The arrow indicates the intended front face direction
   * - Pedestrians path to the face one cell counter-clockwise from the arrow direction
   * - Orientation mapping: 0=north, 1=east, 2=south, 3=west
   * - Target is calculated by rotating orientation by -1 (counter-clockwise by 1, which is +3 mod 4)
   */
  static getNeedTargetPosition(
    ploppable: Ploppable
  ): { x: number; y: number } {
    if (ploppable.orientationType === 'A') {
      // Type A: Target is the centerpoint of the cell containing the ploppable
      return { x: ploppable.x, y: ploppable.y };
    } else {
      // Type B: Target is the midpoint of the cell adjacent to the face of the ploppable
      const orientation = ploppable.orientation || 0;
      const ploppableSize = PloppableManager.getPloppableSize(ploppable.type);
      
      // For 2-tile dumpsters, the front face is the long face indicated by the arrow
      // The arrow points in the direction of the front long face
      if (ploppableSize === 2 && ploppable.type === 'Dumpster') {
        let result: { x: number; y: number };
        // For dumpsters, orientation indicates which long face is the front face (indicated by arrow)
        // Peds path one face counter-clockwise from the arrow direction
        // So we rotate orientation by -1 (counter-clockwise by 1, which is +3 mod 4)
        // Orientation mapping: 0=north, 1=east, 2=south, 3=west
        // If arrow points north (0), target is west (3) - one counter-clockwise
        const adjustedOrientation = (orientation + 3) % 4;
        switch (adjustedOrientation) {
          case 0: // North - target is north of primary cell (y-1)
            result = { x: ploppable.x, y: ploppable.y - 1 };
            break;
          case 1: // East - target is east of primary cell (x+1)
            result = { x: ploppable.x + 1, y: ploppable.y };
            break;
          case 2: // South - target is south of primary cell (y+1)
            result = { x: ploppable.x, y: ploppable.y + 1 };
            break;
          case 3: // West - target is west of primary cell (x-1)
            result = { x: ploppable.x - 1, y: ploppable.y };
            break;
          default:
            result = { x: ploppable.x, y: ploppable.y };
        }
        
        return result;
      } else {
        // For single-tile Type B ploppables (like vending machine), the arrow indicates the front face
        // Peds path one face counter-clockwise from the arrow direction
        // So we rotate orientation by -1 (counter-clockwise by 1, which is +3 mod 4)
        // Orientation mapping: 0=north, 1=east, 2=south, 3=west
        // If arrow points north (0), target is west (3) - one counter-clockwise
        const adjustedOrientation = (orientation + 3) % 4;
        let result: { x: number; y: number };
        switch (adjustedOrientation) {
          case 0: // North - target is north (y-1)
            result = { x: ploppable.x, y: ploppable.y - 1 };
            break;
          case 1: // East - target is east (x+1)
            result = { x: ploppable.x + 1, y: ploppable.y };
            break;
          case 2: // South - target is south (y+1)
            result = { x: ploppable.x, y: ploppable.y + 1 };
            break;
          case 3: // West - target is west (x-1)
            result = { x: ploppable.x - 1, y: ploppable.y };
            break;
          default:
            result = { x: ploppable.x, y: ploppable.y };
        }
        
        return result;
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
  static needRequiresTimer(needType: 'trash' | 'thirst' | 'toilet'): boolean {
    return needType === 'thirst'; // Vending machine requires a 2-minute timer
  }

  /**
   * Check if a need requires despawn/respawn (e.g., portable toilet)
   */
  static needRequiresDespawn(needType: 'trash' | 'thirst' | 'toilet'): boolean {
    return needType === 'toilet'; // Portable toilet requires despawn/respawn
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

