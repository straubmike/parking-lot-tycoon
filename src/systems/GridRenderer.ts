import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GridManager } from '@/core/GridManager';
import { getIsometricTilePoints } from '@/utils/isometric';
import { isoToScreen } from '@/utils/isometric';

/**
 * GridRenderer - Handles rendering of the isometric grid
 * 
 * Handles:
 * - Base grid cells (filled diamonds)
 * - Border segments (curbs, fences, lane lines)
 * - Rails (dotted lines for paths)
 * - Parking spot borders
 * - Permanent labels
 */
export class GridRenderer {
  /**
   * Get border segment coordinates with offset
   */
  private static getBorderSegmentCoords(
    cellX: number,
    cellY: number,
    edge: number,
    gridOffsetX: number,
    gridOffsetY: number
  ): { startX: number; startY: number; endX: number; endY: number } {
    const points = getIsometricTilePoints(cellX, cellY);
    const offsetPoints = points.map(p => ({
      x: p.x + gridOffsetX,
      y: p.y + gridOffsetY
    }));
    
    const startIdx = edge;
    const endIdx = (edge + 1) % 4;
    
    return {
      startX: offsetPoints[startIdx].x,
      startY: offsetPoints[startIdx].y,
      endX: offsetPoints[endIdx].x,
      endY: offsetPoints[endIdx].y
    };
  }

  /**
   * Draw a single cell
   */
  static drawCell(
    gridX: number,
    gridY: number,
    cellData: any,
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
    
    // Calculate diamond points
    const topX = screenX;
    const topY = screenY - TILE_HEIGHT / 2;
    const rightX = screenX + TILE_WIDTH / 2;
    const rightY = screenY;
    const bottomX = screenX;
    const bottomY = screenY + TILE_HEIGHT / 2;
    const leftX = screenX - TILE_WIDTH / 2;
    const leftY = screenY;
    
    // Get color from cell data or use default checkerboard
    let color: number;
    if (cellData?.color !== undefined) {
      color = cellData.color;
    } else {
      // Default checkerboard pattern
      color = (gridX + gridY) % 2 === 0 ? 0x4a4a4a : 0x3a3a3a;
    }
    
    // Draw filled diamond using two triangles
    graphics.fillStyle(color, 1);
    graphics.fillTriangle(topX, topY, rightX, rightY, bottomX, bottomY);
    graphics.fillTriangle(topX, topY, bottomX, bottomY, leftX, leftY);
    
    // Draw border
    graphics.lineStyle(1, 0x555555, 1);
    graphics.lineBetween(topX, topY, rightX, rightY);
    graphics.lineBetween(rightX, rightY, bottomX, bottomY);
    graphics.lineBetween(bottomX, bottomY, leftX, leftY);
    graphics.lineBetween(leftX, leftY, topX, topY);
  }

  /**
   * Draw parking spot lines
   */
  static drawParkingSpotLines(
    gridX: number,
    gridY: number,
    cellData: any,
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    // Draw parking spot lines for both Parking Spot and Parking Meter (meters are placed on spots)
    if (cellData?.ploppable?.type !== 'Parking Spot' && cellData?.ploppable?.type !== 'Parking Meter') return;
    
    // For Parking Meters, use the stored parkingSpotOrientation (parking spot edge orientation)
    // For Parking Spots, use orientation directly (it's already a parking spot edge orientation)
    const orientation = cellData.ploppable.type === 'Parking Meter' 
      ? (cellData.ploppable.parkingSpotOrientation ?? cellData.ploppable.orientation ?? 0)
      : (cellData.ploppable.orientation || 0);
    
    // Get diamond points
    const points = getIsometricTilePoints(gridX, gridY);
    const offsetPoints = points.map(p => ({
      x: p.x + gridOffsetX,
      y: p.y + gridOffsetY
    }));
    
    // Orientation represents which edge is missing (undrawn):
    // 0 = missing left (edge 3) - draws edges 0,1,2
    // 1 = missing bottom (edge 2) - draws edges 0,1,3
    // 2 = missing top (edge 0) - draws edges 1,2,3
    // 3 = missing right (edge 1) - draws edges 0,2,3
    const edgesToDraw = [
      [0, 1, 2], // orientation 0: missing left (3) - draw top, right, bottom
      [0, 1, 3], // orientation 1: missing bottom (2) - draw top, right, left
      [1, 2, 3], // orientation 2: missing top (0) - draw right, bottom, left
      [0, 2, 3]  // orientation 3: missing right (1) - draw top, bottom, left
    ];
    
    const edges = edgesToDraw[orientation];
    
    // Draw lines
    graphics.lineStyle(2, 0xffffff, 1);
    edges.forEach(edgeIdx => {
      const startIdx = edgeIdx;
      const endIdx = (edgeIdx + 1) % 4;
      graphics.lineBetween(
        offsetPoints[startIdx].x,
        offsetPoints[startIdx].y,
        offsetPoints[endIdx].x,
        offsetPoints[endIdx].y
      );
    });
  }

