import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GridManager } from '@/core/GridManager';
import { Ploppable, CellData } from '@/types';
import { PassabilitySystem } from './PassabilitySystem';
import { AppealSystem } from './AppealSystem';
import { SecuritySystem } from './SecuritySystem';

/**
 * PloppableManager - Manages ploppable placement, removal, and rendering
 */
export class PloppableManager {
  /**
   * Calculate position along rail intersection for orientation-based ploppables
   * The rails form an X intersection at the cell center. Each orientation corresponds
   * to one of the four extremities of this X (along the rail directions).
   */
  static getOrientationPosition(
    centerX: number,
    centerY: number,
    orientation: number,
    distance: number
  ): { x: number; y: number } {
    // Calculate the direction vector length
    const directionLength = Math.sqrt(TILE_WIDTH * TILE_WIDTH + TILE_HEIGHT * TILE_HEIGHT) / 2;
    
    // Unit vectors for each orientation (along rail directions from center)
    let dirX: number, dirY: number;
    switch (orientation) {
      case 0: // Top-left: along row rail towards smaller X (decreasing X, same Y)
        dirX = -TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 1: // Top-right: along column rail towards smaller Y (same X, decreasing Y)
        dirX = TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 2: // Bottom-right: along row rail towards larger X (increasing X, same Y)
        dirX = TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      case 3: // Bottom-left: along column rail towards larger Y (same X, increasing Y)
        dirX = -TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      default:
        dirX = 0;
        dirY = 0;
    }
    
    // Normalize the direction vector and scale by distance
    const scale = distance / directionLength;
    return {
      x: centerX + dirX * scale,
      y: centerY + dirY * scale
    };
  }

  /**
   * Calculate position for Type A ploppables (trash can, etc.)
   * Positions are at the extremities of the rail X intersection, but inside the cell.
   */
  static getTypeAPosition(
    centerX: number,
    centerY: number,
    orientation: number
  ): { x: number; y: number } {
    // The distance from center to edge along each rail direction is directionLength
    const directionLength = Math.sqrt(TILE_WIDTH * TILE_WIDTH + TILE_HEIGHT * TILE_HEIGHT) / 2;
    
    // Use 40% of the distance from center to edge to ensure positions are subtly inside the cell borders
    const distanceFromCenter = directionLength * 0.4;
    return this.getOrientationPosition(centerX, centerY, orientation, distanceFromCenter);
  }

  /**
   * Draw an arrow from the center pointing in the orientation direction
   * Used for Type B ploppables (vending machine, etc.) to show facing direction
   */
  static drawOrientationArrow(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    orientation: number,
    arrowLength: number = 20,
    color: number = 0x00ff00,
    alpha: number = 1.0
  ): void {
    // Get the direction vector for this orientation
    const directionLength = Math.sqrt(TILE_WIDTH * TILE_WIDTH + TILE_HEIGHT * TILE_HEIGHT) / 2;
    let dirX: number, dirY: number;
    switch (orientation) {
      case 0: // Top-left
        dirX = -TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 1: // Top-right
        dirX = TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 2: // Bottom-right
        dirX = TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      case 3: // Bottom-left
        dirX = -TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      default:
        dirX = 0;
        dirY = 0;
    }
    
    // Normalize the direction vector
    const scale = arrowLength / directionLength;
    const endX = centerX + dirX * scale;
    const endY = centerY + dirY * scale;
    
    // Draw arrow shaft
    graphics.lineStyle(2, color, alpha);
    graphics.lineBetween(centerX, centerY, endX, endY);
    
    // Draw arrowhead (small triangle at the end)
    const arrowheadSize = 6;
    const arrowheadAngle = Math.atan2(dirY, dirX);
    
    // Calculate arrowhead points (perpendicular to the direction)
    const perpAngle = arrowheadAngle + Math.PI / 2;
    const arrowheadBaseX = endX - Math.cos(arrowheadAngle) * arrowheadSize;
    const arrowheadBaseY = endY - Math.sin(arrowheadAngle) * arrowheadSize;
    
    const arrowheadLeftX = arrowheadBaseX + Math.cos(perpAngle) * arrowheadSize * 0.5;
    const arrowheadLeftY = arrowheadBaseY + Math.sin(perpAngle) * arrowheadSize * 0.5;
    
    const arrowheadRightX = arrowheadBaseX - Math.cos(perpAngle) * arrowheadSize * 0.5;
    const arrowheadRightY = arrowheadBaseY - Math.sin(perpAngle) * arrowheadSize * 0.5;
    
    // Fill arrowhead triangle
    graphics.fillStyle(color, alpha);
    graphics.fillTriangle(endX, endY, arrowheadLeftX, arrowheadLeftY, arrowheadRightX, arrowheadRightY);
  }

