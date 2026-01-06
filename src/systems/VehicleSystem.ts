import { SpawnerDespawnerPair, CellData, Ploppable } from '@/types';
import { VehicleEntity } from '@/entities/Vehicle';
import { isoToScreen } from '@/utils/isometric';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { PedestrianSystem } from './PedestrianSystem';
import { PathfindingSystem, EdgeBlockedCallback, MoveCostCallback } from './PathfindingSystem';
import { GameSystems } from '@/core/GameSystems';
import { ParkingTimerSystem } from './ParkingTimerSystem';
import { MessageSystem } from './MessageSystem';

export class VehicleSystem {
  private vehicles: VehicleEntity[] = [];
  private spawnerDespawnerPairs: SpawnerDespawnerPair[] = [];
  private spawnTimers: Map<string, number> = new Map(); // Key: `${spawnerX},${spawnerY}`, Value: time until next spawn
  private readonly spawnInterval: number = 3000; // Spawn every 3 seconds (constant for now)
  private readonly minSpeed: number = 30; // Minimum pixels per second
  private readonly maxSpeed: number = 60; // Maximum pixels per second
  private readonly speedBumpMaxSpeed: number = 30; // Maximum speed on speed bump (pixels per second)
  private readonly potentialParkerChance: number = 0.5; // 50% chance to be a potential parker
  private readonly minParkingDuration: number = 5000; // Minimum parking time (5 seconds)
  private readonly maxParkingDuration: number = 15000; // Maximum parking time (15 seconds)
  private getCellData: (x: number, y: number) => CellData | undefined;
  private getParkingSpots: () => Ploppable[];
  private pedestrianSystem?: PedestrianSystem;
  private pathfindingSystem: PathfindingSystem;
  private gridWidth: number;
  private gridHeight: number;

  constructor(
    gridWidth: number,
    gridHeight: number,
    getCellData: (x: number, y: number) => CellData | undefined,
    getParkingSpots: () => Ploppable[],
    isEdgeBlocked: EdgeBlockedCallback,
    getMoveCost?: MoveCostCallback,
    pedestrianSystem?: PedestrianSystem
  ) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.getCellData = getCellData;
    this.getParkingSpots = getParkingSpots;
    this.pedestrianSystem = pedestrianSystem;
    
    // Initialize pathfinding system
    this.pathfindingSystem = new PathfindingSystem(
      gridWidth,
      gridHeight,
      getCellData,
      isEdgeBlocked,
      getMoveCost
    );
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
   * Find a spawner-despawner pair by either spawner or despawner coordinates
   * Returns the pair if found, or null if not found
   */
  findPairByCell(cellX: number, cellY: number): SpawnerDespawnerPair | null {
    return this.spawnerDespawnerPairs.find(
      p => (p.spawnerX === cellX && p.spawnerY === cellY) ||
           (p.despawnerX === cellX && p.despawnerY === cellY)
    ) || null;
  }

  /**
   * Find an unreserved parking spot that is reachable from the given position
   */
  private findUnreservedParkingSpot(fromX: number, fromY: number): { x: number; y: number } | null {
    const parkingSpots = this.getParkingSpots();
    
    // Shuffle parking spots to add variety in which spots get chosen
    const shuffled = [...parkingSpots].sort(() => Math.random() - 0.5);
    
    for (const spot of shuffled) {
      if (!spot.reserved) {
        // Check if we can actually path to this spot
        const path = this.pathfindingSystem.findPath(fromX, fromY, spot.x, spot.y, 'vehicle');
        if (path.length > 0 || (fromX === spot.x && fromY === spot.y)) {
          return { x: spot.x, y: spot.y };
        }
      }
    }
    
    return null;
  }

