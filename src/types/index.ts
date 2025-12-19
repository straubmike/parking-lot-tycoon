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
}

export interface NPC {
  id: string;
  x: number;
  y: number;
  targetSpace?: string;
  state: 'entering' | 'parking' | 'leaving';
}

export interface CellData {
  // Visual representation
  color?: number;
  
  // Game entity (if ploppable exists on this cell)
  ploppable?: Ploppable;
  
  // Cell state
  isOccupied?: boolean;
  
  // Additional properties can be added here as needed
  // e.g., terrain type, elevation, ownership, etc.
}

