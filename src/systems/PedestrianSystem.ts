import { Pedestrian, CellData } from '@/types';
import { PedestrianEntity } from '@/entities/Pedestrian';
import { isoToScreen } from '@/utils/isometric';

export class PedestrianSystem {
  private pedestrians: PedestrianEntity[] = [];
  private destinations: Set<string> = new Set(); // Key: `${destinationX},${destinationY}` - destinations (de/respawners)
  private readonly minSpeed: number = 20; // Minimum pixels per second
  private readonly maxSpeed: number = 40; // Maximum pixels per second
  private readonly minRespawnDuration: number = 5000; // Minimum respawn time (5 seconds)
  private readonly maxRespawnDuration: number = 15000; // Maximum respawn time (15 seconds)
  private getCellData: (x: number, y: number) => CellData | undefined;
  private gridSize: number;
  private getDestinations: () => { x: number; y: number }[]; // Get all destination spawners

  constructor(
    getCellData: (x: number, y: number) => CellData | undefined,
    gridSize: number,
    getDestinations: () => { x: number; y: number }[]
  ) {
    this.getCellData = getCellData;
    this.gridSize = gridSize;
    this.getDestinations = getDestinations;
  }

  /**
   * Register a destination (de/respawner)
   */
  addDestination(destinationX: number, destinationY: number): void {
    const key = `${destinationX},${destinationY}`;
    this.destinations.add(key);
  }

  /**
   * Remove a destination (de/respawner)
   */
  removeDestination(destinationX: number, destinationY: number): void {
    const key = `${destinationX},${destinationY}`;
    this.destinations.delete(key);
  }

  /**
   * Spawn a pedestrian from a vehicle (when vehicle parks)
   */
  spawnPedestrianFromVehicle(
    vehicleId: string,
    vehicleX: number,
    vehicleY: number
  ): void {
    // Find a random destination from available destinations
    const destinations = this.getDestinations();
    if (destinations.length === 0) {
      // No destinations available, don't spawn
      return;
    }
    
    const randomDestination = destinations[Math.floor(Math.random() * destinations.length)];
    
    // Create path from vehicle to destination
    const path = this.findPedestrianPath(vehicleX, vehicleY, randomDestination.x, randomDestination.y);
    
    // Random speed and respawn duration
    const speed = this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed);
    const respawnDuration = this.minRespawnDuration + 
      Math.random() * (this.maxRespawnDuration - this.minRespawnDuration);
    
    const pedestrian = new PedestrianEntity(
      vehicleId,
      vehicleX,
      vehicleY,
      randomDestination.x,
      randomDestination.y,
      path,
      speed,
      respawnDuration
    );
    
    // Set initial screen position (cell center at vehicle)
    const spawnScreenPos = isoToScreen(vehicleX, vehicleY);
    pedestrian.screenX = spawnScreenPos.x;
    pedestrian.screenY = spawnScreenPos.y;
    pedestrian.x = vehicleX;
    pedestrian.y = vehicleY;
    pedestrian.state = 'spawning';
    
