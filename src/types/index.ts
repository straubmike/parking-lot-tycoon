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
  reserved?: boolean; // For parking spots: true if reserved by a vehicle
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
  
  // Additional properties can be added here as needed
  // e.g., terrain type, elevation, ownership, etc.
}
