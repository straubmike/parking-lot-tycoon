import { CellData } from '@/types';

/**
 * Entity types for pathfinding - different entities have different movement rules
 */
export type PathfindingEntityType = 'vehicle' | 'pedestrian';

/**
 * Callback type for checking if an edge blocks movement
 * @param cellX - Cell X coordinate
 * @param cellY - Cell Y coordinate  
 * @param edge - Edge index (0=top, 1=right, 2=bottom, 3=left)
 * @param entityType - Type of entity trying to cross
 * @param checkParkingSpots - Whether to check parking spot borders (false for corridor edges)
 * @param movementDirection - The direction of movement (for lane line "drive on the right" logic)
 * @returns true if the edge blocks this entity type
 */
export type EdgeBlockedCallback = (
  cellX: number,
  cellY: number,
  edge: number,
  entityType: PathfindingEntityType,
  checkParkingSpots: boolean,
  movementDirection: 'north' | 'south' | 'east' | 'west'
) => boolean;

/**
 * A* pathfinding node
 */
interface PathNode {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic (estimated cost to goal)
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

/**
 * Cardinal directions for isometric grid movement
 * These correspond to movement along the green dotted rail lines
 */
const CARDINAL_DIRECTIONS = [
  { dx: 0, dy: -1, name: 'north' as const }, // North: decreasing Y
  { dx: 0, dy: 1, name: 'south' as const },  // South: increasing Y
  { dx: 1, dy: 0, name: 'east' as const },   // East: increasing X
  { dx: -1, dy: 0, name: 'west' as const },  // West: decreasing X
];

/**
 * PathfindingSystem - A* pathfinding for isometric cardinal movement
 * 
 * Supports different entity types with different movement rules:
 * - Vehicles: Blocked by curbs, fences, parking spot borders; respect lane lines
 * - Pedestrians: Blocked only by fences; ignore lane lines
 */
export class PathfindingSystem {
  private gridSize: number;
  private isEdgeBlocked: EdgeBlockedCallback;

  constructor(
    gridSize: number,
    _getCellData: (x: number, y: number) => CellData | undefined, // Kept for API compatibility
    isEdgeBlocked: EdgeBlockedCallback
  ) {
    this.gridSize = gridSize;
    this.isEdgeBlocked = isEdgeBlocked;
  }

