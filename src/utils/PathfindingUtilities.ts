import { GridManager } from '@/core/GridManager';
import { CellData } from '@/types';
import { getIsometricTilePoints, isoToScreen } from './isometric';

/**
 * PathfindingUtilities - Utility functions for pathfinding and edge blocking
 * 
 * Handles:
 * - Edge blocking checks for vehicles and pedestrians
 * - Parking spot edge blocking
 * - Rail intersection detection
 * - Neighbor cell resolution
 * - Line intersection math
 */
export class PathfindingUtilities {
  /**
   * Get border segment coordinates without offset (for calculations)
   */
  static getBorderSegmentCoords(
    cellX: number,
    cellY: number,
    edge: number
  ): { startX: number; startY: number; endX: number; endY: number } {
    const points = getIsometricTilePoints(cellX, cellY);
    
    const startIdx = edge;
    const endIdx = (edge + 1) % 4;
    
    return {
      startX: points[startIdx].x,
      startY: points[startIdx].y,
      endX: points[endIdx].x,
      endY: points[endIdx].y
    };
  }

  /**
   * Check if an edge is impassable (curb, fence, or parking spot border)
   */
  static isEdgeImpassable(
    cellX: number,
    cellY: number,
    edge: number,
    gridManager: GridManager
  ): boolean {
    // Check if this edge is a curb or fence (from border segments)
    const existingKey = gridManager.findExistingBorderSegmentKey(cellX, cellY, edge);
    if (existingKey) {
      const color = gridManager.getBorderSegment(existingKey);
      // Curb: #808080 (gray), Fence: #ff0000 (red)
      if (color === 0x808080 || color === 0xff0000) {
        return true;
      }
    }
    
    // Check if this edge is part of a parking spot border
    const cellData = gridManager.getCellData(cellX, cellY);
    if (cellData?.ploppable?.type === 'Parking Spot') {
      const orientation = cellData.ploppable.orientation || 0;
      // Orientation represents which edge is missing (undrawn):
      // 0 = missing left (edge 3) - draws edges 0,1,2
      // 1 = missing bottom (edge 2) - draws edges 0,1,3
      // 2 = missing top (edge 0) - draws edges 1,2,3
      // 3 = missing right (edge 1) - draws edges 0,2,3
      const edgesToDraw = [
        [0, 1, 2], // orientation 0: missing left (3)
        [0, 1, 3], // orientation 1: missing bottom (2)
        [1, 2, 3], // orientation 2: missing top (0)
        [0, 2, 3]  // orientation 3: missing right (1)
      ];
      const drawnEdges = edgesToDraw[orientation];
      if (drawnEdges.includes(edge)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a cell has a parking spot with the given edge blocked (drawn)
   */
  static isParkingSpotEdgeBlocked(
    cellX: number,
    cellY: number,
    edge: number,
    gridManager: GridManager
  ): boolean {
    const cellData = gridManager.getCellData(cellX, cellY);
    if (cellData?.ploppable?.type === 'Parking Spot') {
      const orientation = cellData.ploppable.orientation || 0;
      // Edges that are drawn (blocked) for each orientation
      // Orientation represents which edge is MISSING (passable)
      const drawnEdges = [
        [0, 1, 2], // orientation 0: missing left (3) - draws top, right, bottom
        [0, 1, 3], // orientation 1: missing bottom (2) - draws top, right, left
        [1, 2, 3], // orientation 2: missing top (0) - draws right, bottom, left
        [0, 2, 3]  // orientation 3: missing right (1) - draws top, bottom, left
      ];
      const blocked = drawnEdges[orientation];
      return blocked.includes(edge);
    }
    return false;
  }

  /**
   * Check if an edge blocks a specific entity type
   * - Vehicles: Blocked by curbs, fences, lane lines (directional), and parking spot borders
   * - Pedestrians: Blocked only by fences
   * 
   * @param isEntryEdge - If true, this is an entry edge (check parking spots, lane lines, curbs). If false, this is a corridor edge (only check fences).
   * @param movementDirection - The direction of movement (for lane line "drive on the right" logic)
   */
  static isEdgeBlockedForEntity(
    cellX: number,
    cellY: number,
    edge: number,
    entityType: 'vehicle' | 'pedestrian',
    gridManager: GridManager,
    isEntryEdge: boolean = true,
    movementDirection: 'north' | 'south' | 'east' | 'west' = 'north'
  ): boolean {
    // Check border segments (curbs, fences, and lane lines)
    // Key insight: 
    // - Fences block everything everywhere (use shared edge lookup)
    // - Curbs/lane lines only block on ENTRY edges (isEntryEdge=true), not corridor walls
    // - For N/S corridor edges, use current cell key only to avoid false positives from neighbors
    const isNorthSouthMovement = movementDirection === 'north' || movementDirection === 'south';
    const isEastWestMovement = movementDirection === 'east' || movementDirection === 'west';
    const isCorridorEdge = !isEntryEdge;
    
    // For fences: always use shared edge lookup (fences block everything)
    const existingKey = gridManager.findExistingBorderSegmentKey(cellX, cellY, edge);
    
    // For curbs/lane lines on N/S corridor edges: use current cell key to avoid false positives
    // For entry edges and E/W movement: use shared lookup
    const currentCellKey = gridManager.getBorderSegmentKey(cellX, cellY, edge);
    const curbLaneKey = (isNorthSouthMovement && isCorridorEdge) ? currentCellKey : existingKey;
    const curbLaneColor = curbLaneKey ? gridManager.getBorderSegment(curbLaneKey) : undefined;
    
    if (existingKey) {
      const color = gridManager.getBorderSegment(existingKey);
      
      // Fence blocks everything (including corridor edges) - use shared edge lookup
      if (color === 0xff0000) {
        return true;
      }
    }
    
    // Curb blocks vehicles when exiting through the edge the curb is on
    // Edge 0 (top) blocks North, Edge 1 (right) blocks East, 
    // Edge 2 (bottom) blocks South, Edge 3 (left) blocks West
    if (curbLaneColor === 0x808080 && entityType === 'vehicle') {
      const edgeBlocksDirection = 
        (edge === 0 && movementDirection === 'north') ||
        (edge === 1 && movementDirection === 'east') ||
        (edge === 2 && movementDirection === 'south') ||
        (edge === 3 && movementDirection === 'west');
      
      if (edgeBlocksDirection) {
        return true;
      }
    }
    
    // Lane line (yellow) - block parallel movement on ENTRY edges only
    // Lane lines enforce "drive on the right" by blocking parallel movement
    // 
    // CRITICAL: The edge orientation is OPPOSITE to the lane line's actual direction:
    // - A lane line on a VERTICAL edge (top/bottom, edges 0/2) actually spans HORIZONTALLY (E/W)
    //   So it should block E/W movement (parallel) and allow N/S movement (perpendicular)
    // - A lane line on a HORIZONTAL edge (left/right, edges 1/3) actually spans VERTICALLY (N/S)
    //   So it should block N/S movement (parallel) and allow E/W movement (perpendicular)
    if (curbLaneColor === 0xffff00 && entityType === 'vehicle' && isEntryEdge) {
      const isVerticalEdge = edge === 0 || edge === 2;
      const isHorizontalEdge = edge === 1 || edge === 3;
      
      // Block parallel movement (movement that follows the lane line's actual direction)
      // Allow perpendicular movement (crossing the lane line)
      // 
      // If lane line is on vertical edge (top/bottom), it spans E/W, so block E/W movement (parallel)
      if (isVerticalEdge && isEastWestMovement) {
        return true; // Lane line on top/bottom edge spans E/W, blocks E/W movement (parallel)
      }
      // If lane line is on horizontal edge (left/right), it spans N/S, so block N/S movement (parallel)
      if (isHorizontalEdge && isNorthSouthMovement) {
        return true; // Lane line on left/right edge spans N/S, blocks N/S movement (parallel)
      }
    }
    
    // Check parking spot borders (only block vehicles, and only if isEntryEdge is true)
    // Parking spot borders only block direct entry into the spot, not corridor movement
    // NOTE: We only check the current cell, not neighbors, because parking spot borders
    // should only block entry into the parking spot cell itself, not movement past adjacent cells
    if (entityType === 'vehicle' && isEntryEdge) {
      if (this.isParkingSpotEdgeBlocked(cellX, cellY, edge, gridManager)) {
        return true;
      }
      
      // REMOVED: Neighbor cell check for parking spots
      // This was incorrectly blocking vehicles from passing by parking spots in adjacent cells.
      // Parking spot borders should only block entry into the parking spot cell itself.
    }
    
    return false;
  }

  /**
   * Check if a move crosses a lane line perpendicularly (for cost penalty)
   * Returns the cost penalty for crossing a lane line (higher = pathfinding will avoid it)
   * @param fromX - Starting cell X
   * @param fromY - Starting cell Y
   * @param toX - Target cell X
   * @param toY - Target cell Y
   * @param direction - Direction of movement
   * @param entityType - Type of entity
   * @param gridManager - Grid manager instance
   * @returns Cost penalty (0 if no lane line crossed, >0 if lane line crossed)
   */
  static getLaneLineCrossingCost(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    direction: 'north' | 'south' | 'east' | 'west',
    entityType: 'vehicle' | 'pedestrian',
    gridManager: GridManager
  ): number {
    // Only vehicles are affected by lane lines
    if (entityType !== 'vehicle') {
      return 0;
    }

    // Get edges that would be crossed in this move
    const isNorthSouthMovement = direction === 'north' || direction === 'south';
    const isEastWestMovement = direction === 'east' || direction === 'west';
    
    // For entry edges, check if we're crossing a lane line perpendicularly
    // We need to check the entry edge of the target cell
    let entryEdge: number;
    if (direction === 'north') {
      entryEdge = 2; // Bottom edge of target cell
    } else if (direction === 'south') {
      entryEdge = 0; // Top edge of target cell
    } else if (direction === 'east') {
      entryEdge = 3; // Left edge of target cell
    } else { // west
      entryEdge = 1; // Right edge of target cell
    }

    // Check if there's a lane line on the entry edge
    const existingKey = gridManager.findExistingBorderSegmentKey(toX, toY, entryEdge);
    if (existingKey) {
      const color = gridManager.getBorderSegment(existingKey);
      if (color === 0xffff00) {
        // Lane line detected - check if this is a perpendicular crossing
        const isVerticalEdge = entryEdge === 0 || entryEdge === 2;
        const isHorizontalEdge = entryEdge === 1 || entryEdge === 3;
        
        // Perpendicular crossing: vertical edge with N/S movement OR horizontal edge with E/W movement
        const isPerpendicularCrossing = 
          (isVerticalEdge && isNorthSouthMovement) ||
          (isHorizontalEdge && isEastWestMovement);
        
        if (isPerpendicularCrossing) {
          return 10; // High penalty to prefer paths that don't cross lane lines
        }
      }
    }

    return 0;
  }

  /**
   * Get the neighbor cell that shares a given edge
   * Returns the neighbor cell coordinates and the corresponding edge number
   */
  static getNeighborCellForEdge(
    cellX: number,
    cellY: number,
    edge: number
  ): { cellX: number; cellY: number; edge: number } | null {
    // Edge sharing relationships:
    // - Edge 0 (top) of (x,y) = Edge 2 (bottom) of (x-1, y+1)
    // - Edge 1 (right) of (x,y) = Edge 3 (left) of (x+1, y)
    // - Edge 2 (bottom) of (x,y) = Edge 0 (top) of (x+1, y-1)
    // - Edge 3 (left) of (x,y) = Edge 1 (right) of (x-1, y)
    
    switch (edge) {
      case 0: // top -> neighbor's bottom
        return { cellX: cellX - 1, cellY: cellY + 1, edge: 2 };
      case 1: // right -> neighbor's left
        return { cellX: cellX + 1, cellY: cellY, edge: 3 };
      case 2: // bottom -> neighbor's top
        return { cellX: cellX + 1, cellY: cellY - 1, edge: 0 };
      case 3: // left -> neighbor's right
        return { cellX: cellX - 1, cellY: cellY, edge: 1 };
      default:
        return null;
    }
  }

  /**
   * Check if a rail segment (between two cell centers) crosses an impassable line
   */
  static doesRailSegmentCrossImpassable(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    gridSize: number,
    gridManager: GridManager
  ): boolean {
    // Convert cell centers to screen coordinates (without offset, for calculation)
    const startScreen = isoToScreen(startX, startY);
    const endScreen = isoToScreen(endX, endY);
    
    // Check all cells that might have edges crossing this rail segment
    // We need to check cells along the path
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    
    // Check all cells in the bounding box
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
        
        // Check all 4 edges of this cell
        for (let edge = 0; edge < 4; edge++) {
          if (this.isEdgeImpassable(x, y, edge, gridManager)) {
            // Get edge coordinates (without offset for comparison)
            const edgeCoords = this.getBorderSegmentCoords(x, y, edge);
            
            // Check if rail segment intersects with this edge
            if (this.linesIntersect(
              startScreen.x, startScreen.y,
              endScreen.x, endScreen.y,
              edgeCoords.startX, edgeCoords.startY,
              edgeCoords.endX, edgeCoords.endY
            )) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Check if two line segments intersect
   */
  static linesIntersect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number
  ): boolean {
    // Using cross product to check intersection
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    // Check if intersection point is on both segments
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
}

