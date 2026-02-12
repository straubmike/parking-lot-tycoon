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
 * @param isEntryEdge - Whether this is an entry edge (true) or corridor edge (false). Entry edges check parking spots, lane lines, and curbs. Corridor edges only check fences.
 * @param movementDirection - The direction of movement (for lane line "drive on the right" logic)
 * @param laneLineOneWayOnly - When true, only block if this edge has a lane line (one-way violation: line on vehicle's right). Used for parallel-to-lane movement; perpendicular crossing is not checked here.
 * @returns true if the edge blocks this entity type
 */
export type EdgeBlockedCallback = (
  cellX: number,
  cellY: number,
  edge: number,
  entityType: PathfindingEntityType,
  isEntryEdge: boolean,
  movementDirection: 'north' | 'south' | 'east' | 'west',
  laneLineOneWayOnly?: boolean
) => boolean;

/**
 * Callback type for getting the cost of a move (for penalizing lane line crossings)
 * @param fromX - Starting cell X
 * @param fromY - Starting cell Y
 * @param toX - Target cell X
 * @param toY - Target cell Y
 * @param direction - Direction of movement
 * @param entityType - Type of entity
 * @returns Additional cost for this move (default is 0, higher values make pathfinding avoid this move)
 */
export type MoveCostCallback = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  direction: 'north' | 'south' | 'east' | 'west',
  entityType: PathfindingEntityType
) => number;

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
  private gridWidth: number;
  private gridHeight: number;
  private isEdgeBlocked: EdgeBlockedCallback;
  private getMoveCost: MoveCostCallback;

  constructor(
    gridWidth: number,
    gridHeight: number,
    _getCellData: (x: number, y: number) => CellData | undefined, // Kept for API compatibility
    isEdgeBlocked: EdgeBlockedCallback,
    getMoveCost?: MoveCostCallback
  ) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.isEdgeBlocked = isEdgeBlocked;
    this.getMoveCost = getMoveCost || (() => 0); // Default: no cost penalty
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
        // Base cost is 1, plus any penalty for crossing lane lines
        const moveCostPenalty = this.getMoveCost(current.x, current.y, neighborX, neighborY, dir.name, entityType);
        const g = current.g + 1 + moveCostPenalty;
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
    
    for (const { cellX, cellY, edge, isCorridor, laneLineOneWayOnly } of edgesToCheck) {
      if (!this.isInBounds(cellX, cellY)) {
        continue;
      }
      const isEntryEdge = !isCorridor;
      if (this.isEdgeBlocked(cellX, cellY, edge, entityType, isEntryEdge, direction, laneLineOneWayOnly)) {
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
   * Edge sharing between adjacent cells (must match GridManager.getAllPossibleBorderSegmentKeys):
   * - Top edge (0) of (x,y) = Bottom edge (2) of (x, y-1)
   * - Right edge (1) of (x,y) = Left edge (3) of (x+1, y)
   * - Bottom edge (2) of (x,y) = Top edge (0) of (x, y+1)
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
  /**
   * Edge on the vehicle's RIGHT when moving in the given direction.
   * One-way rule: lane line must be on the left (drive on the right). So we block if there's a lane line on our right.
   */
  private static readonly RIGHT_EDGE_BY_DIRECTION: Record<'north' | 'south' | 'east' | 'west', number> = {
    east: 2,  // bottom (south)
    west: 0,  // top (north)
    north: 1, // right (east)
    south: 3, // left (west)
  };

  private getEdgesToCheck(
    fromX: number,
    fromY: number,
    direction: 'north' | 'south' | 'east' | 'west'
  ): { cellX: number; cellY: number; edge: number; isCorridor: boolean; laneLineOneWayOnly?: boolean }[] {
    const edges: { cellX: number; cellY: number; edge: number; isCorridor: boolean; laneLineOneWayOnly?: boolean }[] = [];

    switch (direction) {
      case 'east':
        edges.push({ cellX: fromX, cellY: fromY, edge: 1, isCorridor: false });
        edges.push({ cellX: fromX + 1, cellY: fromY, edge: 3, isCorridor: false });
        edges.push({ cellX: fromX, cellY: fromY, edge: PathfindingSystem.RIGHT_EDGE_BY_DIRECTION.east, isCorridor: false, laneLineOneWayOnly: true });
        break;
      case 'west':
        edges.push({ cellX: fromX, cellY: fromY, edge: 3, isCorridor: false });
        edges.push({ cellX: fromX - 1, cellY: fromY, edge: 1, isCorridor: false });
        edges.push({ cellX: fromX, cellY: fromY, edge: PathfindingSystem.RIGHT_EDGE_BY_DIRECTION.west, isCorridor: false, laneLineOneWayOnly: true });
        break;
      case 'north':
        edges.push({ cellX: fromX, cellY: fromY, edge: 0, isCorridor: true });
        edges.push({ cellX: fromX, cellY: fromY - 1, edge: 2, isCorridor: false });
        edges.push({ cellX: fromX, cellY: fromY, edge: PathfindingSystem.RIGHT_EDGE_BY_DIRECTION.north, isCorridor: false, laneLineOneWayOnly: true });
        break;
      case 'south':
        edges.push({ cellX: fromX, cellY: fromY, edge: 2, isCorridor: true });
        edges.push({ cellX: fromX, cellY: fromY + 1, edge: 0, isCorridor: false });
        edges.push({ cellX: fromX, cellY: fromY, edge: PathfindingSystem.RIGHT_EDGE_BY_DIRECTION.south, isCorridor: false, laneLineOneWayOnly: true });
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
    return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
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
  setGridSize(width: number, height: number): void {
    this.gridWidth = width;
    this.gridHeight = height;
  }
}

