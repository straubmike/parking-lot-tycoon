import Phaser from 'phaser';
import { screenToIso, getIsometricTilePoints } from '@/utils/isometric';

/**
 * GridInteractionHandler - Handles input conversion from screen to grid coordinates
 */
export class GridInteractionHandler {
  /**
   * Convert pointer position to grid cell coordinates
   */
  static getCellAtPointer(
    pointer: Phaser.Input.Pointer,
    camera: Phaser.Cameras.Scene2D.Camera,
    gridWidth: number,
    gridHeight: number,
    gridOffsetX: number,
    gridOffsetY: number
  ): { x: number; y: number } | null {
    // Get world coordinates (accounting for camera scroll and zoom)
    const worldX = camera.getWorldPoint(pointer.x, pointer.y).x;
    const worldY = camera.getWorldPoint(pointer.x, pointer.y).y;
    
    // Convert to coordinates relative to grid origin (accounting for grid offset)
    const relativeX = worldX - gridOffsetX;
    const relativeY = worldY - gridOffsetY;
    
    // Convert to isometric grid coordinates
    const isoCoords = screenToIso(relativeX, relativeY);
    
    // Round to nearest grid cell
    const gridX = Math.round(isoCoords.x);
    const gridY = Math.round(isoCoords.y);
    
    // Check if within grid bounds
    if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
      return { x: gridX, y: gridY };
    }
    return null;
  }

  /**
   * Get the nearest edge to the pointer position for a given cell
   * Returns edge index: 0=top, 1=right, 2=bottom, 3=left
   */
  static getNearestEdge(
    gridX: number,
    gridY: number,
    pointer: Phaser.Input.Pointer,
    camera: Phaser.Cameras.Scene2D.Camera,
    gridOffsetX: number,
    gridOffsetY: number
  ): number {
    // Get world coordinates relative to cell center
    const worldX = camera.getWorldPoint(pointer.x, pointer.y).x;
    const worldY = camera.getWorldPoint(pointer.x, pointer.y).y;
    
    // Get all edge points
    const points = getIsometricTilePoints(gridX, gridY);
    const offsetPoints = points.map(p => ({
      x: p.x + gridOffsetX,
      y: p.y + gridOffsetY
    }));
    
    // Calculate distances to each edge
    const edges = [
      { idx: 0, name: 'top', p1: offsetPoints[0], p2: offsetPoints[1] },      // 0->1
      { idx: 1, name: 'right', p1: offsetPoints[1], p2: offsetPoints[2] },   // 1->2
      { idx: 2, name: 'bottom', p1: offsetPoints[2], p2: offsetPoints[3] },  // 2->3
      { idx: 3, name: 'left', p1: offsetPoints[3], p2: offsetPoints[0] }     // 3->0
    ];
    
    let minDist = Infinity;
    let nearestEdge = 0;
    
    edges.forEach(edge => {
      // Calculate distance from point to line segment
      const dx = edge.p2.x - edge.p1.x;
      const dy = edge.p2.y - edge.p1.y;
      const lengthSq = dx * dx + dy * dy;
      
      if (lengthSq === 0) return;
      
      const t = Math.max(0, Math.min(1, ((worldX - edge.p1.x) * dx + (worldY - edge.p1.y) * dy) / lengthSq));
      const projX = edge.p1.x + t * dx;
      const projY = edge.p1.y + t * dy;
      
      const dist = Math.sqrt((worldX - projX) ** 2 + (worldY - projY) ** 2);
      
      if (dist < minDist) {
        minDist = dist;
        nearestEdge = edge.idx;
      }
    });
    
    return nearestEdge;
  }

  /**
   * Draw a basic cell highlight (yellow border)
   */
  static drawBasicHighlight(
    gridX: number,
    gridY: number,
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number,
    color: number = 0xffff00,
    alpha: number = 0.6,
    lineWidth: number = 1.5
  ): void {
    // Get diamond points for this grid cell
    const points = getIsometricTilePoints(gridX, gridY);
    
    // Offset points by grid offset
    const offsetPoints = points.map(p => ({
      x: p.x + gridOffsetX,
      y: p.y + gridOffsetY
    }));
    
    // Draw yellow border highlight
    graphics.lineStyle(lineWidth, color, alpha);
    graphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
    graphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
    graphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
    graphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
  }

  /**
   * Draw a basic edge highlight (blue line on specific edge)
   */
  static drawEdgeHighlight(
    gridX: number,
    gridY: number,
    edge: number,
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number,
    color: number = 0x0000ff,
    alpha: number = 0.6,
    lineWidth: number = 1.5
  ): void {
    // Get diamond points for this grid cell
    const points = getIsometricTilePoints(gridX, gridY);
    
    // Offset points by grid offset
    const offsetPoints = points.map(p => ({
      x: p.x + gridOffsetX,
      y: p.y + gridOffsetY
    }));
    
    // Draw blue line on the specific edge
    graphics.lineStyle(lineWidth, color, alpha);
    const startIdx = edge;
    const endIdx = (edge + 1) % 4;
    graphics.lineBetween(
      offsetPoints[startIdx].x,
      offsetPoints[startIdx].y,
      offsetPoints[endIdx].x,
      offsetPoints[endIdx].y
    );
  }
}