  /**
   * Reserve a parking spot
   */
  private reserveParkingSpot(x: number, y: number): boolean {
    const cellData = this.getCellData(x, y);
    if (cellData?.ploppable && (cellData.ploppable.type === 'Parking Spot' || cellData.ploppable.type === 'Parking Meter')) {
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
    if (cellData?.ploppable && (cellData.ploppable.type === 'Parking Spot' || cellData.ploppable.type === 'Parking Meter')) {
      cellData.ploppable.reserved = false;
    }
  }

  /**
   * Spawn a vehicle at a spawner
   */
  private spawnVehicle(pair: SpawnerDespawnerPair): void {
    // Randomly determine if this vehicle is a potential parker
    const isPotentialParker = Math.random() < this.potentialParkerChance;
    
    let targetX = pair.despawnerX;
    let targetY = pair.despawnerY;
    let reservedSpot: { x: number; y: number } | null = null;
    
    // If potential parker, try to find and reserve a parking spot
    if (isPotentialParker) {
      reservedSpot = this.findUnreservedParkingSpot(pair.spawnerX, pair.spawnerY);
      if (reservedSpot && this.reserveParkingSpot(reservedSpot.x, reservedSpot.y)) {
        targetX = reservedSpot.x;
        targetY = reservedSpot.y;
      } else {
        // No reachable unreserved spot found, continue to despawner
        reservedSpot = null;
      }
    }
    
    // Find path using A* pathfinding
    const path = this.pathfindingSystem.findPath(
      pair.spawnerX,
      pair.spawnerY,
      targetX,
      targetY,
      'vehicle'
    );
    
    // If no path found and we reserved a spot, unreserve it and try for despawner
    if (path.length === 0 && reservedSpot) {
      this.unreserveParkingSpot(reservedSpot.x, reservedSpot.y);
      reservedSpot = null;
      targetX = pair.despawnerX;
      targetY = pair.despawnerY;
      
      // Try to find path to despawner
      const despawnerPath = this.pathfindingSystem.findPath(
        pair.spawnerX,
        pair.spawnerY,
        targetX,
        targetY,
        'vehicle'
      );
      
      if (despawnerPath.length === 0) {
        // Can't even reach despawner, don't spawn
        console.warn('Vehicle cannot find path from spawner to despawner');
        return;
      }
      
      // Use despawner path
      path.push(...despawnerPath);
    } else if (path.length === 0 && !reservedSpot) {
      // Not a parker and can't reach despawner
      console.warn('Vehicle cannot find path from spawner to despawner');
      return;
    }
    
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
    
    // Register potential parker with rating system
    if (isPotentialParker) {
      if (reservedSpot !== null) {
        // Found a spot - register with initial score of 70
        GameSystems.rating.registerParker(vehicle.id, 70);
      } else {
        // No spot available - register with initial score of 0
        GameSystems.rating.registerParker(vehicle.id, 0);
        // Show message about not finding a spot
        if (vehicle.name) {
          MessageSystem.noSpotAvailable(vehicle.name);
        }
      }
    }
  }

  /**
   * Update all vehicles and handle spawning
   */
  update(delta: number, _gridWidth: number, _gridHeight: number, _gridOffsetX: number, _gridOffsetY: number): void {
    // Update spawn timers and spawn vehicles
    this.spawnerDespawnerPairs.forEach(pair => {
      const key = `${pair.spawnerX},${pair.spawnerY}`;
      const currentTime = this.spawnTimers.get(key) || 0;
      const newTime = currentTime - delta;
      
      if (newTime <= 0) {
        // Spawn a vehicle
        this.spawnVehicle(pair);
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
        // Cancel parking timer if still active (vehicle despawned without paying at booth)
        ParkingTimerSystem.getInstance().cancelParkingTimer(vehicle.id);
        // Apply penalties and finalize parker's score before removing
        if (vehicle.isPotentialParker) {
          // Apply -10 penalty if drove on more than 2 concrete tiles
          if ((vehicle.concreteTileCount || 0) > 2) {
            GameSystems.rating.updateParkerScore(vehicle.id, -10);
          }
          
          // Get unfulfilled needs penalty from pedestrian (if exists)
          if (this.pedestrianSystem) {
            const pedestrian = this.pedestrianSystem.getPedestrianByVehicleId(vehicle.id);
            if (pedestrian && pedestrian.unfulfilledNeeds && pedestrian.unfulfilledNeeds.length > 0) {
              // Apply -10 for each unfulfilled need
              GameSystems.rating.updateParkerScore(vehicle.id, -10 * pedestrian.unfulfilledNeeds.length);
            }
          }
          
          // Ensure score doesn't go below 0
          const currentScore = GameSystems.rating.getParkerScore(vehicle.id);
          if (currentScore !== undefined && currentScore < 0) {
            // Adjust score back to 0 (add the difference)
            GameSystems.rating.updateParkerScore(vehicle.id, -currentScore);
          }
          
          GameSystems.rating.finalizeParker(vehicle.id);
        }
        vehiclesToRemove.push(vehicle.id);
        return;
      }

      // Transition from spawning to moving immediately
      if (vehicle.state === 'spawning') {
        vehicle.state = 'moving';
      }

      if (vehicle.state === 'moving') {
        this.updateMovingVehicle(vehicle, delta);
      } else if (vehicle.state === 'parking') {
        this.updateParkingVehicle(vehicle, delta);
      } else if (vehicle.state === 'leaving') {
        this.updateLeavingVehicle(vehicle, delta);
      }
    });

    // Remove despawned vehicles
    this.vehicles = this.vehicles.filter(v => !vehiclesToRemove.includes(v.id));
  }

  /**
   * Update a vehicle in the 'moving' state
   */
  private updateMovingVehicle(vehicle: VehicleEntity, delta: number): void {
    // Check if we have a valid path
    if (vehicle.path.length === 0) {
      vehicle.state = 'despawning';
      return;
    }
    
    if (vehicle.currentPathIndex < vehicle.path.length) {
      const reachedTarget = this.moveVehicleTowardsTarget(vehicle, delta);
      
      if (reachedTarget) {
        vehicle.currentPathIndex++;
        
        // Check if reached end of path
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
      }
    } else {
      // Path completed
      if (vehicle.reservedSpotX !== undefined && 
          vehicle.reservedSpotY !== undefined &&
          vehicle.x === vehicle.reservedSpotX &&
          vehicle.y === vehicle.reservedSpotY) {
        vehicle.state = 'parking';
        vehicle.parkingDuration = this.minParkingDuration + 
          Math.random() * (this.maxParkingDuration - this.minParkingDuration);
        vehicle.parkingTimer = vehicle.parkingDuration;
      } else {
        vehicle.state = 'despawning';
      }
    }
  }

  /**
   * Update a vehicle in the 'parking' state
   */
  private updateParkingVehicle(vehicle: VehicleEntity, delta: number): void {
    // Start parking timer when first entering parking state
    if (vehicle.parkingTimer === vehicle.parkingDuration) {
      // Just started parking - start the parking timer system
      ParkingTimerSystem.getInstance().startParkingTimer(vehicle.id);
    }
    
    // Spawn pedestrian when first entering parking state
    if (this.pedestrianSystem) {
      const existingPedestrian = this.pedestrianSystem.getPedestrianByVehicleId(vehicle.id);
      if (!existingPedestrian && vehicle.parkingTimer === vehicle.parkingDuration) {
        // Just started parking and no pedestrian exists - spawn pedestrian
        this.pedestrianSystem.spawnPedestrianFromVehicle(
          vehicle.id,
          vehicle.x,
          vehicle.y,
          vehicle.name
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
          
          // Only allow vehicle to leave if pedestrian is at vehicle
          if (pedestrian && pedestrian.state === 'at_vehicle') {
            this.startVehicleLeaving(vehicle);
          }
          // If pedestrian hasn't returned yet, vehicle waits
        } else {
          // No pedestrian system, vehicle can leave immediately
          this.startVehicleLeaving(vehicle);
        }
      }
    }
  }

  /**
   * Start a parked vehicle leaving towards the despawner
   */
  private startVehicleLeaving(vehicle: VehicleEntity): void {
    // Check if parking spot has a meter and collect fee
    if (vehicle.reservedSpotX !== undefined && vehicle.reservedSpotY !== undefined) {
      const cellData = this.getCellData(vehicle.reservedSpotX, vehicle.reservedSpotY);
      if (cellData?.ploppable?.type === 'Parking Meter') {
        // Collect parking meter fee (this will cancel the timer internally)
        ParkingTimerSystem.getInstance().collectMeterFee(vehicle.id);
      } else {
        // No meter, cancel timer (vehicle will pay at booth if they pass through one)
        // Don't cancel here - let them pay at booth if they encounter one
      }
    }
    
    // Unreserve the parking spot
    if (vehicle.reservedSpotX !== undefined && vehicle.reservedSpotY !== undefined) {
      this.unreserveParkingSpot(vehicle.reservedSpotX, vehicle.reservedSpotY);
    }
    
    // Roll a new random speed for leaving (between minSpeed and maxSpeed)
    vehicle.speed = this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed);
    
    // Find path to despawner
    const pathToDespawner = this.pathfindingSystem.findPath(
      vehicle.x,
      vehicle.y,
      vehicle.despawnerX,
      vehicle.despawnerY,
      'vehicle'
    );
    
    if (pathToDespawner.length === 0 && 
        !(vehicle.x === vehicle.despawnerX && vehicle.y === vehicle.despawnerY)) {
      // Can't find path to despawner, just despawn
      console.warn('Parked vehicle cannot find path to despawner, despawning immediately');
      vehicle.state = 'despawning';
      return;
    }
    
    vehicle.path = pathToDespawner;
    vehicle.currentPathIndex = 0;
    vehicle.state = 'leaving';
    vehicle.reservedSpotX = undefined;
    vehicle.reservedSpotY = undefined;
  }

