import { Vehicle } from '@/types';
import { MessageSystem } from '@/systems/MessageSystem';

export class VehicleEntity implements Vehicle {
  id: string;
  name?: string;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  speed: number;
  path: { x: number; y: number }[];
  currentPathIndex: number;
  spawnerX: number;
  spawnerY: number;
  despawnerX: number;
  despawnerY: number;
  state: 'spawning' | 'moving' | 'parking' | 'leaving' | 'despawning';
  isPotentialParker?: boolean;
  reservedSpotX?: number;
  reservedSpotY?: number;
  parkingTimer?: number;
  parkingDuration?: number;
  concreteTileCount?: number;
  sidewalkMessageShown?: boolean;
  spriteVariant?: number;

  constructor(
    spawnerX: number,
    spawnerY: number,
    despawnerX: number,
    despawnerY: number,
    path: { x: number; y: number }[],
    speed: number,
    isPotentialParker: boolean = false,
    spriteVariant: number = 0
  ) {
    this.id = `vehicle-${Date.now()}-${Math.random()}`;
    this.spawnerX = spawnerX;
    this.spawnerY = spawnerY;
    this.despawnerX = despawnerX;
    this.despawnerY = despawnerY;
    this.path = path;
    this.currentPathIndex = 0;
    this.speed = speed;
    this.state = 'moving'; // Start in moving state immediately
    this.isPotentialParker = isPotentialParker;
    
    // Start at spawner position
    this.x = spawnerX;
    this.y = spawnerY;
    // Screen position will be set by the system
    this.screenX = 0;
    this.screenY = 0;
    
    // Initialize concrete tile counter
    this.concreteTileCount = 0;
    this.sidewalkMessageShown = false;
    this.spriteVariant = spriteVariant;
    
    // Generate a name for potential parkers
    if (isPotentialParker) {
      this.name = MessageSystem.generateParkerName();
    }
  }
}
