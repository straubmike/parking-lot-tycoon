import { Vehicle, SpawnerDespawnerPair, CellData, Ploppable } from '@/types';
import { VehicleEntity } from '@/entities/Vehicle';
import { isoToScreen } from '@/utils/isometric';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { PedestrianSystem } from './PedestrianSystem';

export class VehicleSystem {
  private vehicles: VehicleEntity[] = [];
  private spawnerDespawnerPairs: SpawnerDespawnerPair[] = [];
  private spawnTimers: Map<string, number> = new Map(); // Key: `${spawnerX},${spawnerY}`, Value: time until next spawn
  private readonly spawnInterval: number = 3000; // Spawn every 3 seconds (constant for now)
  private readonly minSpeed: number = 30; // Minimum pixels per second
  private readonly maxSpeed: number = 60; // Maximum pixels per second
  private readonly potentialParkerChance: number = 0.5; // 50% chance to be a potential parker
  private readonly minParkingDuration: number = 5000; // Minimum parking time (5 seconds)
  private readonly maxParkingDuration: number = 15000; // Maximum parking time (15 seconds)
  private getCellData: (x: number, y: number) => CellData | undefined;
  private getParkingSpots: () => Ploppable[];
  private gridSize: number;
  private checkRailSegment: (startX: number, startY: number, endX: number, endY: number) => boolean;
  private pedestrianSystem?: PedestrianSystem; // Optional pedestrian system

  constructor(
    getCellData: (x: number, y: number) => CellData | undefined,
    getParkingSpots: () => Ploppable[],
    gridSize: number,
    checkRailSegment: (startX: number, startY: number, endX: number, endY: number) => boolean,
    pedestrianSystem?: PedestrianSystem
  ) {
    this.getCellData = getCellData;
    this.getParkingSpots = getParkingSpots;
    this.gridSize = gridSize;
    this.checkRailSegment = checkRailSegment;
    this.pedestrianSystem = pedestrianSystem;
  }

  /**
   * Register a spawner-despawner pair
   */
  addSpawnerDespawnerPair(pair: SpawnerDespawnerPair): void {
    this.spawnerDespawnerPairs.push(pair);
    const key = `${pair.spawnerX},${pair.spawnerY}`;
    // Initialize spawn timer with some variance
    this.spawnTimers.set(key, this.spawnInterval + Math.random() * 1000);
  }

  /**
   * Remove a spawner-despawner pair (when despawner is removed)
   */
  removeSpawnerDespawnerPair(spawnerX: number, spawnerY: number): void {
    this.spawnerDespawnerPairs = this.spawnerDespawnerPairs.filter(
      p => !(p.spawnerX === spawnerX && p.spawnerY === spawnerY)
    );
    const key = `${spawnerX},${spawnerY}`;
    this.spawnTimers.delete(key);
  }