    this.pedestrians.push(pedestrian);
  }

  /**
   * Get pedestrian by vehicle ID
   */
  getPedestrianByVehicleId(vehicleId: string): PedestrianEntity | undefined {
    return this.pedestrians.find(p => p.vehicleId === vehicleId);
  }

  /**
   * Heuristic function (Euclidean distance)
   */
  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get neighbors along rail grid (same row or same column) - same as vehicles
   * This ensures pedestrians follow the same isometric rail grid as vehicles
   */
  private getCellNeighbors(cellX: number, cellY: number): { x: number; y: number }[] {
    const neighbors: { x: number; y: number }[] = [];
    
    // Row rail neighbors (same Y, different X) - horizontal movement
    if (cellX > 0) neighbors.push({ x: cellX - 1, y: cellY });
    if (cellX < this.gridSize - 1) neighbors.push({ x: cellX + 1, y: cellY });
    
    // Column rail neighbors (same X, different Y - vertical movement)
    if (cellY > 0) neighbors.push({ x: cellX, y: cellY - 1 });
    if (cellY < this.gridSize - 1) neighbors.push({ x: cellX, y: cellY + 1 });
    
    return neighbors;
  }

  /**
   * Check if a cell is walkable for pedestrians
   * Cells are walkable by default unless explicitly blocked
   */
  private isCellWalkable(cellX: number, cellY: number): boolean {
    // Check bounds first
    if (cellX < 0 || cellX >= this.gridSize || cellY < 0 || cellY >= this.gridSize) {
      return false;
    }
    
    const cellData = this.getCellData(cellX, cellY);
    
    // Cells are walkable by default (even if they have no data)
    // Only block if there's explicit obstacle data
    // For now, all cells are walkable - can add obstacle checks here later
    // (e.g., check for fences, blocking ploppables, etc.)
    
    return true;
  }

  /**
   * Find path from start to end using cell centers (4-directional A* pathfinding)
   * Pedestrians can only move in cardinal directions (N, S, E, W) - no diagonals
   */
  private findPedestrianPath(
    startCellX: number,
    startCellY: number,
    endCellX: number,
    endCellY: number
  ): { x: number; y: number }[] {
    // Simple A* on cell grid (4-directional cardinal movement only)
    // Nodes are cell centers (integer coordinates)
    // Only allows N, S, E, W movement (no diagonals)
    
    if (startCellX === endCellX && startCellY === endCellY) {
      return [{ x: endCellX, y: endCellY }];
    }

    interface Node {
      x: number;
      y: number;
      g: number; // Cost from start
      h: number; // Heuristic to end
      f: number; // Total cost (g + h)
      parent: Node | null;
    }

    const openSet: Map<string, Node> = new Map();
    const closedSet: Set<string> = new Set();
    
    const start: Node = {
      x: startCellX,
      y: startCellY,
      g: 0,
      h: this.heuristic(startCellX, startCellY, endCellX, endCellY),
      f: 0,
      parent: null
    };
    start.f = start.g + start.h;
    
    const startKey = `${startCellX},${startCellY}`;
    openSet.set(startKey, start);
    
    while (openSet.size > 0) {
      // Find node with lowest f score
      let current: Node | null = null;
      let lowestF = Infinity;
      for (const node of openSet.values()) {
        if (node.f < lowestF) {
          lowestF = node.f;
          current = node;
        }
      }
      
      if (!current) break;
      
      const currentKey = `${current.x},${current.y}`;
      
      // Check if we reached the goal
      if (current.x === endCellX && current.y === endCellY) {
        // Reconstruct path
        const path: { x: number; y: number }[] = [];
        let node: Node | null = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        
        // Validate path: ensure all consecutive cells are adjacent
        // This ensures pedestrians only move to adjacent cells
        const validatedPath: { x: number; y: number }[] = [path[0]];
        for (let i = 1; i < path.length; i++) {
          const prev = path[i - 1];
          const curr = path[i];
          const dx = Math.abs(curr.x - prev.x);
          const dy = Math.abs(curr.y - prev.y);
          
          // Check if cells are adjacent in cardinal directions only (no diagonals)
          // Cardinal: (dx === 1 && dy === 0) OR (dx === 0 && dy === 1)
          if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            validatedPath.push(curr);
          } else {
            // If not adjacent in cardinal direction, something went wrong - skip this node
            // This shouldn't happen with proper A*, but just in case
            console.warn(`Path validation: non-cardinal adjacent cells detected: (${prev.x},${prev.y}) -> (${curr.x},${curr.y})`);
          }
        }
        return validatedPath;
      }
      
      // Move current from open to closed
      openSet.delete(currentKey);
      closedSet.add(currentKey);
      
      // Get neighbors (4-directional cardinal movement only)
      const neighbors = this.getCellNeighbors(current.x, current.y);
      
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        
        // Skip if already in closed set
        if (closedSet.has(neighborKey)) continue;
        
        // Check if cell is walkable
        if (!this.isCellWalkable(neighbor.x, neighbor.y)) continue;
        
        // Calculate cost (all movements cost 1.0 since we only use cardinal directions)
        const cost = 1.0;
        const tentativeG = current.g + cost;
        
        // Check if neighbor is in open set
        const existingNeighbor = openSet.get(neighborKey);
        if (!existingNeighbor) {
          // New node - add to open set
          const neighborNode: Node = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: this.heuristic(neighbor.x, neighbor.y, endCellX, endCellY),
            f: 0,
            parent: current
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          openSet.set(neighborKey, neighborNode);
        } else if (tentativeG < existingNeighbor.g) {
          // Better path found - update neighbor
          existingNeighbor.g = tentativeG;
          existingNeighbor.f = existingNeighbor.g + existingNeighbor.h;
          existingNeighbor.parent = current;
        }
      }
    }
    
    // No path found - return direct path as fallback
    return [{ x: endCellX, y: endCellY }];
  }

  /**
   * Update all pedestrians
   */
  update(delta: number, gridSize: number, gridOffsetX: number, gridOffsetY: number): void {
    // Update all pedestrians
    this.pedestrians.forEach(pedestrian => {
      // Handle spawning state - transition to going_to_destination
      if (pedestrian.state === 'spawning') {
        pedestrian.state = 'going_to_destination';
      }
      
      // Handle going to destination
      if (pedestrian.state === 'going_to_destination') {
        if (pedestrian.path.length > 0 && pedestrian.currentPathIndex < pedestrian.path.length) {
          const target = pedestrian.path[pedestrian.currentPathIndex];
          const targetScreenPos = isoToScreen(target.x, target.y);
          const targetScreenX = targetScreenPos.x;
          const targetScreenY = targetScreenPos.y;
          
          const dx = targetScreenX - pedestrian.screenX;
          const dy = targetScreenY - pedestrian.screenY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const moveDistance = (pedestrian.speed * delta) / 1000;
          
          if (distance <= moveDistance || distance < 0.1) {
            // Reached current target
            pedestrian.screenX = targetScreenX;
            pedestrian.screenY = targetScreenY;
            pedestrian.x = target.x;
            pedestrian.y = target.y;
            pedestrian.currentPathIndex++;
            
            // Check if reached destination
            if (pedestrian.currentPathIndex >= pedestrian.path.length) {
              if (pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined &&
                  pedestrian.x === pedestrian.destinationX && pedestrian.y === pedestrian.destinationY) {
                // Reached destination - despawn but keep entity
                pedestrian.state = 'despawned';
                pedestrian.respawnTimer = pedestrian.respawnDuration;
              }
            }
          } else {
            // Move towards target
            const moveX = (dx / distance) * moveDistance;
            const moveY = (dy / distance) * moveDistance;
            pedestrian.screenX += moveX;
            pedestrian.screenY += moveY;
            
            // Update grid position based on current screen position
            const currentCellScreenPos = isoToScreen(pedestrian.x, pedestrian.y);
            const targetCellScreenPos = isoToScreen(target.x, target.y);
            
            const totalDistance = Math.sqrt(
              (targetCellScreenPos.x - currentCellScreenPos.x) ** 2 +
              (targetCellScreenPos.y - currentCellScreenPos.y) ** 2
            );
            const currentDistance = Math.sqrt(
              (pedestrian.screenX - currentCellScreenPos.x) ** 2 +
              (pedestrian.screenY - currentCellScreenPos.y) ** 2
            );
            
            if (totalDistance > 0 && currentDistance / totalDistance > 0.5) {
              pedestrian.x = target.x;
              pedestrian.y = target.y;
            }
          }
        } else {
          // Path completed, check if at destination
          if (pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined &&
              pedestrian.x === pedestrian.destinationX && pedestrian.y === pedestrian.destinationY) {
            pedestrian.state = 'despawned';
            pedestrian.respawnTimer = pedestrian.respawnDuration;
          }
        }
      }
      
      // Handle despawned state - count down respawn timer
      if (pedestrian.state === 'despawned') {
        if (pedestrian.respawnTimer !== undefined) {
          pedestrian.respawnTimer -= delta;
          
          if (pedestrian.respawnTimer <= 0) {
            // Time to respawn - path back to vehicle
            const pathToVehicle = this.findPedestrianPath(
              pedestrian.x,
              pedestrian.y,
              pedestrian.vehicleX,
              pedestrian.vehicleY
            );
            pedestrian.path = pathToVehicle;
            pedestrian.currentPathIndex = 0;
            pedestrian.state = 'respawning';
            pedestrian.respawnTimer = undefined;
          }
        }
      }
      
      // Handle respawning state - transition to returning_to_vehicle
      if (pedestrian.state === 'respawning') {
        pedestrian.state = 'returning_to_vehicle';
      }
      
      // Handle returning to vehicle
      if (pedestrian.state === 'returning_to_vehicle') {
        if (pedestrian.path.length > 0 && pedestrian.currentPathIndex < pedestrian.path.length) {
          const target = pedestrian.path[pedestrian.currentPathIndex];
          const targetScreenPos = isoToScreen(target.x, target.y);
          const targetScreenX = targetScreenPos.x;
          const targetScreenY = targetScreenPos.y;
          
          const dx = targetScreenX - pedestrian.screenX;
          const dy = targetScreenY - pedestrian.screenY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const moveDistance = (pedestrian.speed * delta) / 1000;
          
          if (distance <= moveDistance || distance < 0.1) {
            pedestrian.screenX = targetScreenX;
            pedestrian.screenY = targetScreenY;
            pedestrian.x = target.x;
            pedestrian.y = target.y;
            pedestrian.currentPathIndex++;
            
            // Check if reached vehicle
            if (pedestrian.currentPathIndex >= pedestrian.path.length) {
              if (pedestrian.x === pedestrian.vehicleX && pedestrian.y === pedestrian.vehicleY) {
                // Reached vehicle - despawn again (mark as at_vehicle for vehicle system check)
                pedestrian.state = 'at_vehicle';
                pedestrian.respawnTimer = pedestrian.respawnDuration;
              }
            }
          } else {
            const moveX = (dx / distance) * moveDistance;
            const moveY = (dy / distance) * moveDistance;
            pedestrian.screenX += moveX;
            pedestrian.screenY += moveY;
            
            // Update grid position
            const currentCellScreenPos = isoToScreen(pedestrian.x, pedestrian.y);
            const targetCellScreenPos = isoToScreen(target.x, target.y);
            
            const totalDistance = Math.sqrt(
              (targetCellScreenPos.x - currentCellScreenPos.x) ** 2 +
              (targetCellScreenPos.y - currentCellScreenPos.y) ** 2
            );
            const currentDistance = Math.sqrt(
              (pedestrian.screenX - currentCellScreenPos.x) ** 2 +
              (pedestrian.screenY - currentCellScreenPos.y) ** 2
            );
            
            if (totalDistance > 0 && currentDistance / totalDistance > 0.5) {
              pedestrian.x = target.x;
              pedestrian.y = target.y;
            }
          }
        } else {
          // Path completed, check if at vehicle
          if (pedestrian.x === pedestrian.vehicleX && pedestrian.y === pedestrian.vehicleY) {
            pedestrian.state = 'despawned';
            pedestrian.respawnTimer = pedestrian.respawnDuration;
          }
        }
      }
    });
  }

  /**
   * Get all pedestrians (including despawned ones - they still exist)
   */
  getPedestrians(): PedestrianEntity[] {
    return this.pedestrians;
  }

  /**
   * Get only active (visible) pedestrians
   */
  getActivePedestrians(): PedestrianEntity[] {
    return this.pedestrians.filter(p => 
      p.state !== 'despawned' && p.state !== 'at_destination' && p.state !== 'at_vehicle'
    );
  }

  /**
   * Clear all pedestrians (useful for reset)
   */
  clearPedestrians(): void {
    this.pedestrians = [];
  }
}
