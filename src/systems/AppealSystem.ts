import { GridManager } from '@/core/GridManager';
import { Ploppable, CellData } from '@/types';
import { PloppableManager } from './PloppableManager';

/**
 * AppealSystem - Singleton that manages cell appeal values
 * 
 * Tracks appeal values per cell and calculates area-of-effect (AoE) when ploppables are placed/removed.
 * Appeal contributes 15 points to the overall lot rating if average appeal > 0, otherwise 0.
 */
export class AppealSystem {
  private static instance: AppealSystem;
  
  /**
   * Ploppable AoE configuration
   * appealDelta: change in appeal value (+1 or -1)
   * radius: radius in cells
   * shape: 'circular' (isometric distance) or 'square' (Chebyshev distance)
   * isTwoTile: true if ploppable spans 2 cells (like Dumpster)
   */
  private readonly ploppableConfigs: Record<string, {
    appealDelta: number;
    radius: number;
    shape: 'circular' | 'square';
    isTwoTile?: boolean;
  }> = {
    'Tree': { appealDelta: 1, radius: 3, shape: 'circular' },
    'Shrub': { appealDelta: 1, radius: 2, shape: 'circular' },
    'Flower Patch': { appealDelta: 1, radius: 1, shape: 'square' },
    'Dumpster': { appealDelta: -1, radius: 3, shape: 'circular', isTwoTile: true },
    'Trash Can': { appealDelta: -1, radius: 2, shape: 'circular' },
    'Portable Toilet': { appealDelta: -1, radius: 2, shape: 'circular' },
    'Bench': { appealDelta: 1, radius: 1, shape: 'circular' },
  };
  
  private constructor() {}
  
  static getInstance(): AppealSystem {
    if (!AppealSystem.instance) {
      AppealSystem.instance = new AppealSystem();
    }
    return AppealSystem.instance;
  }
  
  /**
   * Update appeal value for a specific cell
   * @param gridManager - Grid manager instance
   * @param x - Cell X coordinate
   * @param y - Cell Y coordinate
   * @param delta - Change in appeal value (can be positive or negative)
   */
  updateCellAppeal(gridManager: GridManager, x: number, y: number, delta: number): void {
    const cellData = gridManager.getCellData(x, y);
    const currentAppeal = cellData?.appeal ?? 0;
    const newAppeal = currentAppeal + delta;
    
    gridManager.setCellData(x, y, { appeal: newAppeal });
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
      return; // Ploppable doesn't affect appeal
    }
    
    const delta = isRemoval ? -config.appealDelta : config.appealDelta;
    
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
    
    // Update appeal for all affected cells
    for (const cell of affectedCells) {
      this.updateCellAppeal(gridManager, cell.x, cell.y, delta);
    }
  }
  
  /**
   * Get average appeal across all cells
   */
  getAverageAppeal(gridManager: GridManager, gridWidth: number, gridHeight: number): number {
    let totalAppeal = 0;
    let cellCount = 0;
    
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cellData = gridManager.getCellData(x, y);
        const appeal = cellData?.appeal ?? 0;
        totalAppeal += appeal;
        cellCount++;
      }
    }
    
    return cellCount > 0 ? totalAppeal / cellCount : 0;
  }
  
  /**
   * Get appeal contribution to rating (0-15 points)
   * Calculation:
   * 1. Each cell with positive appeal = 1, 0 or negative = 0 (boolean conversion)
   * 2. Sum all boolean values
   * 3. Divide by total number of cells (percentage of cells with positive appeal)
   * 4. Multiply by 15
   */
  getAppealContribution(gridManager: GridManager, gridWidth: number, gridHeight: number): number {
    let positiveCellCount = 0;
    let totalCells = 0;
    
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cellData = gridManager.getCellData(x, y);
        const appeal = cellData?.appeal ?? 0;
        // Positive appeal = 1, 0 or negative = 0
        if (appeal > 0) {
          positiveCellCount++;
        }
        totalCells++;
      }
    }
    
    if (totalCells === 0) {
      return 0;
    }
    
    // Calculate percentage and multiply by 15
    const percentage = positiveCellCount / totalCells;
    return percentage * 15;
  }
  
  /**
   * Reset all appeal values to 0
   */
  reset(gridManager: GridManager, gridWidth: number, gridHeight: number): void {
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        gridManager.setCellData(x, y, { appeal: 0 });
      }
    }
  }
}

