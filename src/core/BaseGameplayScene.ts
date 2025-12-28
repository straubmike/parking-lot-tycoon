import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GridManager } from './GridManager';
import { GridRenderer } from '@/systems/GridRenderer';
import { PloppableManager } from '@/systems/PloppableManager';
import { SpawnerManager } from '@/managers/SpawnerManager';
import { EntityRenderer } from '@/renderers/EntityRenderer';
import { PathfindingUtilities } from '@/utils/PathfindingUtilities';
import { VehicleSystem } from '@/systems/VehicleSystem';
import { PedestrianSystem } from '@/systems/PedestrianSystem';
import { GameSystems } from './GameSystems';
import { Ploppable } from '@/types';

/**
 * BaseGameplayScene - Base class for gameplay scenes (dev mode, challenges, etc.)
 * 
 * Provides:
 * - Grid management and rendering
 * - Entity systems (vehicles, pedestrians)
 * - Update loop structure
 * - Grid positioning
 * - Basic camera setup
 * - UI updates
 */
export abstract class BaseGameplayScene extends Phaser.Scene {
  // Core systems
  protected gridManager!: GridManager;
  protected vehicleSystem!: VehicleSystem;
  protected pedestrianSystem!: PedestrianSystem;
  
  // Grid properties
  protected gridWidth: number;
  protected gridHeight: number;
  protected gridOffsetX: number = 0;
  protected gridOffsetY: number = 0;
  
  // Convenience getter for backward compatibility (returns max dimension)
  protected get gridSize(): number {
    return Math.max(this.gridWidth, this.gridHeight);
  }
  
  // Graphics objects
  protected gridGraphics!: Phaser.GameObjects.Graphics;
  protected linesGraphics!: Phaser.GameObjects.Graphics;
  protected parkingSpotGraphics!: Phaser.GameObjects.Graphics;
  protected railGraphics!: Phaser.GameObjects.Graphics;
  protected highlightGraphics!: Phaser.GameObjects.Graphics;
  protected vehicleGraphics!: Phaser.GameObjects.Graphics;
  protected pedestrianGraphics!: Phaser.GameObjects.Graphics;
  
  // Labels for cleanup
  protected permanentLabels: Phaser.GameObjects.Text[] = [];
  protected vehicleSpawnerLabels: Phaser.GameObjects.Text[] = [];
  protected ploppableLabels: Phaser.GameObjects.Text[] = [];

  constructor(config: string | Phaser.Types.Scenes.SettingsConfig, gridWidth: number, gridHeight?: number) {
    super(config);
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight ?? gridWidth; // Default to square if height not provided
  }

  create(): void {
    // Initialize grid manager
    this.gridManager = new GridManager(this.gridWidth, this.gridHeight);
    
    // Calculate grid center position
    this.centerGrid();
    
    // Create graphics objects
    this.createGraphicsObjects();
    
    // Initialize entity systems
    this.initializeSystems();
    
    // Draw initial grid
    this.render();
    
    // Set up camera (basic controls - scenes can extend)
    this.setupCamera();
    
    // Scene-specific setup (to be implemented by subclasses)
    this.setupScene();
  }

  /**
   * Center the grid in the viewport
   */
  protected centerGrid(): void {
    // Reset camera scroll to ensure it's at (0, 0) before calculating offsets
    this.cameras.main.setScroll(0, 0);
    
    // Calculate the center tile position in grid coordinates
    const centerGridX = (this.gridWidth - 1) / 2;
    const centerGridY = (this.gridHeight - 1) / 2;
    
    // Convert center grid position to screen coordinates (without offset)
    const centerScreenX = (centerGridX - centerGridY) * (TILE_WIDTH / 2);
    const centerScreenY = (centerGridX + centerGridY) * (TILE_HEIGHT / 2);
    
    // Use game width/height directly instead of camera center (more reliable during hot-reload)
    const cameraCenterX = this.scale.width / 2;
    const cameraCenterY = this.scale.height / 2;
    
    // Calculate offset to center the grid
    this.gridOffsetX = cameraCenterX - centerScreenX;
    this.gridOffsetY = cameraCenterY - centerScreenY;
  }

  /**
   * Create all graphics objects with proper depths
   */
  protected createGraphicsObjects(): void {
    // Create graphics object for the grid (static)
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(0);
    
    // Create graphics object for lines (will be updated) - drawn on top of grid
    this.linesGraphics = this.add.graphics();
    this.linesGraphics.setDepth(1);
    
    // Create graphics object for parking spot lines - drawn on top of grid
    this.parkingSpotGraphics = this.add.graphics();
    this.parkingSpotGraphics.setDepth(1.5);
    
    // Create graphics object for rails - drawn on top of grid
    this.railGraphics = this.add.graphics();
    this.railGraphics.setDepth(1.2);
    
    // Create graphics object for hover highlight (will be updated) - drawn on top of everything
    this.highlightGraphics = this.add.graphics();
    this.highlightGraphics.setDepth(2);
    
    // Create graphics object for vehicles - drawn on top of grid but below highlights
    this.vehicleGraphics = this.add.graphics();
    this.vehicleGraphics.setDepth(1.8);
    
    // Create graphics object for pedestrians - drawn on top of grid but below highlights
    this.pedestrianGraphics = this.add.graphics();
    this.pedestrianGraphics.setDepth(1.85);
  }

