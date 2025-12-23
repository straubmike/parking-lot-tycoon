import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GridManager } from '@/core/GridManager';
import { Ploppable, CellData } from '@/types';

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
   * Check if a ploppable can be placed at the given cell
   */
  static canPlacePloppable(
    gridX: number,
    gridY: number,
    gridManager: GridManager
  ): boolean {
    const cellData = gridManager.getCellData(gridX, gridY);
    // Cell is occupied if it has a ploppable, spawner, or despawner
    return !(cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner);
  }

  /**
   * Place a ploppable at the given cell
   * Returns true if placement was successful
   */
  static placePloppable(
    gridX: number,
    gridY: number,
    ploppable: Ploppable,
    gridManager: GridManager
  ): boolean {
    if (!this.canPlacePloppable(gridX, gridY, gridManager)) {
      return false;
    }
    
    gridManager.setCellData(gridX, gridY, { ploppable });
    return true;
  }

  /**
   * Remove a ploppable from the given cell
   * Returns the removed ploppable if one existed
   */
  static removePloppable(
    gridX: number,
    gridY: number,
    gridManager: GridManager
  ): Ploppable | null {
    const cellData = gridManager.getCellData(gridX, gridY);
    if (!cellData?.ploppable) {
      return null;
    }
    
    const ploppable = cellData.ploppable;
    const newCellData: CellData = { ...cellData };
    delete newCellData.ploppable;
    gridManager.setCellData(gridX, gridY, newCellData);
    
    return ploppable;
  }

  /**
   * Draw a ploppable and return the created label (if any) for management
   * Returns null for ploppables that don't create labels (parking spots, pedestrian spawners)
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
    
    // Convert grid coords to screen coords (isometric center)
    const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
    const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
    
    const orientation = ploppable.orientation || 0;
    const orientationType = ploppable.orientationType || 'B'; // Default to Type B
    
    // Get emoji based on ploppable type
    let emoji = '❓';
    if (ploppable.type === 'Trash Can') emoji = '🗑️';
    else if (ploppable.type === 'Vending Machine') emoji = '🥤';
    
    if (orientationType === 'A') {
      // Type A: Position along rail extremities, but inside the cell
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