  /**
   * Update a vehicle in the 'leaving' state
   */
  private updateLeavingVehicle(vehicle: VehicleEntity, delta: number): void {
    if (vehicle.path.length === 0) {
      vehicle.state = 'despawning';
      return;
    }
    
    if (vehicle.currentPathIndex < vehicle.path.length) {
      const reachedTarget = this.moveVehicleTowardsTarget(vehicle, delta);
      
      if (reachedTarget) {
        vehicle.currentPathIndex++;
        
        if (vehicle.currentPathIndex >= vehicle.path.length) {
          vehicle.state = 'despawning';
        }
      }
    } else {
      vehicle.state = 'despawning';
    }
  }

  /**
   * Move vehicle towards its current path target
   * Returns true if the target was reached
   */
  private moveVehicleTowardsTarget(vehicle: VehicleEntity, delta: number): boolean {
    const target = vehicle.path[vehicle.currentPathIndex];
    const targetScreenPos = isoToScreen(target.x, target.y);
    const targetScreenX = targetScreenPos.x;
    const targetScreenY = targetScreenPos.y;
    
    const dx = targetScreenX - vehicle.screenX;
    const dy = targetScreenY - vehicle.screenY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const moveDistance = (vehicle.speed * delta) / 1000;
    
    if (distance <= moveDistance || distance < 0.1) {
      // Reached target
      vehicle.screenX = targetScreenX;
      vehicle.screenY = targetScreenY;
      vehicle.x = target.x;
      vehicle.y = target.y;
      
      // Check for parking booth collection tile
      this.checkParkingBooth(vehicle);
      
      // Check for speed bump on new cell and adjust speed
      this.checkSpeedBump(vehicle);
      
      // Check for concrete tile and increment counter
      this.checkConcreteTile(vehicle);
      return true;
    } else {
      // Move towards target
      const moveX = (dx / distance) * moveDistance;
      const moveY = (dy / distance) * moveDistance;
      vehicle.screenX += moveX;
      vehicle.screenY += moveY;
      
      // Update grid position
      const isoPos = this.screenToIso(vehicle.screenX, vehicle.screenY);
      const newGridX = Math.round(isoPos.x);
      const newGridY = Math.round(isoPos.y);
      
      // Check if grid position changed
      if (newGridX !== vehicle.x || newGridY !== vehicle.y) {
        vehicle.x = newGridX;
        vehicle.y = newGridY;
        
        // Check for parking booth collection tile
        this.checkParkingBooth(vehicle);
        
        // Check for speed bump on new cell and adjust speed
        this.checkSpeedBump(vehicle);
        
        // Check for concrete tile and increment counter
        this.checkConcreteTile(vehicle);
      }
      return false;
    }
  }
  
