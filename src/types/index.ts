// TypeScript type definitions for the game

export interface GameConfig {
  width: number;
  height: number;
  backgroundColor: string;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  lotSize: { width: number; height: number };
  budget: number;
  winConditions: WinCondition[];
}

export interface WinCondition {
  type: 'profit' | 'rating' | 'time' | 'custom';
  value: number;
  description: string;
}

export interface ParkingLot {
  width: number;
  height: number;
  spaces: Ploppable[];
}

export interface Ploppable {
  id: string;
  type: string;
  x: number;
  y: number;
  cost: number;
  orientation?: number; // 0=north (default), 1=east, 2=south, 3=west
  orientationType?: 'A' | 'B'; // A = border midpoint position, B = central with rotation indicator
  reserved?: boolean; // For parking spots: true if reserved by a vehicle
  passable?: boolean; // Whether pedestrians and vehicles can pass through
  subType?: 'BOOTH' | 'COLLECTION'; // For Parking Booth: BOOTH = drawn tile (impassable), COLLECTION = collection tile (passable)
  parkingSpotOrientation?: number; // For Parking Meter: stores the original parking spot orientation (missing edge) for drawing spot lines
}

export interface NPC {
  id: string;
  x: number;
  y: number;
  targetSpace?: string;
  state: 'entering' | 'parking' | 'leaving';
}

export interface Vehicle {
  id: string;
  x: number; // Grid X position
  y: number; // Grid Y position
  screenX: number; // Screen X position (for smooth movement)
  screenY: number; // Screen Y position (for smooth movement)
  speed: number; // Movement speed (pixels per second)
  path: { x: number; y: number }[]; // Path from spawner to despawner (grid coordinates)
  currentPathIndex: number; // Current target in path
  spawnerX: number; // Grid X of spawner
  spawnerY: number; // Grid Y of spawner
  despawnerX: number; // Grid X of despawner
  despawnerY: number; // Grid Y of despawner
  state: 'spawning' | 'moving' | 'parking' | 'leaving' | 'despawning';
  isPotentialParker?: boolean; // True if this vehicle might park
  reservedSpotX?: number; // Grid X of reserved parking spot
  reservedSpotY?: number; // Grid Y of reserved parking spot
  parkingTimer?: number; // Time remaining parked (milliseconds)
  parkingDuration?: number; // Total time to park (milliseconds)
}

export interface SpawnerDespawnerPair {
  spawnerX: number;
  spawnerY: number;
  despawnerX: number;
  despawnerY: number;
}

export interface Pedestrian {
  id: string;
  x: number; // Grid X position (cell center, integer)
  y: number; // Grid Y position (cell center, integer)
  screenX: number; // Screen X position (for smooth movement)
  screenY: number; // Screen Y position (for smooth movement)
  speed: number; // Movement speed (pixels per second)
  path: { x: number; y: number }[]; // Path on cell grid (integer coordinates)
  currentPathIndex: number; // Current target in path
  vehicleId: string; // ID of associated vehicle (driver)
  vehicleX: number; // Grid X of vehicle (parking spot)
  vehicleY: number; // Grid Y of vehicle (parking spot)
  destinationX?: number; // Grid X of destination (spawner/de-respawner)
  destinationY?: number; // Grid Y of destination (spawner/de-respawner)
  state: 'spawning' | 'going_to_destination' | 'at_destination' | 'despawned' | 'respawning' | 'returning_to_vehicle' | 'at_vehicle' | 'going_to_need' | 'fulfilling_need';
  respawnTimer?: number; // Time remaining before respawn (milliseconds)
  respawnDuration?: number; // Total time to wait before respawn (milliseconds)
  // Need system fields
  currentNeed?: 'trash' | 'thirst' | 'toilet' | null; // Current need the pedestrian has
  needTargetPloppableId?: string; // ID of the ploppable that fulfills this need
  needTargetX?: number; // Grid X where they need to go to fulfill the need
  needTargetY?: number; // Grid Y where they need to go to fulfill the need
  needFulfillmentTimer?: number; // Timer for vending machine (in game minutes)
  needFulfillmentStartTime?: number; // Game time (minutes) when they arrived at the vending machine
  // Personal variables for later use (lot rating, satisfaction, etc.)
  satisfaction?: number; // Satisfaction rating (0-100)
  rating?: number; // Personal rating contribution
}

export interface CellData {
  // Visual representation
  color?: number;
  
  // Game entity (if ploppable exists on this cell)
  ploppable?: Ploppable;
  
  // Vehicle spawner/despawner
  vehicleSpawner?: boolean;  // True if this cell is a vehicle spawner
  vehicleDespawner?: boolean;  // True if this cell is a vehicle despawner
  
  // Cell state
  isOccupied?: boolean;
  isPermanent?: boolean;  // Permanent tiles cannot be edited during gameplay
  
  // Edge lines (0=top, 1=right, 2=bottom, 3=left)
  edges?: {
    top?: number;      // Color hex for top edge line
    right?: number;    // Color hex for right edge line
    bottom?: number;   // Color hex for bottom edge line
    left?: number;     // Color hex for left edge line
  };
  
  // Directional travel permissions (for lane line directionality)
  // true = travel allowed in that direction, false = blocked by lane line
  canNorth?: boolean;  // Can travel north (to y-1, decreasing Y)
  canSouth?: boolean;  // Can travel south (to y+1, increasing Y)
  canEast?: boolean;   // Can travel east (to x+1, increasing X)
  canWest?: boolean;   // Can travel west (to x-1, decreasing X)
  
  // Appeal and safety values (initialized to 0)
  appeal?: number;  // Cell appeal value (affected by ploppables with AoE)
  safety?: number;  // Cell safety value (affected by ploppables with AoE)
  
  // Surface behavior properties
  behavesLikeSidewalk?: boolean;  // If true, cell behaves like concrete sidewalk for pedestrian pathfinding (used by Crosswalk)
  
  // Additional properties can be added here as needed
  // e.g., terrain type, elevation, ownership, etc.
}
