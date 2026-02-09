import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GridManager } from '@/core/GridManager';
import { SpawnerDespawnerPair } from '@/types';
import { VehicleSystem } from '@/systems/VehicleSystem';
import { PedestrianSystem } from '@/systems/PedestrianSystem';

/**
 * SpawnerManager - Manages vehicle and pedestrian spawners/despawners
 */
export class SpawnerManager {
  /**
   * Draw vehicle spawner/despawner and return the label for management
   */
  static drawVehicleSpawnerDespawner(
    gridX: number,
    gridY: number,
    cellData: any,
    scene: Phaser.Scene,
    gridOffsetX: number,
    gridOffsetY: number
  ): Phaser.GameObjects.Text | null {
    if (!cellData?.vehicleSpawner && !cellData?.vehicleDespawner) return null;
    
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
    
    // Create emoji label
    const emoji = cellData.vehicleSpawner ? '🚗' : '🎯';
    const label = scene.add.text(screenX, screenY, emoji, {
      fontSize: '24px',
    });
    
    // Center the text
    label.setOrigin(0.5, 0.5);
    label.setDepth(3); // Draw on top of grid
    
    return label;
  }

  /**
   * Draw pedestrian spawner and return the label for management
   */
  static drawPedestrianSpawner(
    gridX: number,
    gridY: number,
    cellData: any,
    scene: Phaser.Scene,
    gridOffsetX: number,
    gridOffsetY: number
  ): Phaser.GameObjects.Text | null {
    if (cellData?.ploppable?.type !== 'Pedestrian Spawner') return null;
    
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + gridOffsetY;
    
    // Create emoji label
    const label = scene.add.text(screenX, screenY, '🚶', {
      fontSize: '24px',
    });
    
    // Center the text
    label.setOrigin(0.5, 0.5);
    label.setDepth(3); // Draw on top of grid
    
    return label;
  }

  /**
   * Add a vehicle spawner-despawner pair
   */
  static addVehicleSpawnerPair(
    spawnerX: number,
    spawnerY: number,
    despawnerX: number,
    despawnerY: number,
    gridManager: GridManager,
    vehicleSystem: VehicleSystem
  ): void {
    // Set cell data
    gridManager.setCellData(spawnerX, spawnerY, { vehicleSpawner: true });
    gridManager.setCellData(despawnerX, despawnerY, { vehicleDespawner: true });
    
    // Register with vehicle system
    const pair: SpawnerDespawnerPair = {
      spawnerX,
      spawnerY,
      despawnerX,
      despawnerY
    };
    vehicleSystem.addSpawnerDespawnerPair(pair);
  }

  /**
   * Remove a vehicle spawner-despawner pair
   */
  static removeVehicleSpawnerPair(
    spawnerX: number,
    spawnerY: number,
    gridManager: GridManager,
    vehicleSystem: VehicleSystem
  ): void {
    // Find the pair
    const pair = vehicleSystem.findPairByCell(spawnerX, spawnerY);
    if (!pair) return;
    
    // Remove from grid - use undefined to properly delete properties
    gridManager.setCellData(pair.spawnerX, pair.spawnerY, { vehicleSpawner: undefined as any });
    gridManager.setCellData(pair.despawnerX, pair.despawnerY, { vehicleDespawner: undefined as any });
    
    // Remove from vehicle system
    vehicleSystem.removeSpawnerDespawnerPair(spawnerX, spawnerY);
  }

  /**
   * Add a pedestrian spawner (destination)
   */
  static addPedestrianSpawner(
    x: number,
    y: number,
    gridManager: GridManager,
    pedestrianSystem: PedestrianSystem
  ): void {
    // Note: Pedestrian spawners are stored as ploppables, so this just registers with the system
    pedestrianSystem.addDestination(x, y);
  }

  /**
   * Remove a pedestrian spawner (destination)
   */
  static removePedestrianSpawner(
    x: number,
    y: number,
    pedestrianSystem: PedestrianSystem
  ): void {
    pedestrianSystem.removeDestination(x, y);
  }

  /**
   * Rebuild spawner-despawner pairs from grid data.
   * If explicitPairs is provided (e.g. from loaded JSON), those pairs are used so spawner A only paths to despawner A.
   * Otherwise uses nearest-neighbor to pair spawners with despawners.
   */
  static rebuildSpawnerPairsFromGrid(
    gridManager: GridManager,
    gridWidth: number,
    gridHeight: number,
    vehicleSystem: VehicleSystem,
    pedestrianSystem: PedestrianSystem,
    explicitPairs?: Array<[number, number, number, number]>
  ): void {
    vehicleSystem.clearVehicles();

    if (explicitPairs?.length) {
      for (const [spawnerX, spawnerY, despawnerX, despawnerY] of explicitPairs) {
        vehicleSystem.addSpawnerDespawnerPair({
          spawnerX,
          spawnerY,
          despawnerX,
          despawnerY
        });
      }
    } else {
      const spawners: { x: number; y: number }[] = [];
      const despawners: { x: number; y: number }[] = [];

      for (let x = 0; x < gridWidth; x++) {
        for (let y = 0; y < gridHeight; y++) {
          const cellData = gridManager.getCellData(x, y);
          if (cellData?.vehicleSpawner) spawners.push({ x, y });
          if (cellData?.vehicleDespawner) despawners.push({ x, y });
        }
      }

      const usedDespawners = new Set<string>();
      spawners.forEach(spawner => {
        let nearest: { x: number; y: number } | null = null;
        let minDist = Infinity;
        for (const d of despawners) {
          const key = `${d.x},${d.y}`;
          if (usedDespawners.has(key)) continue;
          const dist = Math.abs(spawner.x - d.x) + Math.abs(spawner.y - d.y);
          if (dist < minDist) {
            minDist = dist;
            nearest = d;
          }
        }
        if (nearest) {
          usedDespawners.add(`${nearest.x},${nearest.y}`);
          vehicleSystem.addSpawnerDespawnerPair({
            spawnerX: spawner.x,
            spawnerY: spawner.y,
            despawnerX: nearest.x,
            despawnerY: nearest.y
          });
        }
      });
    }

    pedestrianSystem.clearPedestrians();
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        const cellData = gridManager.getCellData(x, y);
        if (cellData?.ploppable?.type === 'Pedestrian Spawner') {
          pedestrianSystem.addDestination(x, y);
        }
      }
    }
  }
}