  /**
   * Draw border segments (curbs, fences, lane lines)
   */
  static drawLines(
    gridManager: GridManager,
    graphics: Phaser.GameObjects.Graphics,
    gridWidth: number,
    gridHeight: number,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    graphics.clear();
    
    // Track which segments we've drawn by their actual screen coordinates to avoid duplicates
    const drawnSegments = new Set<string>();
    
    // Iterate through all border segments and draw them
    const borderSegments = gridManager.getAllBorderSegments();
    borderSegments.forEach((color, segmentKey) => {
      const [cellXStr, cellYStr, edgeStr] = segmentKey.split(',');
      const cellX = parseInt(cellXStr, 10);
      const cellY = parseInt(cellYStr, 10);
      const edge = parseInt(edgeStr, 10);
      
      // Get the screen coordinates for this border segment
      const coords = this.getBorderSegmentCoords(cellX, cellY, edge, gridOffsetX, gridOffsetY);
      
      // Create a unique key based on the actual line coordinates (rounded to avoid floating point issues)
      // This handles deduplication when the same edge is stored from adjacent cells
      const coordKey = `${Math.round(coords.startX)},${Math.round(coords.startY)}-${Math.round(coords.endX)},${Math.round(coords.endY)}`;
      const reverseCoordKey = `${Math.round(coords.endX)},${Math.round(coords.endY)}-${Math.round(coords.startX)},${Math.round(coords.startY)}`;
      
      // Skip if we've already drawn this segment (check both directions)
      if (drawnSegments.has(coordKey) || drawnSegments.has(reverseCoordKey)) {
        return;
      }
      
      // Mark as drawn
      drawnSegments.add(coordKey);
      
      // Draw the line segment
      graphics.lineStyle(3, color, 1);
      graphics.lineBetween(
        coords.startX,
        coords.startY,
        coords.endX,
        coords.endY
      );
    });
  }

  /**
   * Draw rails (dotted lines through cell centers)
   */
  static drawRails(
    graphics: Phaser.GameObjects.Graphics,
    gridWidth: number,
    gridHeight: number,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    graphics.clear();
    
    // Draw dotted lines through midpoints of each row and column
    // Rows: cells with same grid Y (diagonal lines in screen space, top-left to bottom-right)
    // Columns: cells with same grid X (diagonal lines in screen space, top-right to bottom-left)
    
    const dotLength = 4;
    const gapLength = 4;
    const lineColor = 0x00ff00; // Green color for rails
    const lineAlpha = 0.5;
    
    // Draw row rails (diagonal lines through cell centers with same grid Y)
    for (let y = 0; y < gridHeight; y++) {
      // Get the first and last cell centers in this row
      const firstCellCenter = isoToScreen(0, y);
      const lastCellCenter = isoToScreen(gridWidth - 1, y);
      
      const startX = firstCellCenter.x + gridOffsetX;
      const startY = firstCellCenter.y + gridOffsetY;
      const endX = lastCellCenter.x + gridOffsetX;
      const endY = lastCellCenter.y + gridOffsetY;
      
      // Calculate line length and direction
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / length;
      const unitY = dy / length;
      
      // Draw dotted line
      graphics.lineStyle(2, lineColor, lineAlpha);
      let currentDistance = 0;
      while (currentDistance < length) {
        const segmentStartX = startX + currentDistance * unitX;
        const segmentStartY = startY + currentDistance * unitY;
        const segmentEndDistance = Math.min(currentDistance + dotLength, length);
        const segmentEndX = startX + segmentEndDistance * unitX;
        const segmentEndY = startY + segmentEndDistance * unitY;
        
        graphics.lineBetween(segmentStartX, segmentStartY, segmentEndX, segmentEndY);
        currentDistance = segmentEndDistance + gapLength;
      }
    }
    
    // Draw column rails (diagonal lines through cell centers with same grid X)
    for (let x = 0; x < gridWidth; x++) {
      // Get the first and last cell centers in this column
      const firstCellCenter = isoToScreen(x, 0);
      const lastCellCenter = isoToScreen(x, gridHeight - 1);
      
      const startX = firstCellCenter.x + gridOffsetX;
      const startY = firstCellCenter.y + gridOffsetY;
      const endX = lastCellCenter.x + gridOffsetX;
      const endY = lastCellCenter.y + gridOffsetY;
      
      // Calculate line length and direction
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / length;
      const unitY = dy / length;
      
      // Draw dotted line
      graphics.lineStyle(2, lineColor, lineAlpha);
      let currentDistance = 0;
      while (currentDistance < length) {
        const segmentStartX = startX + currentDistance * unitX;
        const segmentStartY = startY + currentDistance * unitY;
        const segmentEndDistance = Math.min(currentDistance + dotLength, length);
        const segmentEndX = startX + segmentEndDistance * unitX;
        const segmentEndY = startY + segmentEndDistance * unitY;
        
        graphics.lineBetween(segmentStartX, segmentStartY, segmentEndX, segmentEndY);
        currentDistance = segmentEndDistance + gapLength;
      }
    }
  }

  /**
   * Draw permanent label and return it for management by the scene
   */
  static drawPermanentLabel(
    gridX: number,
    gridY: number,
    cellData: any,
    scene: Phaser.Scene,
    gridOffsetX: number,
    gridOffsetY: number
  ): Phaser.GameObjects.Text | null {
    if (!cellData?.isPermanent) return null;
    
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
    
    // Create "P" label
    const label = scene.add.text(screenX, screenY, 'P', {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    
    // Center the text
    label.setOrigin(0.5, 0.5);
    label.setDepth(3); // Draw on top of grid
    
    return label;
  }

  /**
   * Draw the entire grid (cells only, not labels/spawners/ploppables)
   */
  static drawGrid(
    gridManager: GridManager,
    graphics: Phaser.GameObjects.Graphics,
    gridWidth: number,
    gridHeight: number,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    graphics.clear();
    
    // Draw all cells
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        const cellData = gridManager.getCellData(x, y);
        this.drawCell(x, y, cellData, graphics, gridOffsetX, gridOffsetY);
      }
    }
  }
}