  /**
   * Find path from start to end using rail grid (A* pathfinding)
   * Vehicles can only move along row rails (same Y) or column rails (same X)
   */
  private findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    _gridSize: number
  ): { x: number; y: number }[] {
    // If start and end are the same, return direct path
    if (startX === endX && startY === endY) {
      return [{ x: endX, y: endY }];
    }

    // A* pathfinding on rail grid (cell centers)
    // Nodes are cell centers (grid coordinates)
    // Edges are rail segments (row rails: same Y, or column rails: same X)
    
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
    
    const startNode: Node = {
      x: startX,
      y: startY,
      g: 0,
      h: this.heuristic(startX, startY, endX, endY),
      f: 0,
      parent: null
    };
    startNode.f = startNode.g + startNode.h;
    
    openSet.set(`${startX},${startY}`, startNode);
    
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
      if (current.x === endX && current.y === endY) {
        // Reconstruct path
        const path: { x: number; y: number }[] = [];
        let node: Node | null = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }
      
      // Move current from open to closed
      openSet.delete(currentKey);
      closedSet.add(currentKey);
      
      // Get neighbors (adjacent cells along row or column rails)
      const neighbors = this.getRailNeighbors(current.x, current.y, this.gridSize);
      
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        
        // Skip if already in closed set
        if (closedSet.has(neighborKey)) continue;
        
        // Check if rail segment crosses an impassable line
        if (this.checkRailSegment(current.x, current.y, neighbor.x, neighbor.y)) {
          continue; // Skip this neighbor - rail segment is blocked
        }
        
        // Calculate cost (distance along rail)
        const cost = this.heuristic(current.x, current.y, neighbor.x, neighbor.y);
        const tentativeG = current.g + cost;
        
        // Check if neighbor is in open set
        const existingNeighbor = openSet.get(neighborKey);
        if (!existingNeighbor) {
          // New node - add to open set
          const neighborNode: Node = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: this.heuristic(neighbor.x, neighbor.y, endX, endY),
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
    return [{ x: endX, y: endY }];
  }

  /**
   * Get neighbors along rail grid (same row or same column)
   */
  private getRailNeighbors(x: number, y: number, gridSize: number): { x: number; y: number }[] {
    const neighbors: { x: number; y: number }[] = [];
    
    // Row rail neighbors (same Y, different X)
    if (x > 0) neighbors.push({ x: x - 1, y });
    if (x < gridSize - 1) neighbors.push({ x: x + 1, y });
    
    // Column rail neighbors (same X, different Y)
    if (y > 0) neighbors.push({ x, y: y - 1 });
    if (y < gridSize - 1) neighbors.push({ x, y: y + 1 });
    
    return neighbors;
  }

  /**
   * Heuristic function (Euclidean distance in isometric space)
   */
  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Find an unreserved parking spot
   */
  private findUnreservedParkingSpot(): { x: number; y: number } | null {
    const parkingSpots = this.getParkingSpots();
    
    for (const spot of parkingSpots) {
      if (!spot.reserved) {
        return { x: spot.x, y: spot.y };
      }
    }
    
    return null;
  }

  /**
   * Reserve a parking spot
   */
  private reserveParkingSpot(x: number, y: number): boolean {
    const cellData = this.getCellData(x, y);
    if (cellData?.ploppable && cellData.ploppable.type === 'Parking Spot') {
      if (!cellData.ploppable.reserved) {
        cellData.ploppable.reserved = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Unreserve a parking spot
   */
  private unreserveParkingSpot(x: number, y: number): void {
    const cellData = this.getCellData(x, y);
    if (cellData?.ploppable && cellData.ploppable.type === 'Parking Spot') {
      cellData.ploppable.reserved = false;
    }
  }

  /**
   * Spawn a vehicle at a spawner
   */
  private spawnVehicle(pair: SpawnerDespawnerPair, gridSize: number): void {
    // Randomly determine if this vehicle is a potential parker
    const isPotentialParker = Math.random() < this.potentialParkerChance;
    
    let targetX = pair.despawnerX;
    let targetY = pair.despawnerY;
    let reservedSpot: { x: number; y: number } | null = null;
    
    // If potential parker, try to find and reserve a parking spot
    if (isPotentialParker) {
      reservedSpot = this.findUnreservedParkingSpot();
      if (reservedSpot && this.reserveParkingSpot(reservedSpot.x, reservedSpot.y)) {
        targetX = reservedSpot.x;
        targetY = reservedSpot.y;
      } else {
        // No unreserved spot found, continue to despawner
        reservedSpot = null;
      }
    }
    
    const path = this.findPath(
      pair.spawnerX,
      pair.spawnerY,
      targetX,
      targetY,
      gridSize
    );
    
    // Random speed with variance
    const speed = this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed);
    
    const vehicle = new VehicleEntity(
      pair.spawnerX,
      pair.spawnerY,
      pair.despawnerX,
      pair.despawnerY,
      path,
      speed,
      isPotentialParker
    );
    
    // Set reserved spot if found
    if (reservedSpot) {
      vehicle.reservedSpotX = reservedSpot.x;
      vehicle.reservedSpotY = reservedSpot.y;
    }
    
    // Set initial screen position
    const spawnScreenPos = isoToScreen(pair.spawnerX, pair.spawnerY);
    vehicle.screenX = spawnScreenPos.x;
    vehicle.screenY = spawnScreenPos.y;
    
    this.vehicles.push(vehicle);
  }

  /**
   * Update all vehicles and handle spawning
   */
  update(delta: number, gridSize: number, gridOffsetX: number, gridOffsetY: number): void {
    // Update spawn timers and spawn vehicles
    this.spawnerDespawnerPairs.forEach(pair => {
      const key = `${pair.spawnerX},${pair.spawnerY}`;
      const currentTime = this.spawnTimers.get(key) || 0;
      const newTime = currentTime - delta;
      
      if (newTime <= 0) {
        // Spawn a vehicle
        this.spawnVehicle(pair, gridSize);
        // Reset timer with some variance
        this.spawnTimers.set(key, this.spawnInterval + Math.random() * 1000);
      } else {
        this.spawnTimers.set(key, newTime);
      }
    });

    // Update all vehicles
    const vehiclesToRemove: string[] = [];
    
    this.vehicles.forEach(vehicle => {
      if (vehicle.state === 'despawning') {
        vehiclesToRemove.push(vehicle.id);
        return;
      }

      // Transition from spawning to moving immediately
      if (vehicle.state === 'spawning') {
        vehicle.state = 'moving';
      }

      if (vehicle.state === 'moving') {
        // Check if we have a valid path
        if (vehicle.path.length === 0) {
          // No path, despawn immediately
          vehicle.state = 'despawning';
        } else if (vehicle.currentPathIndex < vehicle.path.length) {
          const target = vehicle.path[vehicle.currentPathIndex];
          const targetScreenPos = isoToScreen(target.x, target.y);
          // Target position is relative to grid origin (0,0)
          const targetScreenX = targetScreenPos.x;
          const targetScreenY = targetScreenPos.y;
          
          // Vehicle screenX/screenY are also relative to grid origin
          // Calculate distance to target
          const dx = targetScreenX - vehicle.screenX;
          const dy = targetScreenY - vehicle.screenY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Move towards target
          const moveDistance = (vehicle.speed * delta) / 1000; // Convert to pixels per frame
          
          if (distance <= moveDistance || distance < 0.1) {
            // Reached current target
            vehicle.screenX = targetScreenX;
            vehicle.screenY = targetScreenY;
            vehicle.x = target.x;
            vehicle.y = target.y;
            vehicle.currentPathIndex++;
            
            // Check if reached destination
            if (vehicle.currentPathIndex >= vehicle.path.length) {
              // Check if we reached a reserved parking spot
              if (vehicle.reservedSpotX !== undefined && 
                  vehicle.reservedSpotY !== undefined &&
                  vehicle.x === vehicle.reservedSpotX &&
                  vehicle.y === vehicle.reservedSpotY) {
                // Start parking
                vehicle.state = 'parking';
                vehicle.parkingDuration = this.minParkingDuration + 
                  Math.random() * (this.maxParkingDuration - this.minParkingDuration);
                vehicle.parkingTimer = vehicle.parkingDuration;
              } else {
                // Reached despawner
                vehicle.state = 'despawning';
              }
            }
          } else {
            // Move towards target
            const moveX = (dx / distance) * moveDistance;
            const moveY = (dy / distance) * moveDistance;
            vehicle.screenX += moveX;
            vehicle.screenY += moveY;
            
            // Update grid position (snap to nearest grid cell)
            const isoPos = this.screenToIso(vehicle.screenX, vehicle.screenY);
            vehicle.x = Math.round(isoPos.x);
            vehicle.y = Math.round(isoPos.y);
          }
        } else {
          // Path completed
          if (vehicle.reservedSpotX !== undefined && 
              vehicle.reservedSpotY !== undefined &&
              vehicle.x === vehicle.reservedSpotX &&
              vehicle.y === vehicle.reservedSpotY) {
            // Start parking
            vehicle.state = 'parking';
            vehicle.parkingDuration = this.minParkingDuration + 
              Math.random() * (this.maxParkingDuration - this.minParkingDuration);
            vehicle.parkingTimer = vehicle.parkingDuration;
          } else {
            vehicle.state = 'despawning';
          }
        }
      } else if (vehicle.state === 'parking') {
        // Check if pedestrian has been spawned (only spawn once when entering parking state)
        if (this.pedestrianSystem) {
          const existingPedestrian = this.pedestrianSystem.getPedestrianByVehicleId(vehicle.id);
          if (!existingPedestrian && vehicle.parkingTimer === vehicle.parkingDuration) {
            // Just started parking and no pedestrian exists - spawn pedestrian
            this.pedestrianSystem.spawnPedestrianFromVehicle(
              vehicle.id,
              vehicle.x,
              vehicle.y
            );
          }
        }
        
        // Update parking timer
        if (vehicle.parkingTimer !== undefined) {
          vehicle.parkingTimer -= delta;
          
          if (vehicle.parkingTimer <= 0) {
            // Parking time is up, but check if pedestrian has returned
            if (this.pedestrianSystem) {
              const pedestrian = this.pedestrianSystem.getPedestrianByVehicleId(vehicle.id);
              
              // Only allow vehicle to leave if pedestrian is at vehicle (despawned at vehicle)
              if (pedestrian && pedestrian.state === 'at_vehicle') {
                // Pedestrian has returned, vehicle can leave
                if (vehicle.reservedSpotX !== undefined && vehicle.reservedSpotY !== undefined) {
                  this.unreserveParkingSpot(vehicle.reservedSpotX, vehicle.reservedSpotY);
                }
                
                // Create path to despawner
                const pathToDespawner = this.findPath(
                  vehicle.x,
                  vehicle.y,
                  vehicle.despawnerX,
                  vehicle.despawnerY,
                  gridSize
                );
                
                vehicle.path = pathToDespawner;
                vehicle.currentPathIndex = 0;
                vehicle.state = 'leaving';
                vehicle.reservedSpotX = undefined;
                vehicle.reservedSpotY = undefined;
              }
              // If pedestrian hasn't returned yet, vehicle waits (parking timer stays at 0)
            } else {
              // No pedestrian system, vehicle can leave immediately
              if (vehicle.reservedSpotX !== undefined && vehicle.reservedSpotY !== undefined) {
                this.unreserveParkingSpot(vehicle.reservedSpotX, vehicle.reservedSpotY);
              }
              
              // Create path to despawner
              const pathToDespawner = this.findPath(
                vehicle.x,
                vehicle.y,
                vehicle.despawnerX,
                vehicle.despawnerY,
                gridSize
              );
              
              vehicle.path = pathToDespawner;
              vehicle.currentPathIndex = 0;
              vehicle.state = 'leaving';
              vehicle.reservedSpotX = undefined;
              vehicle.reservedSpotY = undefined;
            }
          }
        }
      } else if (vehicle.state === 'leaving') {
        // Same movement logic as 'moving' state
        if (vehicle.path.length === 0) {
          vehicle.state = 'despawning';
        } else if (vehicle.currentPathIndex < vehicle.path.length) {
          const target = vehicle.path[vehicle.currentPathIndex];
          const targetScreenPos = isoToScreen(target.x, target.y);
          const targetScreenX = targetScreenPos.x;
          const targetScreenY = targetScreenPos.y;
          
          const dx = targetScreenX - vehicle.screenX;
          const dy = targetScreenY - vehicle.screenY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const moveDistance = (vehicle.speed * delta) / 1000;
          
          if (distance <= moveDistance || distance < 0.1) {
            vehicle.screenX = targetScreenX;
            vehicle.screenY = targetScreenY;
            vehicle.x = target.x;
            vehicle.y = target.y;
            vehicle.currentPathIndex++;
            
            if (vehicle.currentPathIndex >= vehicle.path.length) {
              vehicle.state = 'despawning';
            }
          } else {
            const moveX = (dx / distance) * moveDistance;
            const moveY = (dy / distance) * moveDistance;
            vehicle.screenX += moveX;
            vehicle.screenY += moveY;
            
            const isoPos = this.screenToIso(vehicle.screenX, vehicle.screenY);
            vehicle.x = Math.round(isoPos.x);
            vehicle.y = Math.round(isoPos.y);
          }
        } else {
          vehicle.state = 'despawning';
        }
      }
    });

    // Remove despawned vehicles
    this.vehicles = this.vehicles.filter(v => !vehiclesToRemove.includes(v.id));
  }

  /**
   * Convert screen coordinates to isometric grid coordinates
   */
  private screenToIso(screenX: number, screenY: number): { x: number; y: number } {
    const isoX = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2;
    const isoY = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2;
    return { x: isoX, y: isoY };
  }

  /**
   * Get all active vehicles
   */
  getVehicles(): VehicleEntity[] {
    return this.vehicles;
  }

  /**
   * Clear all vehicles (useful for reset)
   */
  clearVehicles(): void {
    this.vehicles = [];
  }
}