  /**
   * Get the size of a ploppable (number of tiles it occupies)
   */
  static getPloppableSize(ploppableType: string): number {
    if (ploppableType === 'Dumpster') {
      return 2;
    }
    return 1; // Default to single tile
  }

  /**
   * Get the second cell coordinates for a 2-tile ploppable
   * Returns null if the ploppable is not 2-tile or orientation is invalid
   */
  static getSecondCellForTwoTile(
    gridX: number,
    gridY: number,
    orientation: number,
    gridWidth: number,
    gridHeight: number
  ): { x: number; y: number } | null {
    let secondX: number, secondY: number;
    
    // For 2-tile ploppables, the second cell is adjacent based on orientation
    // Orientation 0 (north): second cell is south (y+1) - vertical, front face at north
    // Orientation 1 (east): second cell is west (x-1) - horizontal, front face at east
    // Orientation 2 (south): second cell is north (y-1) - vertical, front face at south
    // Orientation 3 (west): second cell is east (x+1) - horizontal, front face at west
    switch (orientation) {
      case 0: // North - vertical, front face at top
        secondX = gridX;
        secondY = gridY + 1;
        break;
      case 1: // East - horizontal, front face at right
        secondX = gridX - 1;
        secondY = gridY;
        break;
      case 2: // South - vertical, front face at bottom
        secondX = gridX;
        secondY = gridY - 1;
        break;
      case 3: // West - horizontal, front face at left
        secondX = gridX + 1;
        secondY = gridY;
        break;
      default:
        return null;
    }
    
    // Check if second cell is within bounds
    if (secondX < 0 || secondX >= gridWidth || secondY < 0 || secondY >= gridHeight) {
      return null;
    }
    
    return { x: secondX, y: secondY };
  }

  /**
   * Check if a ploppable can be placed at the given cell
   * For 2-tile ploppables, checks both cells
   */
  static canPlacePloppable(
    gridX: number,
    gridY: number,
    gridManager: GridManager,
    ploppableType?: string,
    orientation?: number,
    gridWidth?: number,
    gridHeight?: number
  ): boolean {
    const cellData = gridManager.getCellData(gridX, gridY);
    // Cell is occupied if it has a ploppable, spawner, or despawner
    if (cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner) {
      return false;
    }
    
    // For 2-tile ploppables, also check the second cell
    if (ploppableType && this.getPloppableSize(ploppableType) === 2) {
      const ori = orientation ?? 0;
      const width = gridWidth ?? 0;
      const height = gridHeight ?? 0;
      const secondCell = this.getSecondCellForTwoTile(gridX, gridY, ori, width, height);
      if (!secondCell) {
        return false; // Second cell is out of bounds
      }
      
      const secondCellData = gridManager.getCellData(secondCell.x, secondCell.y);
      if (secondCellData?.ploppable || secondCellData?.vehicleSpawner || secondCellData?.vehicleDespawner) {
        return false; // Second cell is occupied
      }
    }
    
    return true;
  }

