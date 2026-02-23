import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { VehicleEntity } from '@/entities/Vehicle';
import { PedestrianEntity } from '@/entities/Pedestrian';
import { isoToScreen } from '@/utils/isometric';

/**
 * Vehicle sprite variant: [upTextureKey, downTextureKey, scale].
 * "Up" = screen-Y decreasing (nose top-left); "down" = screen-Y increasing (nose bottom-right).
 * Scale is relative to VEHICLE_SPRITE_SCALE (1.0 = default size, <1 = smaller, >1 = larger).
 */
export type VehicleVariant = [string, string, number];

/** Sprites used for vehicles that intend to park. */
export const PARKER_VARIANTS: VehicleVariant[] = [
  ['car1u', 'car1d', 1.0],
  ['car2u', 'car2d', 1.0],
  ['car3u', 'car3d', 1.0],
];

/** Sprites used for vehicles that are just passing through (includes cars + larger vehicles). */
export const NON_PARKER_VARIANTS: VehicleVariant[] = [
  ['car1u', 'car1d', 1.0],
  ['car2u', 'car2d', 1.0],
  ['car3u', 'car3d', 1.0],
  ['bus1u', 'bus1d', 2.0],
  ['truck1u', 'truck1d', 1.25],
];

/** All unique variants (union of both pools) — used for preloading and sprite lookup by index. */
export const VEHICLE_VARIANTS: VehicleVariant[] = (() => {
  const seen = new Set<string>();
  const all: VehicleVariant[] = [];
  for (const v of [...PARKER_VARIANTS, ...NON_PARKER_VARIANTS]) {
    if (!seen.has(v[0])) { seen.add(v[0]); all.push(v); }
  }
  return all;
})();

/** Legacy convenience alias (variant 0) used by the sprite pool default texture. */
export const VEHICLE_TEXTURE_UP = VEHICLE_VARIANTS[0][0];

/** Ploppable type name -> sprite texture key (for types that have PNG sprites). */
export const PLOPPABLE_SPRITES: Record<string, string> = {
  'Trash Can': 'trashcan',
  'Bench': 'bench',
  'Street Light': 'lamp',
  'Tree': 'tree',
  'Shrub': 'shrub',
  'Flower Patch': 'flowers',
};

/** Per-sprite origin (0–1) and scale multiplier for ploppable sprites. */
export interface PloppableSpriteConfig {
  originX: number;
  originY: number;
  /** Scale multiplier applied to base tile-relative scale (1 = default). */
  scaleMultiplier: number;
}

export const PLOPPABLE_SPRITE_CONFIG: Record<string, PloppableSpriteConfig> = {
  'Trash Can': { originX: 0.5, originY: 1.0, scaleMultiplier: 0.25 },
  'Tree': { originX: 0.5, originY: 1.0, scaleMultiplier: 1.0 },
  'Shrub': { originX: 0.5, originY: 0.5, scaleMultiplier: 0.75 },
  'Flower Patch': { originX: 0.5, originY: 0.5, scaleMultiplier: 0.5 },
  'Street Light': { originX: 0.5, originY: 1.0, scaleMultiplier: 1.5 },
  'Bench': { originX: 0.5, originY: 0.5, scaleMultiplier: 0.75 },
};

/** Draw params for one vehicle sprite: position, texture, flip, and scale multiplier. */
export interface VehicleDrawParams {
  x: number;
  y: number;
  textureKey: string;
  flipX: boolean;
  /** Variant-specific scale multiplier (applied on top of VEHICLE_SPRITE_SCALE). */
  scaleMultiplier: number;
}

/**
 * EntityRenderer - Handles rendering of vehicles and pedestrians
 */
export class EntityRenderer {
  /**
   * Get draw params for a single vehicle (position, texture, flip) for use with sprites.
   * Isometric screen direction: movement "up" on screen = decreasing screen Y; "down" = increasing Y.
   * Art convention: car1u = drawn for upward travel (nose top-left), car1d = for downward (nose bottom-right).
   * Flip depends on texture: car1u faces left (flip for North/up-right); car1d faces right (flip for South/down-left).
   * North (screenDx>0, screenDy<0): car1u, face right -> flipX true. West (screenDx<0, screenDy<0): car1u, face left -> flipX false.
   * South (screenDx<0, screenDy>0): car1d, face left -> flipX true. East (screenDx>0, screenDy>0): car1d, face right -> flipX false.
   */
  static getVehicleDrawParams(
    vehicle: VehicleEntity,
    gridOffsetX: number,
    gridOffsetY: number
  ): VehicleDrawParams {
    const x = vehicle.screenX + gridOffsetX;
    const y = vehicle.screenY + gridOffsetY;

    let screenDx = 0;
    let screenDy = 0;

    const path = vehicle.path;
    const idx = vehicle.currentPathIndex;
    if (path.length >= 2 && idx < path.length) {
      const prev = idx === 0
        ? { x: vehicle.x, y: vehicle.y }
        : path[idx - 1];
      const next = path[idx];
      const prevScreen = isoToScreen(prev.x, prev.y);
      const nextScreen = isoToScreen(next.x, next.y);
      screenDx = nextScreen.x - prevScreen.x;
      screenDy = nextScreen.y - prevScreen.y;
    } else if (path.length >= 2) {
      // At end of path (e.g. parked): use last segment
      const prev = path[path.length - 2];
      const next = path[path.length - 1];
      const prevScreen = isoToScreen(prev.x, prev.y);
      const nextScreen = isoToScreen(next.x, next.y);
      screenDx = nextScreen.x - prevScreen.x;
      screenDy = nextScreen.y - prevScreen.y;
    }

    const movingUp = screenDy < 0;
    const variant = VEHICLE_VARIANTS[vehicle.spriteVariant ?? 0] ?? VEHICLE_VARIANTS[0];
    const textureKey = movingUp ? variant[0] : variant[1];
    const flipX = movingUp ? screenDx > 0 : screenDx < 0;
    const scaleMultiplier = variant[2];

    return { x, y, textureKey, flipX, scaleMultiplier };
  }