  /**
   * Check if vehicle is on a parking booth collection tile and collect fee
   */
  private checkParkingBooth(vehicle: VehicleEntity): void {
    const cellData = this.getCellData(vehicle.x, vehicle.y);
    if (cellData?.ploppable?.type === 'Parking Booth' && cellData.ploppable.subType === 'COLLECTION') {
      // Vehicle entered booth collection tile - collect fee
      ParkingTimerSystem.getInstance().collectBoothFee(vehicle.id);
    }
  }

  /**
   * Check if vehicle is on a speed bump and reduce speed if necessary
   */
  private checkSpeedBump(vehicle: VehicleEntity): void {
    const cellData = this.getCellData(vehicle.x, vehicle.y);
    if (cellData?.ploppable?.type === 'Speed Bump') {
      // If vehicle is faster than speed bump limit, reduce speed
      if (vehicle.speed > this.speedBumpMaxSpeed) {
        vehicle.speed = this.speedBumpMaxSpeed;
      }
    }
  }

  /**
   * Check if vehicle is on a concrete tile and increment counter
   * Concrete tiles are identified by color 0xffffff (white)
   * Shows a message when exceeding 2 concrete tiles (only once per vehicle)
   */
  private checkConcreteTile(vehicle: VehicleEntity): void {
    const cellData = this.getCellData(vehicle.x, vehicle.y);
    if (cellData?.color === 0xffffff) {
      // Vehicle is on a concrete tile
      vehicle.concreteTileCount = (vehicle.concreteTileCount || 0) + 1;
      
      // Show sidewalk message when exceeding threshold (only once)
      if (vehicle.concreteTileCount === 3 && !vehicle.sidewalkMessageShown && vehicle.name) {
        MessageSystem.droveonSidewalk(vehicle.name);
        vehicle.sidewalkMessageShown = true;
      }
    }
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

  /**
   * Update grid size (e.g., when loading a new map)
   */
  setGridSize(size: number): void {
    this.gridSize = size;
    this.pathfindingSystem.setGridSize(size);
  }
}
