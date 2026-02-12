import { GridManager } from '@/core/GridManager';
import { CellData } from '@/types';
import { getIsometricTilePoints, isoToScreen } from './isometric';
import { PassabilitySystem } from '@/systems/PassabilitySystem';

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
    // Handle both Parking Spot and Parking Meter (meters preserve the original spot's orientation)
    const cellData = gridManager.getCellData(cellX, cellY);
    if (cellData?.ploppable) {
      const isParkingSpot = cellData.ploppable.type === 'Parking Spot';
      const isParkingMeter = cellData.ploppable.type === 'Parking Meter';
      
      if (isParkingSpot || isParkingMeter) {
        // For Parking Spot, use orientation directly
        // For Parking Meter, use parkingSpotOrientation (stores original spot orientation)
        const orientation = isParkingSpot
          ? (cellData.ploppable.orientation || 0)
          : (cellData.ploppable.parkingSpotOrientation ?? cellData.ploppable.orientation ?? 0);
        
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
    }
    
    return false;
  }

  /**
   * Check if a cell has a parking spot with the given edge blocked (drawn).
   *
   * Manual regression checklist for parking spot pathing:
   * - Orientation 0 (missing left/edge 3): enter from West only; entering from N/S/E should be blocked.
   * - Orientation 1 (missing bottom/edge 2): enter from South only; entering from N/E/W should be blocked.
   * - Orientation 2 (missing top/edge 0): enter from North only; entering from S/E/W should be blocked.
   * - Orientation 3 (missing right/edge 1): enter from East only; entering from N/S/W should be blocked.
   */
  static isParkingSpotEdgeBlocked(
    cellX: number,
    cellY: number,
    edge: number,
    gridManager: GridManager
  ): boolean {
    const cellData = gridManager.getCellData(cellX, cellY);
    if (cellData?.ploppable) {
      const isParkingSpot = cellData.ploppable.type === 'Parking Spot';
      const isParkingMeter = cellData.ploppable.type === 'Parking Meter';
      
      if (isParkingSpot || isParkingMeter) {
        // For Parking Spot, use orientation directly
        // For Parking Meter, use parkingSpotOrientation (stores original spot orientation)
        const orientation = isParkingSpot
          ? (cellData.ploppable.orientation || 0)
          : (cellData.ploppable.parkingSpotOrientation ?? cellData.ploppable.orientation ?? 0);
        
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
    }
    return false;
  }

  /**
   * Check if an edge blocks a specific entity type
   * - Vehicles: Blocked by curbs, fences, parking spot borders, impassable ploppables, and lane-line one-way (when laneLineOneWayOnly)
   * - Pedestrians: Blocked by fences and impassable ploppables
   *
   * Lane lines (yellow): Two kinds — parallel to X (edges 0/2) and parallel to Y (edges 1/3).
   * Perpendicular crossing of a lane line is allowed. Parallel movement is one-way: the lane line must be on the vehicle's left (drive on the right).
   * When laneLineOneWayOnly is true, this call is checking the edge on the vehicle's RIGHT; if it has a lane line, block (wrong-way).
   *
   * @param isEntryEdge - If true, this is an entry edge (check parking spots, curbs, ploppables). If false, corridor edge (only check fences).
   * @param movementDirection - The direction of movement.
   * @param laneLineOneWayOnly - When true, only block if this edge has a lane line (vehicles only). Used for one-way parallel-to-lane check.
   */
  static isEdgeBlockedForEntity(
    cellX: number,
    cellY: number,
    edge: number,
    entityType: 'vehicle' | 'pedestrian',
    gridManager: GridManager,
    isEntryEdge: boolean = true,
    movementDirection: 'north' | 'south' | 'east' | 'west' = 'north',
    laneLineOneWayOnly: boolean = false
  ): boolean {
    // One-way lane check: block vehicle only if the edge on our right has a lane line (wrong-way).
    if (laneLineOneWayOnly) {
      if (entityType !== 'vehicle') return false;
      const key = gridManager.findExistingBorderSegmentKey(cellX, cellY, edge);
      if (!key) return false;
      const color = gridManager.getBorderSegment(key);
      return color === 0xffff00; // yellow = lane line → block
    }
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
    
    // Curb blocks ALL vehicle crossings through that edge (entry or exit)
    // "Vehicles cannot cross these lines, but pedestrians can"
    // Note: We check isEntryEdge to ensure we only block actual crossings, not corridor walls
    if (curbLaneColor === 0x808080 && entityType === 'vehicle') {
      // For entry edges (direct crossings), always block vehicles
      if (isEntryEdge) {
        return true;
      }
      // For corridor edges (exit from source cell), block if direction matches edge
      // Edge 0 (top) blocks North, Edge 1 (right) blocks East, 
      // Edge 2 (bottom) blocks South, Edge 3 (left) blocks West
      const edgeBlocksDirection = 
        (edge === 0 && movementDirection === 'north') ||
        (edge === 1 && movementDirection === 'east') ||
        (edge === 2 && movementDirection === 'south') ||
        (edge === 3 && movementDirection === 'west');
      
      if (edgeBlocksDirection) {
        return true;
      }
    }

    // Lane line (yellow) — N-S and E-W perpendicular crossing is NOT hard-blocked here.
    // Instead, a cost penalty is applied via getLaneLineCrossingCost so A* prefers paths
    // that don't cross the lane line unnecessarily but still crosses when it's the only way.

    // Check parking spot borders on entry edges (only for vehicles)
    // When isEntryEdge is true, cellX/cellY is the target cell and edge is the target edge
    // Parking spot borders are on the parking spot cell itself, so check directly
    if (entityType === 'vehicle' && isEntryEdge) {
      const isParkingSpotBlocked = this.isParkingSpotEdgeBlocked(cellX, cellY, edge, gridManager);
      if (isParkingSpotBlocked) {
        return true;
      }
    }
    
    // Check for impassable ploppables in the target cell (only on entry edges)
    // When isEntryEdge is true, cellX/cellY IS the target cell (from getEdgesToCheck)
    // So we check the ploppable directly on this cell
    if (isEntryEdge) {
      const cellData = gridManager.getCellData(cellX, cellY);
      if (cellData?.ploppable) {
        const blocksEntity = PassabilitySystem.doesPloppableBlockEntity(cellData.ploppable, entityType);
        if (blocksEntity) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Get the target cell coordinates when moving in a given direction from a source cell
   * @param fromX - Source cell X
   * @param fromY - Source cell Y
   * @param direction - Direction of movement
   * @returns Target cell coordinates, or null if out of bounds
   */
  private static getTargetCellForMovement(
    fromX: number,
    fromY: number,
    direction: 'north' | 'south' | 'east' | 'west'
  ): { x: number; y: number } | null {
    let targetX = fromX;
    let targetY = fromY;
    
    switch (direction) {
      case 'north':
        targetY = fromY - 1;
        break;
      case 'south':
        targetY = fromY + 1;
        break;
      case 'east':
        targetX = fromX + 1;
        break;
      case 'west':
        targetX = fromX - 1;
        break;
    }
    
    return { x: targetX, y: targetY };
  }

  /**
   * Cost for crossing a lane line perpendicularly. Adds a penalty for vehicles crossing
   * N-S or E-W lane lines so A* prefers paths that avoid unnecessary lane-line crossings
   * (e.g. prevents "early left turn" lane-switching) while still allowing crossings when
   * they are the only way to reach the destination (e.g. parking spots on the other side).
   */
  static getLaneLineCrossingCost(
    fromX: number,
    fromY: number,
    _toX: number,
    _toY: number,
    direction: 'north' | 'south' | 'east' | 'west',
    entityType: 'vehicle' | 'pedestrian',
    gridManager: GridManager
  ): number {
    if (entityType !== 'vehicle') return 0;

    // For E/W movement: check if we cross an N-S lane line (edge 1 for east, edge 3 for west)
    if (direction === 'east' || direction === 'west') {
      const crossEdge = direction === 'east' ? 1 : 3;
      const key = gridManager.findExistingBorderSegmentKey(fromX, fromY, crossEdge);
      if (key && gridManager.getBorderSegment(key) === 0xffff00) {
        return 5; // penalty: crossing N-S lane line
      }
    }

    // For N/S movement: check if we cross an E-W lane line (edge 0 for north, edge 2 for south)
    if (direction === 'north' || direction === 'south') {
      const crossEdge = direction === 'north' ? 0 : 2;
      const key = gridManager.findExistingBorderSegmentKey(fromX, fromY, crossEdge);
      if (key && gridManager.getBorderSegment(key) === 0xffff00) {
        return 5; // penalty: crossing E-W lane line
      }
    }

    return 0;
  }

  /**
   * Validate a vehicle path: count how many path steps cross a lane line (perpendicular). Used for debug; one-way violations are prevented by blocking, not cost.
   * @returns Object with crossingCount (perpendicular crossings only).
   */
  static validateVehiclePathLaneCrossings(
    path: { x: number; y: number }[],
    startX: number,
    startY: number,
    gridManager: GridManager
  ): { crossingCount: number } {
    let crossingCount = 0;
    let fromX = startX;
    let fromY = startY;
    for (const to of path) {
      const dx = to.x - fromX;
      const dy = to.y - fromY;
      const direction: 'north' | 'south' | 'east' | 'west' =
        dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
      const cost = this.getLaneLineCrossingCost(
        fromX, fromY, to.x, to.y, direction, 'vehicle', gridManager
      );
      if (cost > 0) crossingCount++;
      fromX = to.x;
      fromY = to.y;
    }
    return { crossingCount };
  }

  /**
   * Get the neighbor cell that shares a given edge.
   * Returns the neighbor cell coordinates and the corresponding edge number.
   * Convention must match GridManager.getAllPossibleBorderSegmentKeys (axis-aligned for N/S).
   */
  static getNeighborCellForEdge(
    cellX: number,
    cellY: number,
    edge: number
  ): { cellX: number; cellY: number; edge: number } | null {
    // Edge sharing (single convention used by GridManager and pathfinding):
    // - Edge 0 (top) of (x,y) = Edge 2 (bottom) of (x, y-1)
    // - Edge 1 (right) of (x,y) = Edge 3 (left) of (x+1, y)
    // - Edge 2 (bottom) of (x,y) = Edge 0 (top) of (x, y+1)
    // - Edge 3 (left) of (x,y) = Edge 1 (right) of (x-1, y)
    
    switch (edge) {
      case 0: // top -> neighbor's bottom
        return { cellX, cellY: cellY - 1, edge: 2 };
      case 1: // right -> neighbor's left
        return { cellX: cellX + 1, cellY, edge: 3 };
      case 2: // bottom -> neighbor's top
        return { cellX, cellY: cellY + 1, edge: 0 };
      case 3: // left -> neighbor's right
        return { cellX: cellX - 1, cellY, edge: 1 };
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

