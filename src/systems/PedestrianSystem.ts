import { CellData } from '@/types';
import { PedestrianEntity } from '@/entities/Pedestrian';
import { isoToScreen } from '@/utils/isometric';
import { PathfindingSystem, EdgeBlockedCallback } from './PathfindingSystem';

export class PedestrianSystem {
  private pedestrians: PedestrianEntity[] = [];
  private destinations: Set<string> = new Set(); // Key: `${destinationX},${destinationY}` - destinations (de/respawners)
  private readonly minSpeed: number = 20; // Minimum pixels per second
  private readonly maxSpeed: number = 40; // Maximum pixels per second
  private readonly minRespawnDuration: number = 5000; // Minimum respawn time (5 seconds)
  private readonly maxRespawnDuration: number = 15000; // Maximum respawn time (15 seconds)
  private gridWidth: number;
  private gridHeight: number;
  private getDestinations: () => { x: number; y: number }[]; // Get all destination spawners
  private pathfindingSystem: PathfindingSystem;

  constructor(
    gridWidth: number,
    gridHeight: number,
    getCellData: (x: number, y: number) => CellData | undefined,
    getDestinations: () => { x: number; y: number }[],
    isEdgeBlocked: EdgeBlockedCallback
  ) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.getDestinations = getDestinations;
    
    // Initialize pathfinding system
    this.pathfindingSystem = new PathfindingSystem(
      gridWidth,
      gridHeight,
      getCellData,
      isEdgeBlocked
    );
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
    // Find a random destination from available destinations that is reachable
    const destinations = this.getDestinations();
    if (destinations.length === 0) {
      // No destinations available, don't spawn
      return;
    }
    
    // Shuffle destinations and try to find a reachable one
    const shuffled = [...destinations].sort(() => Math.random() - 0.5);
    
    let selectedDestination: { x: number; y: number } | null = null;
    let pathToDestination: { x: number; y: number }[] = [];
    
    for (const dest of shuffled) {
      const path = this.pathfindingSystem.findPath(
        vehicleX,
        vehicleY,
        dest.x,
        dest.y,
        'pedestrian'
      );
      
      if (path.length > 0 || (vehicleX === dest.x && vehicleY === dest.y)) {
        selectedDestination = dest;
        pathToDestination = path;
        break;
      }
    }
    
    if (!selectedDestination) {
      // No reachable destination, don't spawn pedestrian
      console.warn('Pedestrian cannot find path to any destination');
      return;
    }
    