  /**
   * Initialize entity systems (vehicle and pedestrian)
   */
  protected initializeSystems(): void {
    // Create edge blocking callback for pathfinding
    const isEdgeBlocked = (
      cellX: number,
      cellY: number,
      edge: number,
      entityType: 'vehicle' | 'pedestrian',
      isEntryEdge: boolean,
      movementDirection: 'north' | 'south' | 'east' | 'west'
    ): boolean => {
      return PathfindingUtilities.isEdgeBlockedForEntity(
        cellX,
        cellY,
        edge,
        entityType,
        this.gridManager,
        isEntryEdge,
        movementDirection
      );
    };
    
    // Create move cost callback for pathfinding (penalizes lane line crossings)
    const getMoveCost = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      direction: 'north' | 'south' | 'east' | 'west',
      entityType: 'vehicle' | 'pedestrian'
    ): number => {
      return PathfindingUtilities.getLaneLineCrossingCost(
        fromX,
        fromY,
        toX,
        toY,
        direction,
        entityType,
        this.gridManager
      );
    };
    
    // Initialize pedestrian system first (needed by vehicle system)
    this.pedestrianSystem = new PedestrianSystem(
      this.gridWidth,
      this.gridHeight,
      (x: number, y: number) => this.gridManager.getCellData(x, y),
      () => this.getPedestrianDestinations(),
      isEdgeBlocked,
      this.gridManager,
      0 // Default need generation probability (can be overridden by scenes)
    );
    
