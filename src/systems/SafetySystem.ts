import { GridManager } from '@/core/GridManager';
import { Ploppable, CellData } from '@/types';
import { PloppableManager } from './PloppableManager';

/**
 * SafetySystem - Singleton that manages cell safety values
 * 
 * Tracks safety values per cell and calculates area-of-effect (AoE) when ploppables are placed/removed.
 * Safety contributes 15 points to the overall lot rating if average safety > 0, otherwise 0.
 */
export class SafetySystem {
  private static instance: SafetySystem;
  
  /**
   * Ploppable AoE configuration
   * safetyDelta: change in safety value (+1 or -1, but currently all are positive or 0)
   * radius: radius in cells
   * shape: 'circular' (isometric distance) or 'square' (Chebyshev distance)
   * isTwoTile: true if ploppable spans 2 cells
   */
  private readonly ploppableConfigs: Record<string, {
    safetyDelta: number;
    radius: number;
    shape: 'circular' | 'square';
    isTwoTile?: boolean;
  }> = {
    'Street Light': { safetyDelta: 1, radius: 2, shape: 'circular' },
    'Security Camera': { safetyDelta: 1, radius: 8, shape: 'circular' },
    'Speed Bump': { safetyDelta: 1, radius: 1, shape: 'circular' },
    'Crosswalk': { safetyDelta: 1, radius: 1, shape: 'circular' },
  };
  
  private constructor() {}
  
  static getInstance(): SafetySystem {
    if (!SafetySystem.instance) {
      SafetySystem.instance = new SafetySystem();
    }
    return SafetySystem.instance;
  }
  
  /**
   * Update safety value for a specific cell
   * @param gridManager - Grid manager instance
   * @param x - Cell X coordinate
   * @param y - Cell Y coordinate
   * @param delta - Change in safety value (can be positive or negative)
   */
  updateCellSafety(gridManager: GridManager, x: number, y: number, delta: number): void {
    const cellData = gridManager.getCellData(x, y);
    const currentSafety = cellData?.safety ?? 0;
    const newSafety = currentSafety + delta;
    
    gridManager.setCellData(x, y, { safety: newSafety });
  }
  
  /**
   * Calculate Manhattan distance (diamond/rhombus shape) between two cells
   * Uses: |dx| + |dy|
   * This gives a diamond shape in grid space, approximating a circle in isometric view
   */
  private calculateManhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  
  /**
   * Calculate Chebyshev distance (square radius) between two cells
   * Uses: max(|dx|, |dy|)
   */
  private calculateChebyshevDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  }
  
  /**
   * Check if a cell is within AoE range of a ploppable
   */
  private isCellInRange(
    cellX: number,
    cellY: number,
    ploppableX: number,
    ploppableY: number,
    radius: number,
    shape: 'circular' | 'square'
  ): boolean {
    if (shape === 'square') {
      // Chebyshev distance (square)
      const distance = this.calculateChebyshevDistance(cellX, cellY, ploppableX, ploppableY);
      return distance <= radius;
    } else {
      // Circular: Use Manhattan distance (diamond shape in grid space)
      // This approximates a circular area of effect in isometric view
      const distance = this.calculateManhattanDistance(cellX, cellY, ploppableX, ploppableY);
      return distance <= radius;
    }
  }
  
  /**
   * Apply area-of-effect for a ploppable
   * @param ploppable - The ploppable being placed or removed
   * @param gridManager - Grid manager instance
   * @param gridWidth - Grid width
   * @param gridHeight - Grid height
   * @param isRemoval - If true, reverses the AoE (subtracts instead of adds)
   */
  applyPloppableAoE(
    ploppable: Ploppable,
    gridManager: GridManager,
    gridWidth: number,
    gridHeight: number,
    isRemoval: boolean
  ): void {
    const config = this.ploppableConfigs[ploppable.type];
    if (!config) {
      return; // Ploppable doesn't affect safety
    }
    
    const delta = isRemoval ? -config.safetyDelta : config.safetyDelta;
    
    // Get all cells that should be affected
    const affectedCells: { x: number; y: number }[] = [];
    
    // For 2-tile ploppables, apply AoE from both cell centers
    if (config.isTwoTile) {
      const primaryCell = { x: ploppable.x, y: ploppable.y };
      const secondCell = PloppableManager.getSecondCellForTwoTile(
        ploppable.x,
        ploppable.y,
        ploppable.orientation ?? 0,
        gridWidth,
        gridHeight
      );
      
      // Apply AoE from primary cell
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          if (this.isCellInRange(x, y, primaryCell.x, primaryCell.y, config.radius, config.shape)) {
            affectedCells.push({ x, y });
          }
        }
      }
      
      // Apply AoE from second cell if it exists
      if (secondCell) {
        for (let y = 0; y < gridHeight; y++) {
          for (let x = 0; x < gridWidth; x++) {
            // Avoid double-counting cells that are in range of both
            const alreadyAffected = affectedCells.some(c => c.x === x && c.y === y);
            if (!alreadyAffected && this.isCellInRange(x, y, secondCell.x, secondCell.y, config.radius, config.shape)) {
              affectedCells.push({ x, y });
            }
          }
        }
      }
    } else {
      // Single-tile ploppable
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          if (this.isCellInRange(x, y, ploppable.x, ploppable.y, config.radius, config.shape)) {
            affectedCells.push({ x, y });
          }
        }
      }
    }
    
    // Update safety for all affected cells
    for (const cell of affectedCells) {
      this.updateCellSafety(gridManager, cell.x, cell.y, delta);
    }
  }
  
  /**
   * Get average safety across all cells
   */
  getAverageSafety(gridManager: GridManager, gridWidth: number, gridHeight: number): number {
    let totalSafety = 0;
    let cellCount = 0;
    
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cellData = gridManager.getCellData(x, y);
        const safety = cellData?.safety ?? 0;
        totalSafety += safety;
        cellCount++;
      }
    }
    
    return cellCount > 0 ? totalSafety / cellCount : 0;
  }
  
  /**
   * Get safety contribution to rating (0-15 points)
   * Calculation:
   * 1. Each non-permanent cell with positive safety = 1, 0 or negative = 0 (boolean conversion)
   * 2. Sum all boolean values
   * 3. Divide by total number of non-permanent cells (percentage of playable cells with positive safety)
   * 4. Multiply by 15
   * Permanent tiles are excluded since players cannot plop on them.
   */
  getSafetyContribution(gridManager: GridManager, gridWidth: number, gridHeight: number): number {
    let positiveCellCount = 0;
    let totalCells = 0;
    
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cellData = gridManager.getCellData(x, y);
        if (cellData?.isPermanent) continue;
        const safety = cellData?.safety ?? 0;
        if (safety > 0) {
          positiveCellCount++;
        }
        totalCells++;
      }
    }
    
    if (totalCells === 0) {
      return 0;
    }
    
    const percentage = positiveCellCount / totalCells;
    return percentage * 15;
  }
  
  /**
   * Reset all safety values to 0
   */
  reset(gridManager: GridManager, gridWidth: number, gridHeight: number): void {
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        gridManager.setCellData(x, y, { safety: 0 });
      }
    }
  }
}