    // Random speed and respawn duration
    const speed = this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed);
    const respawnDuration = this.minRespawnDuration + 
      Math.random() * (this.maxRespawnDuration - this.minRespawnDuration);
    
    const pedestrian = new PedestrianEntity(
      vehicleId,
      vehicleX,
      vehicleY,
      selectedDestination.x,
      selectedDestination.y,
      pathToDestination,
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
   * Update all pedestrians
   */
  update(delta: number, _gridWidth: number, _gridHeight: number, _gridOffsetX: number, _gridOffsetY: number): void {
    // Track pedestrians to remove (if their vehicle left without them somehow)
    const pedestriansToRemove: string[] = [];
    
    this.pedestrians.forEach(pedestrian => {
      // Handle spawning state - transition to going_to_destination
      if (pedestrian.state === 'spawning') {
        pedestrian.state = 'going_to_destination';
      }
      
      // Handle going to destination
      if (pedestrian.state === 'going_to_destination') {
        this.updatePedestrianMoving(pedestrian, delta, 'destination');
      }
      
      // Handle despawned state - count down respawn timer
      if (pedestrian.state === 'despawned') {
        if (pedestrian.respawnTimer !== undefined) {
          pedestrian.respawnTimer -= delta;
          
          if (pedestrian.respawnTimer <= 0) {
            // Time to respawn - find path back to vehicle
            const pathToVehicle = this.pathfindingSystem.findPath(
              pedestrian.x,
              pedestrian.y,
              pedestrian.vehicleX,
              pedestrian.vehicleY,
              'pedestrian'
            );
            
            if (pathToVehicle.length > 0 || 
                (pedestrian.x === pedestrian.vehicleX && pedestrian.y === pedestrian.vehicleY)) {
              pedestrian.path = pathToVehicle;
              pedestrian.currentPathIndex = 0;
              pedestrian.state = 'respawning';
              pedestrian.respawnTimer = undefined;
            } else {
              // Can't find path back to vehicle - teleport (edge case)
              console.warn('Pedestrian cannot find path back to vehicle, teleporting');
              pedestrian.x = pedestrian.vehicleX;
              pedestrian.y = pedestrian.vehicleY;
              const vehicleScreenPos = isoToScreen(pedestrian.vehicleX, pedestrian.vehicleY);
              pedestrian.screenX = vehicleScreenPos.x;
              pedestrian.screenY = vehicleScreenPos.y;
              pedestrian.state = 'at_vehicle';
            }
          }
        }
      }
      
      // Handle respawning state - transition to returning_to_vehicle
      if (pedestrian.state === 'respawning') {
        pedestrian.state = 'returning_to_vehicle';
      }
      
      // Handle returning to vehicle
      if (pedestrian.state === 'returning_to_vehicle') {
        this.updatePedestrianMoving(pedestrian, delta, 'vehicle');
      }
    });
    
    // Remove any pedestrians marked for removal
    this.pedestrians = this.pedestrians.filter(p => !pedestriansToRemove.includes(p.id));
  }

  /**
   * Update a pedestrian that is moving (either to destination or to vehicle)
   */
  private updatePedestrianMoving(
    pedestrian: PedestrianEntity,
    delta: number,
    targetType: 'destination' | 'vehicle'
  ): void {
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
        
        // Check if reached final destination
        if (pedestrian.currentPathIndex >= pedestrian.path.length) {
          this.handlePedestrianArrival(pedestrian, targetType);
        }
      } else {
        // Move towards target
        const moveX = (dx / distance) * moveDistance;
        const moveY = (dy / distance) * moveDistance;
        pedestrian.screenX += moveX;
        pedestrian.screenY += moveY;
        
        // Update grid position based on progress
        this.updatePedestrianGridPosition(pedestrian, target);
      }
    } else {
      // Path completed or empty, check if at destination
      this.handlePedestrianArrival(pedestrian, targetType);
    }
  }

  /**
   * Handle pedestrian arriving at their destination
   */
  private handlePedestrianArrival(
    pedestrian: PedestrianEntity,
    targetType: 'destination' | 'vehicle'
  ): void {
    if (targetType === 'destination') {
      if (pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined &&
          pedestrian.x === pedestrian.destinationX && pedestrian.y === pedestrian.destinationY) {
        // Reached destination - despawn but keep entity
        pedestrian.state = 'despawned';
        pedestrian.respawnTimer = pedestrian.respawnDuration;
      }
    } else {
      if (pedestrian.x === pedestrian.vehicleX && pedestrian.y === pedestrian.vehicleY) {
        // Reached vehicle - mark as at_vehicle so vehicle can leave
        pedestrian.state = 'at_vehicle';
      }
    }
  }

  /**
   * Update pedestrian's grid position based on movement progress
   */
  private updatePedestrianGridPosition(
    pedestrian: PedestrianEntity,
    target: { x: number; y: number }
  ): void {
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
    
    // Update grid position when more than halfway to target
    if (totalDistance > 0 && currentDistance / totalDistance > 0.5) {
      pedestrian.x = target.x;
      pedestrian.y = target.y;
    }
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

  /**
   * Update grid size (e.g., when loading a new map)
   */
  setGridSize(size: number): void {
    this.gridSize = size;
    this.pathfindingSystem.setGridSize(size);
  }
}
