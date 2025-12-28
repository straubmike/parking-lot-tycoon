import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { VehicleEntity } from '@/entities/Vehicle';
import { PedestrianEntity } from '@/entities/Pedestrian';
import { isoToScreen } from '@/utils/isometric';

/**
 * EntityRenderer - Handles rendering of vehicles and pedestrians
 */
export class EntityRenderer {
  /**
   * Draw all vehicles
   */
  static drawVehicles(
    vehicles: VehicleEntity[],
    graphics: Phaser.GameObjects.Graphics,
    gridOffsetX: number,
    gridOffsetY: number
  ): void {
    graphics.clear();
    
    vehicles.forEach(vehicle => {
      // Draw red diamond smaller than a cell, matching isometric orientation
      const halfWidth = (TILE_WIDTH / 2) * 0.7; // Match isometric width ratio
      const halfHeight = (TILE_HEIGHT / 2) * 0.7; // Match isometric height ratio
      
      // Vehicle position in screen coordinates
      const screenX = vehicle.screenX + gridOffsetX;
      const screenY = vehicle.screenY + gridOffsetY;
      
      // Draw diamond shape matching isometric tile orientation
      // Points: top, right, bottom, left (same as isometric cells)
      graphics.fillStyle(0xff0000, 1); // Red
      graphics.beginPath();
      graphics.moveTo(screenX, screenY - halfHeight); // Top
      graphics.lineTo(screenX + halfWidth, screenY); // Right
      graphics.lineTo(screenX, screenY + halfHeight); // Bottom
      graphics.lineTo(screenX - halfWidth, screenY); // Left
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