  /**
   * Place a ploppable at the given cell
   * Returns true if placement was successful
   * Automatically sets the passable property based on ploppable type if not already set
   * For 2-tile ploppables, places on both cells
   */
  static placePloppable(
    gridX: number,
    gridY: number,
    ploppable: Ploppable,
    gridManager: GridManager,
    gridWidth?: number,
    gridHeight?: number
  ): boolean {
    const width = gridWidth ?? gridManager.getGridWidth();
    const height = gridHeight ?? gridManager.getGridHeight();
    
    if (!this.canPlacePloppable(gridX, gridY, gridManager, ploppable.type, ploppable.orientation, width, height)) {
      return false;
    }
    
    // Set passable property if not already set (based on ploppable type)
    if (ploppable.passable === undefined) {
      ploppable.passable = PassabilitySystem.getPassableValueForType(ploppable.type);
    }
    
    // Place on primary cell
    gridManager.setCellData(gridX, gridY, { ploppable });
    
    // For 2-tile ploppables, also place on the second cell
    const size = this.getPloppableSize(ploppable.type);
    if (size === 2) {
      const orientation = ploppable.orientation ?? 0;
      const secondCell = this.getSecondCellForTwoTile(gridX, gridY, orientation, width, height);
      if (secondCell) {
        // Store the same ploppable reference in the second cell
        gridManager.setCellData(secondCell.x, secondCell.y, { ploppable });
      }
    }
    
    // Apply AoE effects from appeal and security systems
    AppealSystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, false);
    SecuritySystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, false);
    
    return true;
  }

  /**
   * Remove a ploppable from the given cell
   * Returns the removed ploppable if one existed
   * For 2-tile ploppables, removes from both cells
   */
  static removePloppable(
    gridX: number,
    gridY: number,
    gridManager: GridManager,
    gridWidth?: number,
    gridHeight?: number
  ): Ploppable | null {
    const cellData = gridManager.getCellData(gridX, gridY);
    if (!cellData?.ploppable) {
      return null;
    }
    
    const ploppable = cellData.ploppable;
    const width = gridWidth ?? gridManager.getGridWidth();
    const height = gridHeight ?? gridManager.getGridHeight();
    
    // For 2-tile ploppables, also remove from the second cell
    const size = this.getPloppableSize(ploppable.type);
    if (size === 2) {
      const orientation = ploppable.orientation ?? 0;
      const secondCell = this.getSecondCellForTwoTile(gridX, gridY, orientation, width, height);
      if (secondCell) {
        // Check if this is the primary cell (ploppable.x, ploppable.y matches this cell)
        // If not, we need to find the primary cell
        let primaryX = gridX;
        let primaryY = gridY;
        
        // If this is the second cell, calculate the primary cell
        if (gridX !== ploppable.x || gridY !== ploppable.y) {
          primaryX = ploppable.x;
          primaryY = ploppable.y;
          // Remove from this (second) cell first
          gridManager.setCellData(gridX, gridY, { ploppable: undefined as any });
          // Then remove from primary cell (which will also remove from its second cell)
          return this.removePloppable(primaryX, primaryY, gridManager, width, height);
        }
        
        // This is the primary cell, remove from second cell
        gridManager.setCellData(secondCell.x, secondCell.y, { ploppable: undefined as any });
      }
    }
    
    // Remove AoE effects from appeal and security systems before removing the ploppable
    AppealSystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, true);
    SecuritySystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, true);
    
    // Remove from primary cell
    gridManager.setCellData(gridX, gridY, { ploppable: undefined as any });
    
    return ploppable;
  }

  /**
   * Draw a ploppable and return the created label (if any) for management
   * Returns null for ploppables that don't create labels (parking spots, pedestrian spawners)
   * For 2-tile ploppables, only renders from the primary cell to avoid duplicates
   */
  static drawPloppable(
    gridX: number,
    gridY: number,
    cellData: CellData | undefined,
    scene: Phaser.Scene,
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number
  ): Phaser.GameObjects.Text | null {
    if (!cellData?.ploppable) return null;
    
    const ploppable = cellData.ploppable;
    
    // Skip ploppables that have their own rendering (parking spot, pedestrian spawner)
    if (ploppable.type === 'Parking Spot' || ploppable.type === 'Pedestrian Spawner') {
      return null;
    }
    
    // For 2-tile ploppables, only render from the primary cell (where ploppable.x, ploppable.y matches)
    const size = this.getPloppableSize(ploppable.type);
    if (size === 2 && (gridX !== ploppable.x || gridY !== ploppable.y)) {
      return null; // This is the second cell, skip rendering (will be rendered from primary cell)
    }
    
    const orientation = ploppable.orientation || 0;
    const orientationType = ploppable.orientationType || 'B'; // Default to Type B
    
    // Get emoji based on ploppable type
    let emoji = '❓';
    if (ploppable.type === 'Trash Can') emoji = '🗑️';
    else if (ploppable.type === 'Vending Machine') emoji = '🥤';
    else if (ploppable.type === 'Dumpster') emoji = '🗄️';
    else if (ploppable.type === 'Tree') emoji = '🌳';
    else if (ploppable.type === 'Shrub') emoji = '🌿';
    else if (ploppable.type === 'Flower Patch') emoji = '🌸';
    else if (ploppable.type === 'Street Light') emoji = '💡';
    else if (ploppable.type === 'Security Camera') emoji = '📹';
    else if (ploppable.type === 'Portable Toilet') emoji = '🚽';
    
    // Handle non-oriented ploppables (Tree, Shrub, Flower Patch, Security Camera) - render at center, no arrow
    if (ploppable.type === 'Tree' || ploppable.type === 'Shrub' || ploppable.type === 'Flower Patch' || ploppable.type === 'Security Camera') {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
      
      const label = scene.add.text(centerX, centerY, emoji, {
        fontSize: '24px',
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(3);
      return label;
    }
    
    if (orientationType === 'A') {
      // Type A: Position along rail extremities, but inside the cell
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
      const position = this.getTypeAPosition(centerX, centerY, orientation);
      
      // Create emoji label - origin at mid-bottom for Type A (trash can)
      const label = scene.add.text(position.x, position.y, emoji, {
        fontSize: '18px',
      });
      label.setOrigin(0.5, 1.0); // Mid-bottom origin
      label.setDepth(3);
      return label;
    } else {
      // Type B: Central position with rotation indicator (arrow showing facing direction)
      if (size === 2) {
        // For 2-tile ploppables, calculate center between the two cells
        // Get the second cell coordinates
        const primaryCell = { x: ploppable.x, y: ploppable.y };
        // Calculate second cell based on orientation
        // Orientation 0: (x, y+1), Orientation 1: (x-1, y), Orientation 2: (x, y-1), Orientation 3: (x+1, y)
        let secondX: number, secondY: number;
        switch (orientation) {
          case 0:
            secondX = primaryCell.x;
            secondY = primaryCell.y + 1;
            break;
          case 1:
            secondX = primaryCell.x - 1;
            secondY = primaryCell.y;
            break;
          case 2:
            secondX = primaryCell.x;
            secondY = primaryCell.y - 1;
            break;
          case 3:
            secondX = primaryCell.x + 1;
            secondY = primaryCell.y;
            break;
          default:
            secondX = primaryCell.x;
            secondY = primaryCell.y;
        }
        
        // Calculate center between the two cells
        const center1X = (primaryCell.x - primaryCell.y) * (TILE_WIDTH / 2) + gridOffsetX;
        const center1Y = (primaryCell.x + primaryCell.y) * (TILE_HEIGHT / 2) + gridOffsetY;
        const center2X = (secondX - secondY) * (TILE_WIDTH / 2) + gridOffsetX;
        const center2Y = (secondX + secondY) * (TILE_HEIGHT / 2) + gridOffsetY;
        const centerX = (center1X + center2X) / 2;
        const centerY = (center1Y + center2Y) / 2;
        
        // Create emoji label at center between the two cells
        const label = scene.add.text(centerX, centerY, emoji, {
          fontSize: '24px',
        });
        label.setOrigin(0.5, 0.5);
        label.setDepth(3);
        
        // Draw orientation arrow pointing in the facing direction (from center)
        this.drawOrientationArrow(
          graphics,
          centerX,
          centerY,
          orientation,
          20, // arrow length
          0x00ff00, // green color
          1.0 // full opacity
        );
        
        return label;
      } else {
        // Single-tile Type B: Central position with rotation indicator
        const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
        const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
        
        // Create main emoji label at center
        const label = scene.add.text(centerX, centerY, emoji, {
          fontSize: '24px',
        });
        label.setOrigin(0.5, 0.5);
        label.setDepth(3);
        
        // Draw orientation arrow pointing in the facing direction
        this.drawOrientationArrow(
          graphics,
          centerX,
          centerY,
          orientation,
          20, // arrow length
          0x00ff00, // green color
          1.0 // full opacity
        );
        
        return label;
      }
    }
  }
}

