import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GridManager } from '@/core/GridManager';
import { Ploppable, CellData } from '@/types';
import {
  PLOPPABLE_SPRITES,
  PLOPPABLE_SPRITE_CONFIG,
  ISO_ENTITY_DEPTH_BASE,
  ISO_ENTITY_DEPTH_Y_FACTOR,
} from '@/renderers/EntityRenderer';
import { PassabilitySystem } from './PassabilitySystem';
import { AppealSystem } from './AppealSystem';
import { SafetySystem } from './SafetySystem';

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
    const result = {
      x: centerX + dirX * scale,
      y: centerY + dirY * scale
    };
    
    return result;
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
    if (ploppableType === 'Parking Booth') {
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
    
    // Parking Spot can only be placed on dirt, gravel, asphalt, or tiles with no surface data
    if (ploppableType === 'Parking Spot') {
      const surfaceType = cellData?.surfaceType;
      if (surfaceType !== undefined && surfaceType !== 'dirt' && surfaceType !== 'gravel' && surfaceType !== 'asphalt') {
        return false;
      }
    }

    // Crosswalk can only be placed on asphalt tiles
    if (ploppableType === 'Crosswalk') {
      if (cellData?.surfaceType !== 'asphalt') {
        return false; // Crosswalk requires asphalt surface
      }
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
        // For Parking Booth, create a copy with COLLECTION subType for the second cell
        if (ploppable.type === 'Parking Booth') {
          const collectionPloppable: Ploppable = {
            ...ploppable,
            subType: 'COLLECTION',
            passable: true // Collection tile is passable
          };
          gridManager.setCellData(secondCell.x, secondCell.y, { ploppable: collectionPloppable });
        } else {
          // Store the same ploppable reference in the second cell (for other 2-tile ploppables)
          gridManager.setCellData(secondCell.x, secondCell.y, { ploppable });
        }
      }
    }
    
    // Apply AoE effects from appeal and safety systems
    AppealSystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, false);
    SafetySystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, false);
    
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
        // For Parking Booth, also check subType: COLLECTION means this is the second cell
        let primaryX = gridX;
        let primaryY = gridY;
        let isSecondCell = false;
        
        if (ploppable.type === 'Parking Booth' && ploppable.subType === 'COLLECTION') {
          isSecondCell = true;
          primaryX = ploppable.x;
          primaryY = ploppable.y;
        } else if (gridX !== ploppable.x || gridY !== ploppable.y) {
          isSecondCell = true;
          primaryX = ploppable.x;
          primaryY = ploppable.y;
        }
        
        // If this is the second cell, remove from this cell first, then remove from primary
        if (isSecondCell) {
          gridManager.setCellData(gridX, gridY, { ploppable: undefined as any });
          // Then remove from primary cell (which will also remove from its second cell)
          return this.removePloppable(primaryX, primaryY, gridManager, width, height);
        }
        
        // This is the primary cell, remove from second cell
        gridManager.setCellData(secondCell.x, secondCell.y, { ploppable: undefined as any });
      }
    }
    
    // Remove AoE effects from appeal and safety systems before removing the ploppable
    AppealSystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, true);
    SafetySystem.getInstance().applyPloppableAoE(ploppable, gridManager, width, height, true);
    
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
  ): Phaser.GameObjects.GameObject | null {
    if (!cellData?.ploppable) return null;
    
    const ploppable = cellData.ploppable;
    
    if (ploppable.type === 'Parking Spot') {
      return null;
    }

    // Crosswalk is drawn as stripes in GridRenderer.drawCell, not as a sprite/emoji
    if (ploppable.type === 'Crosswalk') {
      return null;
    }
    
    // For 2-tile ploppables, handle rendering based on type
    const size = this.getPloppableSize(ploppable.type);
    if (size === 2) {
      // Special handling for Parking Booth: render booth on primary, target on collection
      if (ploppable.type === 'Parking Booth') {
        if (ploppable.subType === 'COLLECTION') {
          const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
          const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;

          // Place barrier on the shared edge between collection and booth cells.
          // From getSecondCellForTwoTile, collection cell positions relative to booth:
          //   ori 0: collection=(bx, by+1) → screen: booth is upper-right → shared edge = collection's top-right
          //   ori 1: collection=(bx-1, by) → screen: booth is lower-right → shared edge = collection's bottom-right
          //   ori 2: collection=(bx, by-1) → screen: booth is lower-left  → shared edge = collection's bottom-left
          //   ori 3: collection=(bx+1, by) → screen: booth is upper-left  → shared edge = collection's top-left
          // Left-side edges use source graphic; right-side edges use horizontal flip.
          const ori = ploppable.orientation ?? 0;
          let edgeOffX = 0;
          let edgeOffY = 0;
          let flipX = false;

          switch (ori) {
            case 0: // shared edge = top-right
              edgeOffX = TILE_WIDTH / 4;
              edgeOffY = -TILE_HEIGHT / 4;
              flipX = false;
              break;
            case 1: // shared edge = bottom-right
              edgeOffX = TILE_WIDTH / 4;
              edgeOffY = TILE_HEIGHT / 4;
              flipX = true;
              break;
            case 2: // shared edge = bottom-left
              edgeOffX = -TILE_WIDTH / 4;
              edgeOffY = TILE_HEIGHT / 4;
              flipX = false;
              break;
            case 3: // shared edge = top-left
              edgeOffX = -TILE_WIDTH / 4;
              edgeOffY = -TILE_HEIGHT / 4;
              flipX = true;
              break;
          }

          const BARRIER_OFFSET_Y = 3;
          // Booth sprite uses the booth tile bottom (large screen Y); Y-sort can put it over the barrier on
          // orientations 0 and 3 (shared edge top-right / top-left). Bias barrier forward so both halves read as one ploppable.
          const BARRIER_OVER_BOOTH_DEPTH = 0.06;
          const barrierDepthBias = ori === 0 || ori === 3 ? BARRIER_OVER_BOOTH_DEPTH : 0;
          const barrierKey = PLOPPABLE_SPRITES['Booth Barrier'];
          if (barrierKey) {
            const config = PLOPPABLE_SPRITE_CONFIG['Booth Barrier'];
            const sprite = scene.add.sprite(centerX + edgeOffX, centerY + edgeOffY + BARRIER_OFFSET_Y, barrierKey);
            sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 1.0);
            sprite.setDepth(3 + sprite.y * 0.0001 + barrierDepthBias);
            sprite.setFlipX(flipX);
            const baseScale = TILE_WIDTH * 0.5;
            const scaleMult = config?.scaleMultiplier ?? 1;
            if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
            return sprite;
          }

          // Fallback emoji if barrier sprite is missing
          const targetLabel = scene.add.text(centerX, centerY, '🎯', {
            fontSize: '24px',
          });
          targetLabel.setOrigin(0.5, 0.5);
          targetLabel.setDepth(3 + targetLabel.y * 0.0001 + barrierDepthBias);
          return targetLabel;
        } else {
          // BOOTH subType - render booth emoji (handled in Type B section below)
          // Continue to Type B rendering
        }
      }
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
    else if (ploppable.type === 'Portable Toilet') emoji = '🚽';
    else if (ploppable.type === 'Bench') emoji = '🪑';
    else if (ploppable.type === 'Speed Bump') emoji = '⛰️';
    else if (ploppable.type === 'Crosswalk') emoji = '🚸';
    else if (ploppable.type === 'Pedestrian Spawner') emoji = '🚶';
    else if (ploppable.type === 'Parking Meter') emoji = '⏰';
    else if (ploppable.type === 'Parking Booth') emoji = '🏪';
    
    // Handle non-oriented ploppables - render at center, no arrow
    if (ploppable.type === 'Tree' || ploppable.type === 'Shrub' || ploppable.type === 'Flower Patch' || ploppable.type === 'Speed Bump' || ploppable.type === 'Crosswalk' || ploppable.type === 'Pedestrian Spawner') {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
      const SHRUB_ORIGIN_OFFSET_Y = -5; // draw shrub a little lower
      const posY = ploppable.type === 'Shrub' ? centerY + SHRUB_ORIGIN_OFFSET_Y : centerY;
      
      const spriteKey = PLOPPABLE_SPRITES[ploppable.type];
      if (spriteKey) {
        const config = PLOPPABLE_SPRITE_CONFIG[ploppable.type];
        const sprite = scene.add.sprite(centerX, posY, spriteKey);
        sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 0.5);
        const depth = (ploppable.type === 'Speed Bump' || ploppable.type === 'Crosswalk')
          ? 1.5
          : 3 + sprite.y * 0.0001;
        sprite.setDepth(depth);
        let flip = ploppable.spriteFlip ?? false;
        if (ploppable.type === 'Speed Bump') {
          flip = orientation === 3;
          const SPEED_BUMP_ROTATION_DEG = 2.5;
          const rad = (SPEED_BUMP_ROTATION_DEG * Math.PI) / 180;
          sprite.setRotation(flip ? -rad : rad);
        }
        sprite.setFlipX(flip);
        const baseScale = TILE_WIDTH * 0.7;
        const scaleMult = config?.scaleMultiplier ?? 1;
        if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
        return sprite;
      }

      const label = scene.add.text(centerX, posY, emoji, {
        fontSize: '24px',
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(3 + label.y * 0.0001);
      return label;
    }
    
    if (orientationType === 'A') {
      // Type A: Position along rail extremities, but inside the cell
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
      
      const position = this.getTypeAPosition(centerX, centerY, orientation);
      // Trash can: Y offset by orientation — top (0,1) draw lower (+Y); bottom (2,3) inverse so not too low (-Y)
      const TRASHCAN_ORIGIN_OFFSET_Y_TOP = 5;
      const TRASHCAN_ORIGIN_OFFSET_Y_BOTTOM = 2; // inverse for bottom orientations (2, 3)
      const TRASHCAN_ORIGIN_OFFSET_X = -5; // left (0,3) = -X, right (1,2) = +X; tweak as needed
      const isBottom = orientation === 2 || orientation === 3;
      const trashY = position.y + (isBottom ? TRASHCAN_ORIGIN_OFFSET_Y_BOTTOM : TRASHCAN_ORIGIN_OFFSET_Y_TOP);
      const trashX = position.x + (orientation === 1 || orientation === 2 ? TRASHCAN_ORIGIN_OFFSET_X : -TRASHCAN_ORIGIN_OFFSET_X);
      // Bench: same control — Y top/bottom, X left/right by orientation
      const BENCH_ORIGIN_OFFSET_Y_TOP = 0;
      const BENCH_ORIGIN_OFFSET_Y_BOTTOM = -5;
      const BENCH_ORIGIN_OFFSET_X = -5;
      const benchY = position.y + (isBottom ? BENCH_ORIGIN_OFFSET_Y_BOTTOM : BENCH_ORIGIN_OFFSET_Y_TOP);
      const benchX = position.x + (orientation === 1 || orientation === 2 ? BENCH_ORIGIN_OFFSET_X : -BENCH_ORIGIN_OFFSET_X);
      const METER_OFFSET_X = orientation === 2 ? 3 : orientation === 3 ? -3 : 0;
      const meterX = position.x + METER_OFFSET_X;
      const posX = ploppable.type === 'Trash Can' ? trashX : ploppable.type === 'Bench' ? benchX : ploppable.type === 'Parking Meter' ? meterX : position.x;
      const posY = ploppable.type === 'Trash Can' ? trashY : ploppable.type === 'Bench' ? benchY : position.y;

      const spriteKey = PLOPPABLE_SPRITES[ploppable.type];
      if (spriteKey) {
        let flipX = false;
        if (ploppable.type === 'Bench') {
          flipX = orientation === 1 || orientation === 3; // east/west
        } else if (ploppable.type === 'Street Light') {
          flipX = orientation === 0 || orientation === 2; // north/south
        }
        const config = PLOPPABLE_SPRITE_CONFIG[ploppable.type];
        const sprite = scene.add.sprite(posX, posY, spriteKey);
        sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 1.0);
        const depth =
          ploppable.type === 'Parking Meter'
            ? ISO_ENTITY_DEPTH_BASE + sprite.y * ISO_ENTITY_DEPTH_Y_FACTOR
            : 3 + sprite.y * 0.0001;
        sprite.setDepth(depth);
        sprite.setFlipX(flipX);
        const baseScale = TILE_WIDTH * 0.5;
        const scaleMult = config?.scaleMultiplier ?? 1;
        if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);

        if (ploppable.type === 'Street Light' && ploppable.addOns?.includes('Security Camera')) {
          const camKey = PLOPPABLE_SPRITES['Security Camera'];
          if (camKey) {
            const container = scene.add.container(posX, posY);
            container.setDepth(3 + container.y * 0.0001);
            sprite.setPosition(0, 0);
            container.add(sprite);

            const camConfig = PLOPPABLE_SPRITE_CONFIG['Security Camera'];
            const lampHeight = sprite.displayHeight;
            const camY = -lampHeight * 0.5;
            const camBaseScale = TILE_WIDTH * 0.5;
            const camScaleMult = camConfig?.scaleMultiplier ?? 1;

            const camLeft = scene.add.sprite(-7, camY, camKey);
            camLeft.setOrigin(camConfig?.originX ?? 0.5, camConfig?.originY ?? 1.0);
            if (camLeft.width > 0) camLeft.setScale((camBaseScale / camLeft.width) * camScaleMult);
            camLeft.setFlipX(false);
            container.add(camLeft);

            const camRight = scene.add.sprite(7, camY, camKey);
            camRight.setOrigin(camConfig?.originX ?? 0.5, camConfig?.originY ?? 1.0);
            if (camRight.width > 0) camRight.setScale((camBaseScale / camRight.width) * camScaleMult);
            camRight.setFlipX(true);
            container.add(camRight);

            return container;
          }
        }

        return sprite;
      }
      
      const label = scene.add.text(position.x, position.y, emoji, {
        fontSize: '18px',
      });
      label.setOrigin(0.5, 1.0);
      label.setDepth(3 + label.y * 0.0001);
      return label;
    } else {
      // Type B: Central position with rotation indicator (arrow showing facing direction)
      if (size === 2) {
        // Special handling for Parking Booth: draw booth emoji on primary tile only (no arrow, no center-between)
        if (ploppable.type === 'Parking Booth') {
          if (ploppable.subType !== 'BOOTH') {
            return null;
          }
          
          const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
          const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;

          const boothSpriteKey = PLOPPABLE_SPRITES['Parking Booth'];
          if (boothSpriteKey && (orientation === 0 || orientation === 1 || orientation === 2 || orientation === 3)) {
            const config = PLOPPABLE_SPRITE_CONFIG['Parking Booth'];
            const flipX = orientation === 0 || orientation === 1;
            const BOOTH_OFFSET_Y = -3;
            const sprite = scene.add.sprite(centerX, centerY + TILE_HEIGHT / 2 + BOOTH_OFFSET_Y, boothSpriteKey);
            sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 1.0);
            sprite.setDepth(3 + sprite.y * 0.0001);
            sprite.setFlipX(flipX);
            const baseScale = TILE_WIDTH * 0.5;
            const scaleMult = config?.scaleMultiplier ?? 1;
            if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
            return sprite;
          }

          const boothLabel = scene.add.text(centerX, centerY, emoji, {
            fontSize: '24px',
          });
          boothLabel.setOrigin(0.5, 0.5);
          boothLabel.setDepth(3 + boothLabel.y * 0.0001);
          return boothLabel;
        }
        
      } else {
        // Single-tile Type B: Central position with rotation indicator
        const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
        const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
        
        // Vending Machine: use vending.png for south (2) no flip, west (3) flipped; north (0) and east (1) disabled (no art)
        // 10px left/right offset by facing so base aligns with cell (south: left, west: right)
        const VENDING_ORIGIN_OFFSET_X = 10;
        const VENDING_ORIGIN_OFFSET_Y = 5; // draw 5px lower so base aligns with cell
        const spriteKey = PLOPPABLE_SPRITES[ploppable.type];
        if (ploppable.type === 'Vending Machine' && spriteKey && (orientation === 2 || orientation === 3)) {
          const config = PLOPPABLE_SPRITE_CONFIG[ploppable.type];
          const flipX = orientation === 3; // west = flipped sprite; south = no flip
          const offsetX = orientation === 2 ? -VENDING_ORIGIN_OFFSET_X : VENDING_ORIGIN_OFFSET_X;
          const sprite = scene.add.sprite(centerX + offsetX, centerY + VENDING_ORIGIN_OFFSET_Y, spriteKey);
          sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 1.0);
          sprite.setDepth(3 + sprite.y * 0.0001);
          sprite.setFlipX(flipX);
          const baseScale = TILE_WIDTH * 0.5;
          const scaleMult = config?.scaleMultiplier ?? 1;
          if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
          return sprite;
        }

        // Dumpster: single cell, center; south (2) and west (3) have art. Offset 5px L/R by facing.
        const dumpsterKey = PLOPPABLE_SPRITES['Dumpster'];
        if (ploppable.type === 'Dumpster' && dumpsterKey && (orientation === 2 || orientation === 3)) {
          const config = PLOPPABLE_SPRITE_CONFIG['Dumpster'];
          const flipX = orientation === 2;
          const DUMPSTER_OFFSET_Y = 5; // lower on screen (positive Y)
          const DUMPSTER_OFFSET_X = 10; // facing bottom-left (ori 2) scoot left; facing bottom-right (ori 3) scoot right
          const offsetX = orientation === 2 ? -DUMPSTER_OFFSET_X : DUMPSTER_OFFSET_X;
          const sprite = scene.add.sprite(centerX + offsetX, centerY + DUMPSTER_OFFSET_Y, dumpsterKey);
          sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 1.0);
          sprite.setDepth(3 + sprite.y * 0.0001);
          sprite.setFlipX(flipX);
          const baseScale = TILE_WIDTH * 0.5;
          const scaleMult = config?.scaleMultiplier ?? 1;
          if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
          return sprite;
        }

        // Portable Toilet: lotty-potty.png for south (2) and west (3) only; origin middle-bottom; west (3) flipped
        const pottyKey = PLOPPABLE_SPRITES['Portable Toilet'];
        if (ploppable.type === 'Portable Toilet' && pottyKey && (orientation === 2 || orientation === 3)) {
          const config = PLOPPABLE_SPRITE_CONFIG['Portable Toilet'];
          const flipX = orientation === 3; // west = flipped
          const POTTY_OFFSET_Y = 5;
          const POTTY_OFFSET_X = 10;
          const offsetX = orientation === 2 ? -POTTY_OFFSET_X : POTTY_OFFSET_X;
          const sprite = scene.add.sprite(centerX + offsetX, centerY + POTTY_OFFSET_Y, pottyKey);
          sprite.setOrigin(config?.originX ?? 0.5, config?.originY ?? 1.0);
          sprite.setDepth(3 + sprite.y * 0.0001);
          sprite.setFlipX(flipX);
          const baseScale = TILE_WIDTH * 0.5;
          const scaleMult = config?.scaleMultiplier ?? 1;
          if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
          return sprite;
        }
        
        // Create main emoji label at center (fallback for types without sprite or disabled orientations)
        const label = scene.add.text(centerX, centerY, emoji, {
          fontSize: '24px',
        });
        label.setOrigin(0.5, 0.5);
        label.setDepth(3 + label.y * 0.0001);
        
        // Draw orientation arrow pointing in the facing direction
        // Skip arrow for Speed Bump and Crosswalk
        if (ploppable.type !== 'Speed Bump' && ploppable.type !== 'Crosswalk') {
          this.drawOrientationArrow(
            graphics,
            centerX,
            centerY,
            orientation,
            20, // arrow length
            0x00ff00, // green color
            1.0 // full opacity
          );
        }
        
        return label;
      }
    }
    return null;
  }
}

