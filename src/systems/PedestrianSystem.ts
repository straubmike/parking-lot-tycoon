import { CellData, Ploppable } from '@/types';
import { PedestrianEntity } from '@/entities/Pedestrian';
import { isoToScreen } from '@/utils/isometric';
import { PathfindingSystem, EdgeBlockedCallback, MoveCostCallback } from './PathfindingSystem';
import { NeedsSystem } from './NeedsSystem';
import { GridManager } from '@/core/GridManager';
import { TimeSystem } from './TimeSystem';
import { MessageSystem } from './MessageSystem';
import { GameSystems } from '@/core/GameSystems';

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
  private gridManager: GridManager;
  private needGenerationProbability: number; // Probability (0-1) that a pedestrian will have a need
  private needTypeDistribution: Record<'trash' | 'thirst' | 'toilet', number>; // Distribution weights for each need type (must sum to 1.0)

  constructor(
    gridWidth: number,
    gridHeight: number,
    getCellData: (x: number, y: number) => CellData | undefined,
    getDestinations: () => { x: number; y: number }[],
    isEdgeBlocked: EdgeBlockedCallback,
    gridManager: GridManager,
    needGenerationProbability: number = 0, // Default to 0 for backward compatibility
    getMoveCost?: MoveCostCallback // Optional move cost callback for concrete tile preference
  ) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.getDestinations = getDestinations;
    this.gridManager = gridManager;
    this.needGenerationProbability = needGenerationProbability;
    
    // Initialize need type distribution (default: 50% trash, 50% thirst)
    this.needTypeDistribution = { trash: 0.5, thirst: 0.5, toilet: 0 };
    
    // Initialize pathfinding system with move cost callback for concrete tile preference
    this.pathfindingSystem = new PathfindingSystem(
      gridWidth,
      gridHeight,
      getCellData,
      isEdgeBlocked,
      getMoveCost
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
   * Generate a random need for a pedestrian based on probability and need type distribution
   */
  private generateNeed(): 'trash' | 'thirst' | 'toilet' | null {
    // First check: should we generate a need at all?
    const randomValue = Math.random();
    if (randomValue >= this.needGenerationProbability) {
      return null;
    }
    
    // Second check: which specific need type based on distribution
    const randomNeedValue = Math.random();
    let cumulative = 0;
    
    for (const [needType, weight] of Object.entries(this.needTypeDistribution)) {
      cumulative += weight;
      if (randomNeedValue < cumulative) {
        return needType as 'trash' | 'thirst' | 'toilet';
      }
    }
    
    // Fallback (shouldn't happen if distribution is valid, but just in case)
    return 'trash';
  }

  /**
   * Find a ploppable that fulfills the given need and is reachable from the start position
   */
  private findReachablePloppableForNeed(
    needType: 'trash' | 'thirst' | 'toilet',
    startX: number,
    startY: number
  ): Ploppable | null {
    const ploppables = NeedsSystem.getPloppablesForNeed(
      needType,
      this.gridManager,
      this.gridWidth,
      this.gridHeight
    );
    
    if (ploppables.length === 0) {
      return null;
    }
    
    // Shuffle ploppables and try to find a reachable one
    const shuffled = [...ploppables].sort(() => Math.random() - 0.5);
    
    for (const ploppable of shuffled) {
      const target = NeedsSystem.getNeedTargetPosition(ploppable);
      const path = this.pathfindingSystem.findPath(
        startX,
        startY,
        target.x,
        target.y,
        'pedestrian'
      );
      
      if (path.length > 0 || (startX === target.x && startY === target.y)) {
        return ploppable;
      }
    }
    
    return null;
  }

  /**
   * Set up a need for a pedestrian and find path to fulfillment location
   * If a need is generated but cannot be fulfilled, it's added to unfulfilledNeeds
   */
  private setupNeedForPedestrian(
    pedestrian: PedestrianEntity,
    startX: number,
    startY: number
  ): boolean {
    const needType = this.generateNeed();
    if (!needType) {
      return false; // No need generated
    }
    
    const ploppable = this.findReachablePloppableForNeed(needType, startX, startY);
    if (!ploppable) {
      // Need was generated but no reachable ploppable found - track as unfulfilled
      if (!pedestrian.unfulfilledNeeds) {
        pedestrian.unfulfilledNeeds = [];
      }
      pedestrian.unfulfilledNeeds.push(needType);
      
      // Show message about unfulfilled need
      if (pedestrian.name) {
        if (needType === 'thirst') {
          MessageSystem.thirstUnfulfilled(pedestrian.name);
        } else if (needType === 'toilet') {
          MessageSystem.toiletUnfulfilled(pedestrian.name);
        } else if (needType === 'trash') {
          MessageSystem.trashUnfulfilled(pedestrian.name);
        }
      }
      
      return false;
    }
    
    // Set need information
    pedestrian.currentNeed = needType;
    pedestrian.needTargetPloppableId = ploppable.id;
    const target = NeedsSystem.getNeedTargetPosition(ploppable);
    pedestrian.needTargetX = target.x;
    pedestrian.needTargetY = target.y;
    
    // Find path to need fulfillment location
    const pathToNeed = this.pathfindingSystem.findPath(
      startX,
      startY,
      target.x,
      target.y,
      'pedestrian'
    );
    
    if (pathToNeed.length > 0 || (startX === target.x && startY === target.y)) {
      pedestrian.path = pathToNeed;
      pedestrian.currentPathIndex = 0;
      return true;
    }
    
    // Couldn't find path - track as unfulfilled need
    if (!pedestrian.unfulfilledNeeds) {
      pedestrian.unfulfilledNeeds = [];
    }
    pedestrian.unfulfilledNeeds.push(needType);
    
    // Show message about unfulfilled need
    if (pedestrian.name) {
      if (needType === 'thirst') {
        MessageSystem.thirstUnfulfilled(pedestrian.name);
      } else if (needType === 'toilet') {
        MessageSystem.toiletUnfulfilled(pedestrian.name);
      } else if (needType === 'trash') {
        MessageSystem.trashUnfulfilled(pedestrian.name);
      }
    }
    
    // Clear the need since it can't be fulfilled
    pedestrian.currentNeed = null;
    pedestrian.needTargetPloppableId = undefined;
    pedestrian.needTargetX = undefined;
    pedestrian.needTargetY = undefined;
    
    return false;
  }

  /**
   * Spawn a pedestrian from a vehicle (when vehicle parks)
   */
  spawnPedestrianFromVehicle(
    vehicleId: string,
    vehicleX: number,
    vehicleY: number,
    vehicleName?: string
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
      respawnDuration,
      vehicleName
    );
    
    // Set initial screen position (cell center at vehicle)
    const spawnScreenPos = isoToScreen(vehicleX, vehicleY);
    pedestrian.screenX = spawnScreenPos.x;
    pedestrian.screenY = spawnScreenPos.y;
    pedestrian.x = vehicleX;
    pedestrian.y = vehicleY;
    pedestrian.state = 'spawning';
    
    // Try to generate a need
    const hasNeed = this.setupNeedForPedestrian(pedestrian, vehicleX, vehicleY);
    if (hasNeed) {
      // If has need, will go to need fulfillment first, then destination
      pedestrian.state = 'spawning';
    } else {
      // No need, proceed normally to destination
      pedestrian.path = pathToDestination;
      pedestrian.currentPathIndex = 0;
    }
    
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
      // Handle spawning state - transition to appropriate state based on needs
      if (pedestrian.state === 'spawning') {
        if (pedestrian.currentNeed) {
          pedestrian.state = 'going_to_need';
        } else {
          pedestrian.state = 'going_to_destination';
        }
      }
      
      // Handle going to need fulfillment location
      if (pedestrian.state === 'going_to_need') {
        this.updatePedestrianMoving(pedestrian, delta, 'need');
      }
      
      // Handle fulfilling need (waiting at vending machine, or instant for trash can)
      if (pedestrian.state === 'fulfilling_need') {
        if (pedestrian.currentNeed === 'thirst' && pedestrian.needFulfillmentStartTime !== undefined) {
          // Check if timer has expired (2 in-game minutes)
          const timeSystem = TimeSystem.getInstance();
          const currentGameTime = timeSystem.getTotalMinutes();
          const elapsedMinutes = currentGameTime - pedestrian.needFulfillmentStartTime;
          
          // Handle day rollover (if game time rolled over midnight)
          const elapsedMinutesAdjusted = elapsedMinutes < 0 ? elapsedMinutes + 1440 : elapsedMinutes;
          
          if (elapsedMinutesAdjusted >= 2) {
            // Timer expired - need fulfilled, restore speed and continue to destination
            this.completeNeedFulfillment(pedestrian);
          }
        } else if (pedestrian.currentNeed === 'trash') {
          // Trash can is instant - need already fulfilled when reached
          this.completeNeedFulfillment(pedestrian);
        }
      }
      
      // Handle going to destination
      if (pedestrian.state === 'going_to_destination') {
        this.updatePedestrianMoving(pedestrian, delta, 'destination');
      }
      
      // Handle despawned state - count down respawn timer
      if (pedestrian.state === 'despawned') {
        // Check if this is a toilet need despawn (using needFulfillmentTimer) or normal despawn (using respawnTimer)
        if (pedestrian.needFulfillmentTimer !== undefined && pedestrian.currentNeed === 'toilet') {
          // Toilet need: count down the toilet timer
          pedestrian.needFulfillmentTimer -= delta;
          
          if (pedestrian.needFulfillmentTimer <= 0) {
            // Time to respawn at front face of toilet
            if (pedestrian.needTargetX !== undefined && pedestrian.needTargetY !== undefined) {
              // Respawn at the front face position
              pedestrian.x = pedestrian.needTargetX;
              pedestrian.y = pedestrian.needTargetY;
              const respawnScreenPos = isoToScreen(pedestrian.needTargetX, pedestrian.needTargetY);
              pedestrian.screenX = respawnScreenPos.x;
              pedestrian.screenY = respawnScreenPos.y;
              
              // Clear toilet need and continue to destination
              this.completeNeedFulfillment(pedestrian);
            } else {
              // Fallback: complete need fulfillment normally
              this.completeNeedFulfillment(pedestrian);
            }
          }
        } else if (pedestrian.respawnTimer !== undefined) {
          // Normal despawn (from destination): count down respawn timer
          pedestrian.respawnTimer -= delta;
          
          if (pedestrian.respawnTimer <= 0) {
            // Time to respawn - clear destination to indicate we're in return phase (going to vehicle)
            // This ensures that if they get a need, they'll continue to vehicle after fulfilling it
            pedestrian.destinationX = undefined;
            pedestrian.destinationY = undefined;
            
            // Try to generate a need first
            const hasNeed = this.setupNeedForPedestrian(pedestrian, pedestrian.x, pedestrian.y);
            if (hasNeed) {
              // Has need - go to need fulfillment first
              pedestrian.state = 'respawning';
              pedestrian.respawnTimer = undefined;
            } else {
              // No need - find path back to vehicle
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
                // Track final position and check concrete percentage
                if (!pedestrian.actualPathTiles) {
                  pedestrian.actualPathTiles = [];
                }
                const lastTile = pedestrian.actualPathTiles[pedestrian.actualPathTiles.length - 1];
                if (!lastTile || lastTile.x !== pedestrian.x || lastTile.y !== pedestrian.y) {
                  pedestrian.actualPathTiles.push({ x: pedestrian.x, y: pedestrian.y });
                }
                this.checkConcreteTilePercentage(pedestrian);
                pedestrian.state = 'at_vehicle';
              }
            }
          }
        }
      }
      
      // Handle respawning state - transition to appropriate state based on needs
      if (pedestrian.state === 'respawning') {
        if (pedestrian.currentNeed) {
          pedestrian.state = 'going_to_need';
        } else {
          pedestrian.state = 'returning_to_vehicle';
        }
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
   * Update a pedestrian that is moving (either to destination, to vehicle, or to need fulfillment)
   */
  private updatePedestrianMoving(
    pedestrian: PedestrianEntity,
    delta: number,
    targetType: 'destination' | 'vehicle' | 'need'
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
        
        // Track tile if grid position changed
        if (pedestrian.x !== target.x || pedestrian.y !== target.y) {
          if (!pedestrian.actualPathTiles) {
            pedestrian.actualPathTiles = [];
          }
          pedestrian.actualPathTiles.push({ x: target.x, y: target.y });
        }
        
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
        const oldX = pedestrian.x;
        const oldY = pedestrian.y;
        this.updatePedestrianGridPosition(pedestrian, target);
        
        // Track tile if grid position changed
        if ((pedestrian.x !== oldX || pedestrian.y !== oldY) && pedestrian.actualPathTiles) {
          // Check if we haven't already added this tile (avoid duplicates)
          const lastTile = pedestrian.actualPathTiles.length > 0 ? pedestrian.actualPathTiles[pedestrian.actualPathTiles.length - 1] : null;
          if (!lastTile || lastTile.x !== pedestrian.x || lastTile.y !== pedestrian.y) {
            pedestrian.actualPathTiles.push({ x: pedestrian.x, y: pedestrian.y });
          }
        }
      }
    } else {
      // Path completed or empty, check if at destination
      this.handlePedestrianArrival(pedestrian, targetType);
    }
  }

  /**
   * Complete need fulfillment and continue to destination
   * After fulfilling a need, pedestrian should continue to their next destination:
   * - If they spawned from vehicle (going to de/respawner): continue to de/respawner
   * - If they respawned (going to vehicle): continue to vehicle
   */
  private completeNeedFulfillment(pedestrian: PedestrianEntity): void {
    // Check for undefined/null explicitly (not falsy, since 0 is a valid coordinate)
    if (!pedestrian.currentNeed) {
      return;
    }
    
    const fulfilledNeedType = pedestrian.currentNeed;
    const ploppableId = pedestrian.needTargetPloppableId;
    
    // Determine next destination based on pedestrian's original destination
    // If their destinationX/Y matches a de/respawner location, they spawned from vehicle and should continue to de/respawner
    // If their destinationX/Y is undefined or they're coming from respawn phase, they should go to vehicle
    // We check if destination matches any de/respawner to determine if they're in initial spawn phase
    const destinations = this.getDestinations();
    const destinationIsDeRespawner = pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined &&
      destinations.some(d => d.x === pedestrian.destinationX && d.y === pedestrian.destinationY);
    const shouldGoToVehicle = !destinationIsDeRespawner; // If destination is NOT a de/respawner, we're in respawn phase
    
    let targetX: number;
    let targetY: number;
    let nextState: 'going_to_destination' | 'returning_to_vehicle';
    
    if (shouldGoToVehicle) {
      // Respawn phase: go to vehicle
      targetX = pedestrian.vehicleX;
      targetY = pedestrian.vehicleY;
      nextState = 'returning_to_vehicle';
    } else {
      // Initial spawn phase: continue to de/respawner
      if (pedestrian.destinationX === undefined || pedestrian.destinationY === undefined) {
        return;
      }
      targetX = pedestrian.destinationX;
      targetY = pedestrian.destinationY;
      nextState = 'going_to_destination';
    }
    
    // Clear need information
    pedestrian.currentNeed = null;
    pedestrian.needTargetPloppableId = undefined;
    pedestrian.needTargetX = undefined;
    pedestrian.needTargetY = undefined;
    pedestrian.needFulfillmentTimer = undefined;
    pedestrian.needFulfillmentStartTime = undefined;
    
    // Restore speed (was set to 0 for vending machine)
    if (pedestrian.speed === 0) {
      pedestrian.speed = this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed);
    }
    
    // Find path to target
    const pathToTarget = this.pathfindingSystem.findPath(
      pedestrian.x,
      pedestrian.y,
      targetX,
      targetY,
      'pedestrian'
    );
    
    if (pathToTarget.length > 0 || (pedestrian.x === targetX && pedestrian.y === targetY)) {
      pedestrian.path = pathToTarget;
      pedestrian.currentPathIndex = 0;
      pedestrian.state = nextState;
    } else {
      // Can't find path - handle based on phase
      if (shouldGoToVehicle) {
        console.warn('Pedestrian cannot find path to vehicle after need fulfillment');
        // Teleport to vehicle as fallback
        pedestrian.x = pedestrian.vehicleX;
        pedestrian.y = pedestrian.vehicleY;
        const vehicleScreenPos = isoToScreen(pedestrian.vehicleX, pedestrian.vehicleY);
        pedestrian.screenX = vehicleScreenPos.x;
        pedestrian.screenY = vehicleScreenPos.y;
        // Track final position and check concrete percentage
        if (!pedestrian.actualPathTiles) {
          pedestrian.actualPathTiles = [];
        }
        const lastTile = pedestrian.actualPathTiles[pedestrian.actualPathTiles.length - 1];
        if (!lastTile || lastTile.x !== pedestrian.x || lastTile.y !== pedestrian.y) {
          pedestrian.actualPathTiles.push({ x: pedestrian.x, y: pedestrian.y });
        }
        this.checkConcreteTilePercentage(pedestrian);
        pedestrian.state = 'at_vehicle';
      } else {
        console.warn('Pedestrian cannot find path to destination after need fulfillment');
        pedestrian.state = 'despawned';
        pedestrian.respawnTimer = pedestrian.respawnDuration;
      }
    }
  }

  /**
   * Handle pedestrian arriving at their destination
   */
  private handlePedestrianArrival(
    pedestrian: PedestrianEntity,
    targetType: 'destination' | 'vehicle' | 'need'
  ): void {
    if (targetType === 'destination') {
      if (pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined &&
          pedestrian.x === pedestrian.destinationX && pedestrian.y === pedestrian.destinationY) {
        // Reached destination - despawn but keep entity
        pedestrian.state = 'despawned';
        pedestrian.respawnTimer = pedestrian.respawnDuration;
      }
    } else if (targetType === 'vehicle') {
      if (pedestrian.x === pedestrian.vehicleX && pedestrian.y === pedestrian.vehicleY) {
        // Track final position
        if (!pedestrian.actualPathTiles) {
          pedestrian.actualPathTiles = [];
        }
        // Add final position if not already there
        const lastTile = pedestrian.actualPathTiles.length > 0 ? pedestrian.actualPathTiles[pedestrian.actualPathTiles.length - 1] : null;
        if (!lastTile || lastTile.x !== pedestrian.x || lastTile.y !== pedestrian.y) {
          pedestrian.actualPathTiles.push({ x: pedestrian.x, y: pedestrian.y });
        }
        
        // Calculate concrete tile percentage and apply penalty if needed
        this.checkConcreteTilePercentage(pedestrian);
        
        // Reached vehicle - mark as at_vehicle so vehicle can leave
        pedestrian.state = 'at_vehicle';
      }
    } else if (targetType === 'need') {
      // Check if reached need target
      if (pedestrian.needTargetX !== undefined && pedestrian.needTargetY !== undefined &&
          pedestrian.x === pedestrian.needTargetX && pedestrian.y === pedestrian.needTargetY) {
        // Find the ploppable to verify need fulfillment
        if (pedestrian.needTargetPloppableId) {
          // Find ploppable in grid
          let targetPloppable: Ploppable | null = null;
          for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight; y++) {
              const cellData = this.gridManager.getCellData(x, y);
              if (cellData && cellData.ploppable && cellData.ploppable.id === pedestrian.needTargetPloppableId) {
                targetPloppable = cellData.ploppable;
                break;
              }
            }
            if (targetPloppable) break;
          }
          
          if (targetPloppable && NeedsSystem.hasReachedNeedTarget(pedestrian.x, pedestrian.y, targetPloppable)) {
            // Reached need target - fulfill need
            if (NeedsSystem.needRequiresDespawn(pedestrian.currentNeed!)) {
              // Portable toilet: despawn, wait 2-10 seconds (real time), then respawn at front face
              // Store the respawn location (front face position)
              pedestrian.needTargetX = pedestrian.x;
              pedestrian.needTargetY = pedestrian.y;
              // Generate random wait time between 2-10 seconds (real time, which is 2-10 in-game minutes)
              const waitTimeSeconds = 2 + Math.random() * 8; // 2 to 10 seconds
              pedestrian.needFulfillmentTimer = waitTimeSeconds * 1000; // Convert to milliseconds
              pedestrian.state = 'despawned';
              // Clear path and position to make them invisible
              pedestrian.path = [];
              pedestrian.currentPathIndex = 0;
            } else if (NeedsSystem.needRequiresTimer(pedestrian.currentNeed!)) {
              // Vending machine: stop movement and start timer (2 in-game minutes)
              const timeSystem = TimeSystem.getInstance();
              pedestrian.needFulfillmentStartTime = timeSystem.getTotalMinutes();
              pedestrian.speed = 0; // Stop movement while waiting
              pedestrian.state = 'fulfilling_need';
            } else {
              // Trash can - instant fulfillment
              this.completeNeedFulfillment(pedestrian);
            }
          }
        }
      }
    }
  }

  /**
   * Check sidewalk tile percentage in pedestrian's actual path and apply penalty if < 50%
   * Sidewalk tiles include concrete (0xffffff) and tiles with behavesLikeSidewalk (e.g., Crosswalks)
   */
  private checkConcreteTilePercentage(pedestrian: PedestrianEntity): void {
    if (!pedestrian.actualPathTiles || pedestrian.actualPathTiles.length === 0) {
      return;
    }
    
    // Count sidewalk-like tiles (concrete or behavesLikeSidewalk)
    let sidewalkTileCount = 0;
    const uniqueTiles = new Set<string>();
    
    for (const tile of pedestrian.actualPathTiles) {
      const tileKey = `${tile.x},${tile.y}`;
      if (uniqueTiles.has(tileKey)) {
        continue; // Skip duplicates
      }
      uniqueTiles.add(tileKey);
      
      const cellData = this.gridManager.getCellData(tile.x, tile.y);
      // Count as sidewalk if it's concrete surface OR has behavesLikeSidewalk property (e.g., Crosswalks)
      if (cellData?.surfaceType === 'concrete' || cellData?.behavesLikeSidewalk === true) {
        sidewalkTileCount++;
      }
    }
    
    const totalUniqueTiles = uniqueTiles.size;
    const sidewalkPercentage = totalUniqueTiles > 0 ? (sidewalkTileCount / totalUniqueTiles) : 0;
    
    // Apply penalty if less than 50% sidewalk tiles
    if (sidewalkPercentage < 0.5 && pedestrian.name) {
      // Show message
      MessageSystem.insufficientSidewalk(pedestrian.name);
      
      // Apply -10 penalty to vehicle's rating
      const vehicleId = pedestrian.vehicleId;
      GameSystems.rating.updateParkerScore(vehicleId, -10);
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
   * Set need generation probability (0-1)
   * This controls whether a pedestrian gets ANY need at all
   */
  setNeedGenerationProbability(probability: number): void {
    this.needGenerationProbability = Math.max(0, Math.min(1, probability));
  }

  /**
   * Set the distribution of need types
   * @param distribution Object with need types as keys and weights (0-1) as values
   * Weights will be normalized to sum to 1.0 automatically
   * Example: { trash: 0.5, thirst: 0.5 } for 50/50 split
   * Example: { trash: 0.25, thirst: 0.25, toilet: 0.5 } for 25/25/50 split
   */
  setNeedTypeDistribution(distribution: Partial<Record<'trash' | 'thirst' | 'toilet', number>>): void {
    // Get default values for any missing need types
    const trashWeight = distribution.trash ?? 0;
    const thirstWeight = distribution.thirst ?? 0;
    const toiletWeight = distribution.toilet ?? 0;
    
    // Calculate total weight
    const totalWeight = trashWeight + thirstWeight + toiletWeight;
    
    // Normalize weights to sum to 1.0
    if (totalWeight > 0) {
      this.needTypeDistribution = {
        trash: trashWeight / totalWeight,
        thirst: thirstWeight / totalWeight,
        toilet: toiletWeight / totalWeight
      };
    } else {
      // If all weights are 0, default to 50/50 trash/thirst
      this.needTypeDistribution = { trash: 0.5, thirst: 0.5, toilet: 0 };
    }
  }

  /**
   * Get the current need type distribution
   */
  getNeedTypeDistribution(): Record<'trash' | 'thirst' | 'toilet', number> {
    return { ...this.needTypeDistribution };
  }
}
