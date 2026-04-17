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
   * For Type A / pedestrian-passable ploppables (trash can, vending machine, dumpster, portable toilet):
   *   returns the cell containing the ploppable itself. Toilet peds despawn on arrival
   *   to simulate entering the cabinet (see PedestrianSystem despawn handling).
   * For Type B impassable ploppables (none currently):
   *   returns the cell adjacent to the face of the ploppable (arrow = front face; target one cell counter-clockwise)
   */
  static getNeedTargetPosition(
    ploppable: Ploppable
  ): { x: number; y: number } {
    // Pedestrian-passable need targets: walk onto the same cell
    if (
      ploppable.orientationType === 'A' ||
      ploppable.type === 'Vending Machine' ||
      ploppable.type === 'Dumpster' ||
      ploppable.type === 'Portable Toilet'
    ) {
      return { x: ploppable.x, y: ploppable.y };
    }

    // Type B impassable fallback: path to an adjacent front-face cell
    const orientation = ploppable.orientation || 0;
    const adjustedOrientation = (orientation + 3) % 4;
    switch (adjustedOrientation) {
      case 0: return { x: ploppable.x, y: ploppable.y - 1 };
      case 1: return { x: ploppable.x + 1, y: ploppable.y };
      case 2: return { x: ploppable.x, y: ploppable.y + 1 };
      case 3: return { x: ploppable.x - 1, y: ploppable.y };
      default: return { x: ploppable.x, y: ploppable.y };
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