  /**
   * Find a path from start to goal using A* algorithm
   * Only allows cardinal movement (N, S, E, W on isometric grid)
   * 
   * @param startX - Start cell X
   * @param startY - Start cell Y
   * @param goalX - Goal cell X
   * @param goalY - Goal cell Y
   * @param entityType - Type of entity (affects which obstacles block movement)
   * @returns Array of {x, y} coordinates representing the path (excluding start), or empty array if no path
   */
  findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    entityType: PathfindingEntityType
  ): { x: number; y: number }[] {
    // Validate bounds
    if (!this.isInBounds(startX, startY) || !this.isInBounds(goalX, goalY)) {
      return [];
    }

    // Already at goal
    if (startX === goalX && startY === goalY) {
      return [];
    }

    // A* implementation
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    
    const startNode: PathNode = {
      x: startX,
      y: startY,
      g: 0,
      h: this.heuristic(startX, startY, goalX, goalY),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    while (openSet.length > 0) {
      // Get node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      
      // Check if we reached the goal
      if (current.x === goalX && current.y === goalY) {
        return this.reconstructPath(current);
      }

      const currentKey = `${current.x},${current.y}`;
      closedSet.add(currentKey);

      // Explore neighbors (cardinal directions only)
      for (const dir of CARDINAL_DIRECTIONS) {
        const neighborX = current.x + dir.dx;
        const neighborY = current.y + dir.dy;
        const neighborKey = `${neighborX},${neighborY}`;

        // Skip if out of bounds or already visited
        if (!this.isInBounds(neighborX, neighborY)) continue;
        if (closedSet.has(neighborKey)) continue;

        // Check if movement is allowed
        if (!this.canMove(current.x, current.y, dir.name, entityType)) {
          continue;
        }

        // Calculate costs
        const g = current.g + 1; // All cardinal moves cost 1
        const h = this.heuristic(neighborX, neighborY, goalX, goalY);
        const f = g + h;

        // Check if this path to neighbor is better than any previous one
        const existingIndex = openSet.findIndex(n => n.x === neighborX && n.y === neighborY);
        if (existingIndex !== -1) {
          if (g < openSet[existingIndex].g) {
            // Found a better path to this node
            openSet[existingIndex].g = g;
            openSet[existingIndex].f = f;
            openSet[existingIndex].parent = current;
          }
        } else {
          // New node
          openSet.push({
            x: neighborX,
            y: neighborY,
            g,
            h,
            f,
            parent: current,
          });
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Check if movement from a cell in a direction is allowed
   * 
   * @param fromX - Starting cell X
   * @param fromY - Starting cell Y
   * @param direction - Cardinal direction to move
   * @param entityType - Type of entity
   * @returns true if movement is allowed
   */
  canMove(
    fromX: number,
    fromY: number,
    direction: 'north' | 'south' | 'east' | 'west',
    entityType: PathfindingEntityType
  ): boolean {
    // Get target cell
    const toX = fromX + (direction === 'east' ? 1 : direction === 'west' ? -1 : 0);
    const toY = fromY + (direction === 'south' ? 1 : direction === 'north' ? -1 : 0);

    // Check bounds
    if (!this.isInBounds(toX, toY)) {
      return false;
    }

    // All blocking is now unified in isEdgeBlocked callback
    // This includes fences, curbs, lane lines, and parking spot borders
    
    // Determine which edges are crossed based on direction
    const edgesToCheck = this.getEdgesToCheck(fromX, fromY, direction);
    
    for (const { cellX, cellY, edge, isCorridor } of edgesToCheck) {
      // Skip edge checks for out-of-bounds cells (grid borders)
      if (!this.isInBounds(cellX, cellY)) {
        continue;
      }
      
      // For corridor edges, don't check parking spot borders - only fences/curbs/lane lines
      // Parking spot borders only block direct entry into the parking spot cell
      const checkParkingSpots = !isCorridor;
      
      if (this.isEdgeBlocked(cellX, cellY, edge, entityType, checkParkingSpots, direction)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the edges that need to be checked when moving in a direction
   * 
   * In the isometric grid:
   * - Cell edges are: 0=top (NE diagonal), 1=right (SE diagonal), 2=bottom (SW diagonal), 3=left (NW diagonal)
   * - Cell vertices: top (north), right (east), bottom (south), left (west)
   * 
   * Edge sharing between adjacent cells:
   * - Top edge (0) of (x,y) = Bottom edge (2) of (x-1, y+1)
   * - Right edge (1) of (x,y) = Left edge (3) of (x+1, y)
   * - Bottom edge (2) of (x,y) = Top edge (0) of (x+1, y-1)
   * - Left edge (3) of (x,y) = Right edge (1) of (x-1, y)
   * 
   * Movement in screen space:
   * - East (x+1): down-right → crosses right edge (1)
   * - West (x-1): up-left → crosses left edge (3)
   * - North (y-1): up-right → crosses top edge (0) and right edge (1) area
   * - South (y+1): down-left → crosses bottom edge (2) and left edge (3) area
   * 
   * For N/S movement, cells don't share a direct edge, so we check edges
   * from both the source cell and adjacent cells that the diagonal path crosses.
   * 
   * isCorridor flag: true for edges that are just "corridor walls" where we're
   * passing by, not entering. Parking spot borders should NOT block corridor edges.
   */
  private getEdgesToCheck(
    fromX: number,
    fromY: number,
    direction: 'north' | 'south' | 'east' | 'west'
  ): { cellX: number; cellY: number; edge: number; isCorridor: boolean }[] {
    const edges: { cellX: number; cellY: number; edge: number; isCorridor: boolean }[] = [];

    switch (direction) {
      case 'east':
        // Moving from (x,y) to (x+1,y) - down-right in screen space
        // Crosses right edge (1) of current cell = left edge (3) of target
        // Check source cell's right edge (fence/curb/lane line)
        edges.push({ cellX: fromX, cellY: fromY, edge: 1, isCorridor: false });
        // Also check target cell's left edge (3) for parking spot borders - this is the ENTRY EDGE
        edges.push({ cellX: fromX + 1, cellY: fromY, edge: 3, isCorridor: false });
        break;
        
      case 'west':
        // Moving from (x,y) to (x-1,y) - up-left in screen space
        // Crosses left edge (3) of current cell = right edge (1) of target
        // Check source cell's left edge (fence/curb/lane line)
        edges.push({ cellX: fromX, cellY: fromY, edge: 3, isCorridor: false });
        // Also check target cell's right edge (1) for parking spot borders - this is the ENTRY EDGE
        edges.push({ cellX: fromX - 1, cellY: fromY, edge: 1, isCorridor: false });
        break;
        
      case 'north':
        // Moving from (x,y) to (x,y-1) - up-right in screen space
        // The diagonal path travels through a corridor between cells.
        // Only the ENTRY edge (bottom of target) should check parking spots.
        // Other edges check fences/curbs only (isCorridor: true).
        edges.push({ cellX: fromX, cellY: fromY, edge: 0, isCorridor: true }); // Top edge of source - fence/curb only
        edges.push({ cellX: fromX, cellY: fromY, edge: 1, isCorridor: true }); // Right edge of source - fence/curb only
        edges.push({ cellX: fromX, cellY: fromY - 1, edge: 2, isCorridor: false }); // Bottom edge of target - ENTRY EDGE
        edges.push({ cellX: fromX, cellY: fromY - 1, edge: 1, isCorridor: true }); // Right edge of target - fence/curb only
        // Corridor edges (cells to the east) - only check fences/curbs, not parking spots
        edges.push({ cellX: fromX + 1, cellY: fromY - 1, edge: 3, isCorridor: true }); // Left edge of east-target
        edges.push({ cellX: fromX + 1, cellY: fromY, edge: 3, isCorridor: true }); // Left edge of east-source
        break;
        
      case 'south':
        // Moving from (x,y) to (x,y+1) - down-left in screen space
        // The diagonal path travels through a corridor between cells.
        // Only the ENTRY edge (top of target) should check parking spots.
        // Other edges check fences/curbs only (isCorridor: true).
        edges.push({ cellX: fromX, cellY: fromY, edge: 2, isCorridor: true }); // Bottom edge of source - fence/curb only
        edges.push({ cellX: fromX, cellY: fromY, edge: 3, isCorridor: true }); // Left edge of source - fence/curb only
        edges.push({ cellX: fromX, cellY: fromY + 1, edge: 0, isCorridor: false }); // Top edge of target - ENTRY EDGE
        edges.push({ cellX: fromX, cellY: fromY + 1, edge: 3, isCorridor: true }); // Left edge of target - fence/curb only
        // Corridor edges (cells to the west) - only check fences/curbs, not parking spots
        edges.push({ cellX: fromX - 1, cellY: fromY, edge: 1, isCorridor: true }); // Right edge of west-source
        edges.push({ cellX: fromX - 1, cellY: fromY + 1, edge: 1, isCorridor: true }); // Right edge of west-target
        break;
    }

    return edges;
  }

  /**
   * Manhattan distance heuristic for A*
   */
  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }

  /**
   * Check if coordinates are within grid bounds
   */
  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize;
  }

  /**
   * Reconstruct path from goal node back to start
   */
  private reconstructPath(goalNode: PathNode): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let current: PathNode | null = goalNode;
    
    while (current !== null) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    
    // Remove start position (caller already knows where they are)
    if (path.length > 0) {
      path.shift();
    }
    
    return path;
  }

  /**
   * Update grid size (e.g., when loading a new map)
   */
  setGridSize(size: number): void {
    this.gridSize = size;
  }
}

