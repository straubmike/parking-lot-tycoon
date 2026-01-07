import { Pedestrian } from '@/types';

export class PedestrianEntity implements Pedestrian {
  id: string;
  name?: string;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  speed: number;
  path: { x: number; y: number }[];
  currentPathIndex: number;
  vehicleId: string;
  vehicleX: number;
  vehicleY: number;
  destinationX?: number;
  destinationY?: number;
  state: 'spawning' | 'going_to_destination' | 'at_destination' | 'despawned' | 'respawning' | 'returning_to_vehicle' | 'at_vehicle' | 'going_to_need' | 'fulfilling_need';
  respawnTimer?: number;
  respawnDuration?: number;
  // Need system fields
  currentNeed?: 'trash' | 'thirst' | 'toilet' | null;
  needTargetPloppableId?: string;
  needTargetX?: number;
  needTargetY?: number;
  needFulfillmentTimer?: number;
  needFulfillmentStartTime?: number;
  satisfaction?: number;
  rating?: number;
  unfulfilledNeeds?: ('trash' | 'thirst' | 'toilet')[];
  actualPathTiles?: { x: number; y: number }[];

  constructor(
    vehicleId: string,
    vehicleX: number,
    vehicleY: number,
    destinationX: number,
    destinationY: number,
    path: { x: number; y: number }[],
    speed: number,
    respawnDuration: number,
    name?: string
  ) {
    this.id = `pedestrian-${Date.now()}-${Math.random()}`;
    this.vehicleId = vehicleId;
    this.vehicleX = vehicleX;
    this.vehicleY = vehicleY;
    this.destinationX = destinationX;
    this.destinationY = destinationY;
    this.path = path;
    this.currentPathIndex = 0;
    this.speed = speed;
    this.state = 'spawning';
    this.respawnDuration = respawnDuration;
    this.respawnTimer = respawnDuration;
    this.name = name;
    
    // Initialize personal variables
    this.satisfaction = 50; // Default satisfaction
    this.rating = 0; // Will be calculated later
    
    // Initialize unfulfilled needs list
    this.unfulfilledNeeds = [];
    
    // Initialize actual path tracking (includes starting position)
    this.actualPathTiles = [{ x: vehicleX, y: vehicleY }];
    
    // Start at vehicle position
    this.x = vehicleX;
    this.y = vehicleY;
    this.screenX = 0;
    this.screenY = 0;
  }
}