    // Initialize vehicle system (with pedestrian system reference)
    this.vehicleSystem = new VehicleSystem(
      this.gridWidth,
      this.gridHeight,
      (x: number, y: number) => this.gridManager.getCellData(x, y),
      () => this.getAllParkingSpots(),
      isEdgeBlocked,
      getMoveCost,
      this.pedestrianSystem
    );
  }

  /**
   * Basic camera setup (can be extended by subclasses)
   */
  protected setupCamera(): void {
    // Prevent context menu on right click
    this.input.mouse?.disableContextMenu();
  }

  /**
   * Update loop - called by Phaser
   */
  update(_time: number, delta: number): void {
    // Update central game systems (time, rating triggers, etc.)
    GameSystems.update(delta, this.gridManager, this.gridWidth, this.gridHeight);
    
    // Update entity systems
    this.updateEntities(delta);
    
    // Update UI
    this.updateUI();
    
    // Render entities
    this.renderEntities();
  }

  /**
   * Update entity systems
   */
  protected updateEntities(delta: number): void {
    // Update vehicle system
    this.vehicleSystem.update(delta, this.gridWidth, this.gridHeight, this.gridOffsetX, this.gridOffsetY);
    
    // Update pedestrian system
    this.pedestrianSystem.update(delta, this.gridWidth, this.gridHeight, this.gridOffsetX, this.gridOffsetY);
  }

  /**
   * Update game UI elements (clock, day, budget, rating)
   */
  protected updateUI(): void {
    const clockEl = document.getElementById('game-clock');
    const dayEl = document.getElementById('game-day');
    const budgetEl = document.getElementById('game-budget');
    const ratingEl = document.getElementById('game-rating');
    
    if (clockEl) {
      clockEl.textContent = GameSystems.time.getTimeString();
    }
    if (dayEl) {
      dayEl.textContent = GameSystems.time.getCurrentDay().toString();
    }
    if (budgetEl) {
      budgetEl.textContent = `$${GameSystems.economy.getMoney().toLocaleString()}`;
    }
    if (ratingEl) {
      const components = GameSystems.rating.getComponentRatings(this.gridManager, this.gridWidth, this.gridHeight);
      const currentDay = GameSystems.time.getCurrentDay();
      const previous = currentDay === 0 ? null : GameSystems.rating.getPreviousDayRating();
      const previousDisplay = previous === null ? 'n/a' : previous.toFixed(1);
      ratingEl.textContent = `${components.total.toFixed(1)} : ${previousDisplay} (Parker: ${components.parker.toFixed(1)}, Appeal: ${components.appeal.toFixed(0)}, Security: ${components.security.toFixed(0)})`;
    }
  }

  /**
   * Render all visual elements
   */
  protected render(): void {
    this.clearLabels();
    this.renderGrid();
    this.renderLines();
    // Rail visualization removed - pathing logic remains intact
    // this.renderRails();
    this.renderPermanentLabels();
    this.renderSpawners();
    this.renderPloppables();
  }

  /**
   * Clear all labels for cleanup
   */
  protected clearLabels(): void {
    this.permanentLabels.forEach(label => label.destroy());
    this.permanentLabels = [];
    this.vehicleSpawnerLabels.forEach(label => label.destroy());
    this.vehicleSpawnerLabels = [];
    this.ploppableLabels.forEach(label => label.destroy());
    this.ploppableLabels = [];
  }

  /**
   * Render the grid cells
   */
  protected renderGrid(): void {
    GridRenderer.drawGrid(
      this.gridManager,
      this.gridGraphics,
      this.gridWidth,
      this.gridHeight,
      this.gridOffsetX,
      this.gridOffsetY
    );
  }

  /**
   * Render border lines
   */
  protected renderLines(): void {
    GridRenderer.drawLines(
      this.gridManager,
      this.linesGraphics,
      this.gridWidth,
      this.gridHeight,
      this.gridOffsetX,
      this.gridOffsetY
    );
  }

  /**
   * Render rails
   */
  protected renderRails(): void {
    GridRenderer.drawRails(
      this.railGraphics,
      this.gridWidth,
      this.gridHeight,
      this.gridOffsetX,
      this.gridOffsetY
    );
  }

  /**
   * Render permanent labels
   */
  protected renderPermanentLabels(): void {
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        const label = GridRenderer.drawPermanentLabel(
          x,
          y,
          cellData,
          this,
          this.gridOffsetX,
          this.gridOffsetY
        );
        if (label) {
          this.permanentLabels.push(label);
        }
      }
    }
  }

  /**
   * Render spawners and despawners
   */
  protected renderSpawners(): void {
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        
        // Vehicle spawner/despawner
        const vehicleLabel = SpawnerManager.drawVehicleSpawnerDespawner(
          x,
          y,
          cellData,
          this,
          this.gridOffsetX,
          this.gridOffsetY
        );
        if (vehicleLabel) {
          this.vehicleSpawnerLabels.push(vehicleLabel);
        }
        
        // Pedestrian spawner
        const pedestrianLabel = SpawnerManager.drawPedestrianSpawner(
          x,
          y,
          cellData,
          this,
          this.gridOffsetX,
          this.gridOffsetY
        );
        if (pedestrianLabel) {
          this.vehicleSpawnerLabels.push(pedestrianLabel); // Reuse array for simplicity
        }
      }
    }
  }

  /**
   * Render ploppables
   */
  protected renderPloppables(): void {
    // Clear parking spot graphics before redrawing
    this.parkingSpotGraphics.clear();
    
    // Draw parking spot lines
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        GridRenderer.drawParkingSpotLines(
          x,
          y,
          cellData,
          this.parkingSpotGraphics,
          this.gridOffsetX,
          this.gridOffsetY
        );
      }
    }
    
    // Draw other ploppables
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        const label = PloppableManager.drawPloppable(
          x,
          y,
          cellData,
          this,
          this.parkingSpotGraphics,
          this.gridOffsetX,
          this.gridOffsetY
        );
        if (label) {
          this.ploppableLabels.push(label);
        }
      }
    }
  }

  /**
   * Render entities (vehicles and pedestrians)
   */
  protected renderEntities(): void {
    const vehicles = this.vehicleSystem.getVehicles();
    EntityRenderer.drawVehicles(
      vehicles,
      this.vehicleGraphics,
      this.gridOffsetX,
      this.gridOffsetY
    );
    
    const pedestrians = this.pedestrianSystem.getActivePedestrians();
    EntityRenderer.drawPedestrians(
      pedestrians,
      this.pedestrianGraphics,
      this.gridOffsetX,
      this.gridOffsetY
    );
  }

  /**
   * Get all parking spots from the grid
   */
  protected getAllParkingSpots(): Ploppable[] {
    const parkingSpots: Ploppable[] = [];
    
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        const ploppable = cellData?.ploppable;
        if (ploppable && ploppable.type === 'Parking Spot') {
          parkingSpots.push(ploppable);
        }
      }
    }
    
    return parkingSpots;
  }

  /**
   * Get all pedestrian destinations (spawners) from the grid
   */
  protected getPedestrianDestinations(): { x: number; y: number }[] {
    const destinations: { x: number; y: number }[] = [];
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        if (cellData?.ploppable?.type === 'Pedestrian Spawner') {
          destinations.push({ x, y });
        }
      }
    }
    return destinations;
  }

  /**
   * Abstract method - to be implemented by subclasses for scene-specific setup
   */
  protected abstract setupScene(): void;
}

