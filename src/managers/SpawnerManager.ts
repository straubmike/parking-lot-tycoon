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
    
    // Remove from grid
    const spawnerCellData = gridManager.getCellData(pair.spawnerX, pair.spawnerY);
    if (spawnerCellData) {
      const newSpawnerData = { ...spawnerCellData };
      delete newSpawnerData.vehicleSpawner;
      gridManager.setCellData(pair.spawnerX, pair.spawnerY, newSpawnerData);
    }
    
    const despawnerCellData = gridManager.getCellData(pair.despawnerX, pair.despawnerY);
    if (despawnerCellData) {
      const newDespawnerData = { ...despawnerCellData };
      delete newDespawnerData.vehicleDespawner;
      gridManager.setCellData(pair.despawnerX, pair.despawnerY, newDespawnerData);
    }
    
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
   * Rebuild spawner-despawner pairs from grid data
   * Uses a simple nearest-neighbor approach to pair spawners with despawners
   */
  static rebuildSpawnerPairsFromGrid(
    gridManager: GridManager,
    gridSize: number,
    vehicleSystem: VehicleSystem,
    pedestrianSystem: PedestrianSystem
  ): void {
    // Clear existing pairs and vehicles
    vehicleSystem.clearVehicles();
    
    // Find all spawners and despawners
    const spawners: { x: number; y: number }[] = [];
    const despawners: { x: number; y: number }[] = [];
    
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const cellData = gridManager.getCellData(x, y);
        if (cellData?.vehicleSpawner) {
          spawners.push({ x, y });
        }
        if (cellData?.vehicleDespawner) {
          despawners.push({ x, y });
        }
      }
    }
    
    // Pair each spawner with the nearest despawner
    const usedDespawners = new Set<string>();
    
    spawners.forEach(spawner => {
      let nearestDespawner: { x: number; y: number } | null = null;
      let minDistance = Infinity;
      
      for (const despawner of despawners) {
        const key = `${despawner.x},${despawner.y}`;
        if (!usedDespawners.has(key)) {
          // Calculate Manhattan distance
          const distance = Math.abs(spawner.x - despawner.x) + Math.abs(spawner.y - despawner.y);
          if (distance < minDistance) {
            minDistance = distance;
            nearestDespawner = { x: despawner.x, y: despawner.y };
          }
        }
      }
      
      if (nearestDespawner !== null && nearestDespawner !== undefined) {
        const pair: SpawnerDespawnerPair = {
          spawnerX: spawner.x,
          spawnerY: spawner.y,
          despawnerX: nearestDespawner.x,
          despawnerY: nearestDespawner.y
        };
        vehicleSystem.addSpawnerDespawnerPair(pair);
        usedDespawners.add(`${nearestDespawner.x},${nearestDespawner.y}`);
      }
    });
    
    // Rebuild pedestrian spawners
    pedestrianSystem.clearPedestrians();
    
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const cellData = gridManager.getCellData(x, y);
        if (cellData?.ploppable?.type === 'Pedestrian Spawner') {
          pedestrianSystem.addDestination(x, y);
        }
      }
    }
  }
}