  /**
   * Draw all vehicles (legacy graphics path; used only when sprite pool is not available).
   */
  static drawVehicles(
    vehicles: VehicleEntity[],
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    graphics.clear();

    vehicles.forEach(vehicle => {
      const { x: screenX, y: screenY } = EntityRenderer.getVehicleDrawParams(
        vehicle,
        gridOffsetX,
        gridOffsetY
      );
      const halfWidth = (TILE_WIDTH / 2) * 0.7;
      const halfHeight = (TILE_HEIGHT / 2) * 0.7;
      graphics.fillStyle(0xff0000, 1);
      graphics.beginPath();
      graphics.moveTo(screenX, screenY - halfHeight);
      graphics.lineTo(screenX + halfWidth, screenY);
      graphics.lineTo(screenX, screenY + halfHeight);
      graphics.lineTo(screenX - halfWidth, screenY);
      graphics.closePath();
      graphics.fillPath();
    });
  }

  /**
   * Draw all pedestrians
   */
  static drawPedestrians(
    pedestrians: PedestrianEntity[],
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    graphics.clear();
    
    pedestrians.forEach(pedestrian => {
      // Draw blue upright rectangle (tall and narrow)
      const width = (TILE_WIDTH / 2) * 0.25; // 25% of tile width (narrower)
      const height = (TILE_HEIGHT / 2) * 1.0; // 100% of tile height (taller)
      
      // Pedestrian position in screen coordinates
      // This position represents the base midpoint (feet position) on the pedestrian rail
      const screenX = pedestrian.screenX + gridOffsetX;
      const screenY = pedestrian.screenY + gridOffsetY;
      
      // Draw upright rectangle with base at the pedestrian's position
      // The base (bottom) center is at (screenX, screenY) where the feet are
      graphics.fillStyle(0x0000ff, 1); // Blue
      graphics.fillRect(
        screenX - width / 2,  // Left edge (centered horizontally)
        screenY - height,      // Top edge (base is at screenY)
        width,                 // Width
        height                 // Height
      );
      
      // Draw a small circle at the rail connection point (base of feet)
      graphics.fillStyle(0xffff00, 1); // Yellow dot
      graphics.fillCircle(screenX, screenY, 3); // 3 pixel radius
      
      // Draw a larger circle at the destination cell (cell center)
      // Show destination when going to destination, show vehicle when returning, show need target when fulfilling needs
      if ((pedestrian.state === 'going_to_need' || pedestrian.state === 'fulfilling_need') && 
          pedestrian.needTargetX !== undefined && pedestrian.needTargetY !== undefined) {
        // Show need fulfillment target location
        const needScreenPos = isoToScreen(pedestrian.needTargetX, pedestrian.needTargetY);
        const needScreenX = needScreenPos.x + gridOffsetX;
        const needScreenY = needScreenPos.y + gridOffsetY;
        
        graphics.lineStyle(2, 0xff00ff, 1); // Magenta outline
        graphics.fillStyle(0xff00ff, 0.3); // Magenta fill with transparency
        graphics.fillCircle(needScreenX, needScreenY, 8); // 8 pixel radius
        graphics.strokeCircle(needScreenX, needScreenY, 8);
      } else if (pedestrian.state === 'going_to_destination' && pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined) {
        const destScreenPos = isoToScreen(pedestrian.destinationX, pedestrian.destinationY);
        const destScreenX = destScreenPos.x + gridOffsetX;
        const destScreenY = destScreenPos.y + gridOffsetY;
        
        graphics.lineStyle(2, 0xffaa00, 1); // Orange outline
        graphics.fillStyle(0xffaa00, 0.3); // Orange fill with transparency
        graphics.fillCircle(destScreenX, destScreenY, 8); // 8 pixel radius
        graphics.strokeCircle(destScreenX, destScreenY, 8);
      } else if (pedestrian.state === 'returning_to_vehicle') {
        // Show vehicle location when returning
        const vehicleScreenPos = isoToScreen(pedestrian.vehicleX, pedestrian.vehicleY);
        const vehicleScreenX = vehicleScreenPos.x + gridOffsetX;
        const vehicleScreenY = vehicleScreenPos.y + gridOffsetY;
        
        graphics.lineStyle(2, 0x00ff00, 1); // Green outline
        graphics.fillStyle(0x00ff00, 0.3); // Green fill with transparency
        graphics.fillCircle(vehicleScreenX, vehicleScreenY, 8); // 8 pixel radius
        graphics.strokeCircle(vehicleScreenX, vehicleScreenY, 8);
      }
    });
  }
}

