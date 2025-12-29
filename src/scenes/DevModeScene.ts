import Phaser from 'phaser';
import { getIsometricTilePoints } from '@/utils/isometric';
import { Ploppable } from '@/types';
import { BaseGameplayScene } from '@/core/BaseGameplayScene';
import { GameSystems } from '@/core/GameSystems';
import { PloppableManager } from '@/systems/PloppableManager';
import { SpawnerManager } from '@/managers/SpawnerManager';
import { GridInteractionHandler } from '@/systems/GridInteractionHandler';
import { GridManager } from '@/core/GridManager';
import { SafetySystem } from '@/systems/SafetySystem';

export class DevModeScene extends BaseGameplayScene {
  // Dev mode specific state
  private isDragging = false;
  private isPainting = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;
  private readonly minZoom = 0.5;
  private readonly maxZoom = 2.0;
  private readonly zoomStep = 0.1;
  private hoveredCell: { x: number; y: number } | null = null;
  private hoveredEdge: { cellX: number; cellY: number; edge: number } | null = null;
  private selectedColor: number | null = null;
  private selectedColorName: string | null = null;
  private selectedColorDescription: string | null = null;
  private isLineMode: boolean = false;
  private isPermanentMode: boolean = false;
  private selectedPloppableType: string | null = null;
  private ploppableOrientation: number = 0; // 0=north, 1=east, 2=south, 3=west
  private lastPaintedCell: { x: number; y: number } | null = null;
  private lastPaintedEdgeKey: string | null = null; // Track last painted edge segment key for duplicate prevention
  private isVehicleSpawnerMode: boolean = false;
  private isDemolishMode: boolean = false; // Demolish mode for removing ploppables
  private pendingSpawnerCell: { x: number; y: number } | null = null; // Cell where spawner was placed, waiting for despawner
  private showAppealVisualization: boolean = false; // Show appeal visualization overlay
  private showSafetyVisualization: boolean = false; // Show safety visualization overlay
  private visualizationGraphics!: Phaser.GameObjects.Graphics; // Separate graphics for appeal/safety visualization

  constructor() {
    super({ key: 'DevModeScene' }, 10, 10); // gridWidth = 10, gridHeight = 10
  }

  protected setupScene(): void {
    // Initialize game systems for dev mode (starting budget of $10,000)
    GameSystems.resetForChallenge(10000, this.gridManager, this.gridWidth, this.gridHeight);
    
    // Set need generation probability to 50%
    this.pedestrianSystem.setNeedGenerationProbability(0.5);
    // Set need type distribution to 25% trash, 25% thirst, 50% toilet
    this.pedestrianSystem.setNeedTypeDistribution({ trash: 0.25, thirst: 0.25, toilet: 0.5 });
    
    // Set up keyboard controls
    this.setupKeyboardControls();
    
    // Set up color selection buttons
    this.setupColorButtons();
    
    // Set up demolish button
    this.setupDemolishButton();
    
    // Set up vehicle spawner button
    this.setupVehicleSpawnerButton();
    
    // Set up pedestrian spawner button
    this.setupPedestrianSpawnerButton();
    
    // Set up permanent button
    this.setupPermanentButton();
    
    // Set up export/import buttons
    this.setupExportImportButtons();
    
    // Set up grid resize controls
    this.setupGridResizeControls();
    
    // Set up appeal and safety visualization buttons
    this.setupAppealVisualizationButton();
    this.setupSafetyVisualizationButton();
  }

  // Grid rendering methods removed - now in BaseGameplayScene.render() and GridRenderer
  // Grid management methods removed - now use this.gridManager from BaseGameplayScene
  // Ploppable rendering methods removed - now in PloppableManager
  // Orientation calculation methods removed - now in PloppableManager

  // Wrapper method for rendering (calls base class render)
  private redrawGrid(): void {
    this.render();
  }

  /**
   * Override create - don't create visualization graphics here, create it lazily when needed
   */
  create(): void {
    super.create();
    
    // Don't create visualization graphics here - create it lazily when first needed
    // This ensures it doesn't interfere with grid rendering
  }
  
  /**
   * Get or create visualization graphics object
   */
  private getVisualizationGraphics(): Phaser.GameObjects.Graphics {
    if (!this.visualizationGraphics) {
      this.visualizationGraphics = this.add.graphics();
      this.visualizationGraphics.setDepth(1.6); // Above grid (0) but below lines (1), ploppables, etc.
      this.visualizationGraphics.setVisible(false);
      this.visualizationGraphics.setActive(false); // Inactive by default
    }
    return this.visualizationGraphics;
  }

  /**
   * Override render to add appeal/safety visualization
   * The visualization should be rendered AFTER the grid so it overlays properly
   */
  protected render(): void {
    // Call base class render (renders grid, lines, ploppables, etc.)
    // This MUST be called first to render the grid
    super.render();
    
    // Only render visualization if one of the modes is explicitly active
    // Double-check flags to ensure we don't render when not needed
    const shouldRender = this.showAppealVisualization || this.showSafetyVisualization;
    if (shouldRender) {
      this.renderAppealSafetyVisualization();
    } else {
      // When not active, ensure visualization graphics is cleared and hidden
      if (this.visualizationGraphics) {
        this.visualizationGraphics.clear();
        this.visualizationGraphics.setVisible(false);
        // Also set active to false to ensure it doesn't interfere
        this.visualizationGraphics.setActive(false);
      }
    }
  }

  /**
   * Render appeal or safety visualization overlay
   */
  private renderAppealSafetyVisualization(): void {
    // Safety check - should not be called if both are inactive, but check anyway
    if (!this.showAppealVisualization && !this.showSafetyVisualization) {
      if (this.visualizationGraphics) {
        this.visualizationGraphics.clear();
        this.visualizationGraphics.setVisible(false);
      }
      return;
    }

    // Get or create visualization graphics
    const graphics = this.getVisualizationGraphics();
    
    // Always clear previous visualization first
    graphics.clear();
    
    // Make sure graphics object is active and visible when rendering
    graphics.setActive(true);
    graphics.setVisible(true);
    
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const cellData = this.gridManager.getCellData(x, y);
        let value: number;
        
        if (this.showAppealVisualization) {
          value = cellData?.appeal ?? 0;
        } else {
          value = cellData?.safety ?? 0;
        }
        
        // Convert to boolean: positive = 1 (green), 0 or negative = 0 (red)
        const isPositive = value > 0;
        const color = isPositive ? 0x00ff00 : 0xff0000; // Green or red
        const alpha = 0.3; // Semi-transparent overlay
        
        // Get cell points for highlighting
        const points = getIsometricTilePoints(x, y);
        const offsetPoints = points.map(p => ({
          x: p.x + this.gridOffsetX,
          y: p.y + this.gridOffsetY
        }));
        
        // Fill the cell with the color (using two triangles to form diamond)
        // Diamond points: [0]=top, [1]=right, [2]=bottom, [3]=left
        graphics.fillStyle(color, alpha);
        // Top triangle: top, right, left
        graphics.fillTriangle(
          offsetPoints[0].x, offsetPoints[0].y,
          offsetPoints[1].x, offsetPoints[1].y,
          offsetPoints[3].x, offsetPoints[3].y
        );
        // Bottom triangle: bottom, right, left
        graphics.fillTriangle(
          offsetPoints[2].x, offsetPoints[2].y,
          offsetPoints[1].x, offsetPoints[1].y,
          offsetPoints[3].x, offsetPoints[3].y
        );
      }
    }
  }

  // All rendering methods removed - now in BaseGameplayScene.render() and extracted renderers

  private paintCell(gridX: number, gridY: number): void {
    // Check bounds
    if (gridX < 0 || gridX >= this.gridWidth || gridY < 0 || gridY >= this.gridHeight) return;
    
    // Handle demolish mode
    if (this.isDemolishMode) {
      // Check if we already demolished on this cell (prevent duplicates during drag)
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) {
        return;
      }
      
      this.demolishAtCell(gridX, gridY);
      
      // Remember last painted cell
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }
    
    // Handle permanent mode (toggle permanent status)
    if (this.isPermanentMode) {
      // Check if we already toggled this cell (prevent duplicates during drag)
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) {
        return;
      }
      
      const cellData = this.gridManager.getCellData(gridX, gridY);
      const isPermanent = cellData?.isPermanent || false;
      
      // Toggle permanent status
      this.gridManager.setCellData(gridX, gridY, { isPermanent: !isPermanent });
      
      // Redraw the grid to update permanent labels
      this.redrawGrid();
      
      // Remember last painted cell
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }
    
    // Handle vehicle spawner/despawner placement
    if (this.isVehicleSpawnerMode) {
      // Check if we already placed on this cell (prevent duplicates during drag)
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) {
        return;
      }
      
      const cellData = this.gridManager.getCellData(gridX, gridY);
      
      // If we're waiting for despawner placement
      if (this.pendingSpawnerCell) {
        // Check if clicking the same cell as spawner
        if (this.pendingSpawnerCell.x === gridX && this.pendingSpawnerCell.y === gridY) {
          return; // Can't place despawner on same cell as spawner
        }
        
        // Check if cell already has a ploppable, spawner, or despawner
        if (cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner) {
          return; // Cell is occupied
        }
        
        // Place despawner using SpawnerManager
        SpawnerManager.addVehicleSpawnerPair(
          this.pendingSpawnerCell.x,
          this.pendingSpawnerCell.y,
          gridX,
          gridY,
          this.gridManager,
          this.vehicleSystem
        );
        
        // Clear pending state and exit spawner mode
        this.pendingSpawnerCell = null;
        this.isVehicleSpawnerMode = false;
        
        // Update button state
        const vehicleButton = document.getElementById('vehicle-spawner-button');
        if (vehicleButton) {
          vehicleButton.classList.remove('selected');
        }
        
        // Redraw grid
        this.redrawGrid();
        
        // Remember last painted cell
        this.lastPaintedCell = { x: gridX, y: gridY };
        return;
      } else {
        // Placing spawner
        // Check if cell already has a ploppable, spawner, or despawner
        if (cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner) {
          return; // Cell is occupied
        }
        
        // Place spawner
        this.gridManager.setCellData(gridX, gridY, { vehicleSpawner: true });
        this.pendingSpawnerCell = { x: gridX, y: gridY };
        
        // Redraw grid
        this.redrawGrid();
        
        // Remember last painted cell
        this.lastPaintedCell = { x: gridX, y: gridY };
        return;
      }
    }
    
    // Handle ploppable placement
    if (this.selectedPloppableType) {
      // Check if we already placed on this cell (prevent duplicates during drag)
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) {
        return;
      }
      
      // Special validation for Security Camera: must be placed on a cell with Street Light
      if (this.selectedPloppableType === 'Security Camera') {
        const cellData = this.gridManager.getCellData(gridX, gridY);
        if (!cellData?.ploppable || cellData.ploppable.type !== 'Street Light') {
          return; // Cannot place Security Camera without Street Light
        }
        // Security Camera can be placed even if cell already has a ploppable (Street Light)
        // We'll handle this specially below
      } else {
        // Check if cell already has a ploppable, spawner, or despawner
        if (!PloppableManager.canPlacePloppable(gridX, gridY, this.gridManager, this.selectedPloppableType || undefined, this.ploppableOrientation, this.gridWidth, this.gridHeight)) {
          return;
        }
      }
      
      // Get ploppable properties from button data attributes
      const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
      const orientationType = button?.getAttribute('data-orientation-type') as 'A' | 'B' | undefined;
      const passableAttr = button?.getAttribute('data-passable');
      const passable = passableAttr === 'true';
      
      // Special handling for Security Camera: replace Street Light's safety AoE
      if (this.selectedPloppableType === 'Security Camera') {
        const cellData = this.gridManager.getCellData(gridX, gridY);
        const streetLight = cellData?.ploppable;
        if (streetLight && streetLight.type === 'Street Light') {
          // Remove Street Light's safety AoE (2 radius)
          SafetySystem.getInstance().applyPloppableAoE(streetLight, this.gridManager, this.gridWidth, this.gridHeight, true);
          
          // Create Security Camera ploppable
          const securityCamera: Ploppable = {
            id: `${this.selectedPloppableType}-${gridX}-${gridY}-${Date.now()}`,
            type: this.selectedPloppableType,
            x: gridX,
            y: gridY,
            cost: 0,
            orientation: 0, // Security Camera doesn't need orientation
            orientationType: undefined,
            passable: passable
          };
          
          // Replace Street Light with Security Camera in cell data
          this.gridManager.setCellData(gridX, gridY, { ploppable: securityCamera });
          
          // Apply Security Camera's safety AoE (8 radius)
          SafetySystem.getInstance().applyPloppableAoE(securityCamera, this.gridManager, this.gridWidth, this.gridHeight, false);
          
          // Redraw grid
          this.redrawGrid();
          
          // Remember last painted cell
          this.lastPaintedCell = { x: gridX, y: gridY };
          return;
        }
      }
      
      // Create ploppable
      const ploppable: Ploppable = {
        id: `${this.selectedPloppableType}-${gridX}-${gridY}-${Date.now()}`,
        type: this.selectedPloppableType,
        x: gridX,
        y: gridY,
        cost: 0, // Will be set later
        orientation: this.ploppableOrientation,
        orientationType: orientationType,
        passable: passable
      };
      
      // Store in cell data using PloppableManager
      PloppableManager.placePloppable(gridX, gridY, ploppable, this.gridManager, this.gridWidth, this.gridHeight);
      
      // Special handling for Crosswalk: set behavesLikeSidewalk property
      if (this.selectedPloppableType === 'Crosswalk') {
        const cellData = this.gridManager.getCellData(gridX, gridY);
        this.gridManager.setCellData(gridX, gridY, { ...cellData, behavesLikeSidewalk: true });
      }
      
      // If this is a pedestrian spawner, register it with the pedestrian system
      if (this.selectedPloppableType === 'Pedestrian Spawner') {
        SpawnerManager.addPedestrianSpawner(gridX, gridY, this.gridManager, this.pedestrianSystem);
      }
      
      // Redraw grid to show parking spot lines and ploppable label
      this.redrawGrid();
      
      // Remember last painted cell
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }
    
    if (this.selectedColor === null) return;
    
    if (this.isLineMode && this.hoveredEdge) {
      const { cellX, cellY, edge } = this.hoveredEdge;
      
      // Find existing key if any (check all possible keys for shared edges)
      // This is the actual segment key that exists in storage (could be from current cell or adjacent cell)
      const existingKey = this.gridManager.findExistingBorderSegmentKey(cellX, cellY, edge);
      
      // Check if we already toggled this exact edge segment (prevent duplicates during drag)
      // Use the existing key if it exists, otherwise use the current cell's key
      const edgeKeyToCheck = existingKey || this.gridManager.getBorderSegmentKey(cellX, cellY, edge);
      if (this.lastPaintedEdgeKey === edgeKeyToCheck) {
        return;
      }
      
      // Use the current cell's key for storage (so coordinates match what user sees)
      const currentKey = this.gridManager.getBorderSegmentKey(cellX, cellY, edge);
      const existingEdgeColor = existingKey ? this.gridManager.getBorderSegment(existingKey) : undefined;
      
      // Toggle logic:
      // - If a line exists with the selected color, remove it (toggle off)
      // - Otherwise, add/update the line (toggle on)
      if (existingKey && existingEdgeColor === this.selectedColor) {
        // Toggle off: remove the existing line (works regardless of which cell's key it was stored under)
        this.gridManager.deleteBorderSegment(existingKey);
      } else {
        // Toggle on: add or update the line
        // If there's an existing key with a different color, remove it first (cleanup)
        if (existingKey && existingKey !== currentKey) {
          this.gridManager.deleteBorderSegment(existingKey);
        }
        
        // Add/update using current cell's key (matches what user sees)
        this.gridManager.setBorderSegment(currentKey, this.selectedColor);
      }
      
      // Redraw lines
      this.redrawGrid();
      
      // Remember last painted edge segment (use existing key if it exists, otherwise current key)
      this.lastPaintedEdgeKey = existingKey || currentKey;
      this.lastPaintedCell = { x: cellX, y: cellY };
    } else if (!this.isLineMode) {
      // Check if we already painted this cell (prevent duplicates during drag)
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) {
        return;
      }
      
      // Store the color in cell data
      this.gridManager.setCellData(gridX, gridY, { color: this.selectedColor });
      
      // Redraw the grid
      this.redrawGrid();
      
      // Remember last painted cell
      this.lastPaintedCell = { x: gridX, y: gridY };
    }
  }

  private drawHighlight(gridX: number, gridY: number, edge?: number): void {
    this.highlightGraphics.clear();
    
    // Get diamond points for this grid cell
    const points = getIsometricTilePoints(gridX, gridY);
    
    // Offset points by grid offset
    const offsetPoints = points.map(p => ({
      x: p.x + this.gridOffsetX,
      y: p.y + this.gridOffsetY
    }));
    
    if (this.isDemolishMode) {
      // Draw red border highlight for demolish mode
      this.highlightGraphics.lineStyle(2, 0xff0000, 0.8);
      this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
    } else if (this.selectedPloppableType === 'Parking Spot') {
      // Draw parking spot preview (3 of 4 borders as white lines)
      this.highlightGraphics.lineStyle(2, 0xffffff, 1);
      
      // Orientation represents which edge is missing (undrawn):
      // 0 = missing left (edge 3) - draws edges 0,1,2
      // 1 = missing bottom (edge 2) - draws edges 0,1,3
      // 2 = missing top (edge 0) - draws edges 1,2,3
      // 3 = missing right (edge 1) - draws edges 0,2,3
      const edgesToDraw = [
        [0, 1, 2], // orientation 0: missing left (3) - draw top, right, bottom
        [0, 1, 3], // orientation 1: missing bottom (2) - draw top, right, left
        [1, 2, 3], // orientation 2: missing top (0) - draw right, bottom, left
        [0, 2, 3]  // orientation 3: missing right (1) - draw top, bottom, left
      ];
      
      const edges = edgesToDraw[this.ploppableOrientation];
      edges.forEach(edgeIdx => {
        const startIdx = edgeIdx;
        const endIdx = (edgeIdx + 1) % 4;
        this.highlightGraphics.lineBetween(
          offsetPoints[startIdx].x,
          offsetPoints[startIdx].y,
          offsetPoints[endIdx].x,
          offsetPoints[endIdx].y
        );
      });
    } else if (this.selectedPloppableType === 'Tree' || this.selectedPloppableType === 'Shrub' || this.selectedPloppableType === 'Flower Patch') {
      // Draw preview for non-oriented ploppables (center emoji, no orientation)
      this.highlightGraphics.lineStyle(1.5, 0x00ff00, 0.6);
      this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
    } else if (this.selectedPloppableType === 'Street Light') {
      // Draw preview for Street Light (Type A orientation)
      const centerX = (offsetPoints[0].x + offsetPoints[2].x) / 2;
      const centerY = (offsetPoints[0].y + offsetPoints[2].y) / 2;
      
      this.highlightGraphics.lineStyle(1.5, 0x00ff00, 0.6);
      this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
      
      // Draw Type A position indicator
      const indicatorPos = PloppableManager.getTypeAPosition(centerX, centerY, this.ploppableOrientation);
      this.highlightGraphics.fillStyle(0x00ff00, 0.8);
      this.highlightGraphics.fillCircle(indicatorPos.x, indicatorPos.y, 4);
    } else if (this.selectedPloppableType === 'Security Camera') {
      // Draw preview for Security Camera (check if Street Light exists)
      const cellData = this.gridManager.getCellData(gridX, gridY);
      const hasStreetLight = cellData?.ploppable?.type === 'Street Light';
      const highlightColor = hasStreetLight ? 0x00ff00 : 0xff0000; // Green if valid, red if invalid
      
      this.highlightGraphics.lineStyle(1.5, highlightColor, 0.6);
      this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
    } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine' || this.selectedPloppableType === 'Dumpster' || this.selectedPloppableType === 'Portable Toilet' || this.selectedPloppableType === 'Bench' || this.selectedPloppableType === 'Speed Bump' || this.selectedPloppableType === 'Crosswalk') {
      // Draw preview for oriented ploppables
      // Get orientation type and size from button data
      const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
      const orientationType = button?.getAttribute('data-orientation-type') || 'B';
      const sizeAttr = button?.getAttribute('data-size');
      const size = sizeAttr ? parseInt(sizeAttr, 10) : 1;
      const noArrow = button?.getAttribute('data-no-arrow') === 'true';
      
      if (size === 2) {
        // 2-tile ploppable preview (dumpster)
        // Calculate second cell based on orientation
        const secondCell = PloppableManager.getSecondCellForTwoTile(gridX, gridY, this.ploppableOrientation, this.gridWidth, this.gridHeight);
        
        if (secondCell) {
          // Draw highlight for primary cell
          this.highlightGraphics.lineStyle(1.5, 0x00ff00, 0.6);
          this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
          this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
          this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
          this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
          
          // Draw highlight for second cell
          const secondPoints = getIsometricTilePoints(secondCell.x, secondCell.y);
          const secondOffsetPoints = secondPoints.map(p => ({
            x: p.x + this.gridOffsetX,
            y: p.y + this.gridOffsetY
          }));
          this.highlightGraphics.lineBetween(secondOffsetPoints[0].x, secondOffsetPoints[0].y, secondOffsetPoints[1].x, secondOffsetPoints[1].y);
          this.highlightGraphics.lineBetween(secondOffsetPoints[1].x, secondOffsetPoints[1].y, secondOffsetPoints[2].x, secondOffsetPoints[2].y);
          this.highlightGraphics.lineBetween(secondOffsetPoints[2].x, secondOffsetPoints[2].y, secondOffsetPoints[3].x, secondOffsetPoints[3].y);
          this.highlightGraphics.lineBetween(secondOffsetPoints[3].x, secondOffsetPoints[3].y, secondOffsetPoints[0].x, secondOffsetPoints[0].y);
          
          // Calculate center between the two cells for arrow
          const center1X = (offsetPoints[0].x + offsetPoints[2].x) / 2;
          const center1Y = (offsetPoints[0].y + offsetPoints[2].y) / 2;
          const center2X = (secondOffsetPoints[0].x + secondOffsetPoints[2].x) / 2;
          const center2Y = (secondOffsetPoints[0].y + secondOffsetPoints[2].y) / 2;
          const centerX = (center1X + center2X) / 2;
          const centerY = (center1Y + center2Y) / 2;
          
          // Draw orientation arrow pointing in the facing direction (skip if noArrow)
          if (!noArrow) {
            PloppableManager.drawOrientationArrow(
              this.highlightGraphics,
              centerX,
              centerY,
              this.ploppableOrientation,
              20, // arrow length
              0x00ff00, // green color
              0.8 // semi-transparent for preview
            );
          }
        } else {
          // Second cell is out of bounds, just draw primary cell in red
          this.highlightGraphics.lineStyle(1.5, 0xff0000, 0.6);
          this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
          this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
          this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
          this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
        }
      } else {
        // Single-tile ploppable preview
        const centerX = (offsetPoints[0].x + offsetPoints[2].x) / 2;
        const centerY = (offsetPoints[0].y + offsetPoints[2].y) / 2;
        
        // Draw preview text (semi-transparent)
        // We'll just draw a highlight with orientation indicator
        this.highlightGraphics.lineStyle(1.5, 0x00ff00, 0.6);
        this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
        this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
        this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
        this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
        
        // Draw orientation indicator using the same calculation as actual placement
        if (orientationType === 'A') {
          // For Type A, show dot at the position
          const indicatorPos = PloppableManager.getTypeAPosition(centerX, centerY, this.ploppableOrientation);
          this.highlightGraphics.fillStyle(0x00ff00, 0.8);
          this.highlightGraphics.fillCircle(indicatorPos.x, indicatorPos.y, 4);
        } else {
          // For Type B, show arrow pointing in the facing direction (skip if noArrow)
          if (!noArrow) {
            PloppableManager.drawOrientationArrow(
              this.highlightGraphics,
              centerX,
              centerY,
              this.ploppableOrientation,
              20, // arrow length
              0x00ff00, // green color
              0.8 // semi-transparent for preview
            );
          }
        }
      }
    } else if (this.isLineMode && edge !== undefined) {
      // Draw blue line on the specific edge
      GridInteractionHandler.drawEdgeHighlight(
        gridX,
        gridY,
        edge,
        this.highlightGraphics,
        this.gridOffsetX,
        this.gridOffsetY
      );
    } else {
      // Draw normal yellow border highlight
      GridInteractionHandler.drawBasicHighlight(
        gridX,
        gridY,
        this.highlightGraphics,
        this.gridOffsetX,
        this.gridOffsetY
      );
    }
  }

  private clearHighlight(): void {
    this.highlightGraphics.clear();
    this.hoveredCell = null;
    this.hoveredEdge = null;
  }

  // drawLines removed - now in GridRenderer.drawLines()

  private getCellAtPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } | null {
    return GridInteractionHandler.getCellAtPointer(
      pointer,
      this.cameras.main,
      this.gridWidth,
      this.gridHeight,
      this.gridOffsetX,
      this.gridOffsetY
    );
  }

  private getNearestEdge(
    gridX: number,
    gridY: number,
    pointer: Phaser.Input.Pointer
  ): number {
    return GridInteractionHandler.getNearestEdge(
      gridX,
      gridY,
      pointer,
      this.cameras.main,
      this.gridOffsetX,
      this.gridOffsetY
    );
  }


  private updateHoverHighlight(pointer: Phaser.Input.Pointer): void {
    // Skip if dragging camera
    if (this.isDragging) {
      return;
    }
    
    const cell = this.getCellAtPointer(pointer);
    
    if (cell) {
      if (this.isLineMode) {
        // In line mode, detect which edge
        const edge = this.getNearestEdge(cell.x, cell.y, pointer);
        if (!this.hoveredEdge ||
            this.hoveredEdge.cellX !== cell.x ||
            this.hoveredEdge.cellY !== cell.y ||
            this.hoveredEdge.edge !== edge) {
          this.hoveredEdge = { cellX: cell.x, cellY: cell.y, edge };
          this.drawHighlight(cell.x, cell.y, edge);
        }
    } else if (this.isVehicleSpawnerMode) {
      // Vehicle spawner/despawner mode - show normal highlight
      if (!this.hoveredCell || this.hoveredCell.x !== cell.x || this.hoveredCell.y !== cell.y) {
        this.hoveredCell = cell;
        this.drawHighlight(cell.x, cell.y);
      }
    } else {
      // Normal cell highlight or ploppable preview
      if (!this.hoveredCell || this.hoveredCell.x !== cell.x || this.hoveredCell.y !== cell.y) {
        this.hoveredCell = cell;
        this.drawHighlight(cell.x, cell.y);
      }
    }
    } else {
      // Mouse is outside grid bounds
      if (this.hoveredCell || this.hoveredEdge) {
        this.clearHighlight();
      }
    }
  }

  protected setupCamera(): void {
    // Call base camera setup
    super.setupCamera();

    // Enable pointer events for right-click drag and left-click paint
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Check if right mouse button (button 2) - camera drag
      if (pointer.rightButtonDown()) {
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        this.cameraStartX = this.cameras.main.scrollX;
        this.cameraStartY = this.cameras.main.scrollY;
      }
      // Check if left mouse button (button 0) - paint, mark permanent, place ploppable, place vehicle spawner/despawner, or demolish
      else if (pointer.leftButtonDown() && (this.selectedColor !== null || this.isPermanentMode || this.selectedPloppableType !== null || this.isVehicleSpawnerMode || this.isDemolishMode)) {
        // Update hover first to ensure hoveredEdge is set in line mode
        this.updateHoverHighlight(pointer);
        
        this.isPainting = true;
        this.lastPaintedCell = null; // Reset for new paint stroke
        this.lastPaintedEdgeKey = null; // Reset for new paint stroke
        // Demolish mode always uses cell-based logic, not edge-based
        if (this.isLineMode && !this.isDemolishMode) {
          // In line mode, we need the hovered edge
          if (this.hoveredEdge) {
            this.paintCell(this.hoveredEdge.cellX, this.hoveredEdge.cellY);
          }
        } else {
          const cell = this.getCellAtPointer(pointer);
          if (cell) {
            this.paintCell(cell.x, cell.y);
          }
        }
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased()) {
        this.isDragging = false;
      }
      if (pointer.leftButtonReleased()) {
        this.isPainting = false;
        this.lastPaintedCell = null;
        this.lastPaintedEdgeKey = null;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging && pointer.rightButtonDown()) {
        // Calculate the delta movement (how far mouse has moved)
        const deltaX = pointer.x - this.dragStartX;
        const deltaY = pointer.y - this.dragStartY;
        
        // Move camera by the delta (camera moves same direction as mouse drag)
        this.cameras.main.setScroll(
          this.cameraStartX - deltaX,
          this.cameraStartY - deltaY
        );
      } else if (this.isPainting && pointer.leftButtonDown() && (this.selectedColor !== null || this.isPermanentMode || this.selectedPloppableType !== null || this.isVehicleSpawnerMode || this.isDemolishMode)) {
        // Paint while dragging
        // Demolish mode always uses cell-based logic, not edge-based
        if (this.isLineMode && !this.isDemolishMode) {
          // In line mode, paint based on hovered edge
          if (this.hoveredEdge) {
            this.paintCell(this.hoveredEdge.cellX, this.hoveredEdge.cellY);
          }
        } else {
          const cell = this.getCellAtPointer(pointer);
          if (cell) {
            this.paintCell(cell.x, cell.y);
          }
        }
        // Still update hover highlight
        this.updateHoverHighlight(pointer);
      } else {
        // Update hover highlight when not dragging or painting
        this.updateHoverHighlight(pointer);
      }
    });

    // Mouse wheel zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number, _deltaZ: number) => {
      const currentZoom = this.cameras.main.zoom;
      // deltaY is negative when scrolling up (zoom in), positive when scrolling down (zoom out)
      const zoomDelta = deltaY > 0 ? -this.zoomStep : this.zoomStep;
      const newZoom = Phaser.Math.Clamp(currentZoom + zoomDelta, this.minZoom, this.maxZoom);
      
      this.cameras.main.setZoom(newZoom);
    });
  }

  private setupColorButtons(): void {
    // Wait for DOM to be ready
    this.time.delayedCall(100, () => {
      const colorButtons = document.querySelectorAll('.color-button');
      const ploppableButtons = document.querySelectorAll('.ploppable-button');
      
      colorButtons.forEach((button) => {
        button.addEventListener('click', () => {
          // Remove selected class from all buttons
          colorButtons.forEach(btn => btn.classList.remove('selected'));
          ploppableButtons.forEach(btn => btn.classList.remove('selected'));
          
          // Add selected class to clicked button
          button.classList.add('selected');
          
          // Clear ploppable selection
          this.selectedPloppableType = null;
          
          // Clear vehicle spawner mode
          this.isVehicleSpawnerMode = false;
          this.pendingSpawnerCell = null;
          const vehicleButton = document.getElementById('vehicle-spawner-button');
          if (vehicleButton) {
            vehicleButton.classList.remove('selected');
          }
          
          // Clear pedestrian spawner selection
          const pedestrianButton = document.getElementById('pedestrian-spawner-button');
          if (pedestrianButton) {
            pedestrianButton.classList.remove('selected');
          }
          
          // Get color from data attribute and convert to hex number
          const colorHex = button.getAttribute('data-color');
          if (colorHex) {
            this.selectedColor = parseInt('0x' + colorHex, 16);
          }
          
          // Get name and description
          this.selectedColorName = button.getAttribute('data-name') || null;
          this.selectedColorDescription = button.getAttribute('data-description') || null;
          
          // Check if this is a line/border button
          const isLineButton = ['Lane Line', 'Curb', 'Fence'].includes(this.selectedColorName || '');
          this.isLineMode = isLineButton;
          
          // Disable permanent mode when selecting a color/line
          if (this.isPermanentMode) {
            this.isPermanentMode = false;
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
          }
          
          // Disable demolish mode
          this.isDemolishMode = false;
          const demolishButton = document.getElementById('demolish-button');
          if (demolishButton) {
            demolishButton.classList.remove('selected');
          }
          
          // Clear visualization modes
          this.clearVisualizationModes();
          
          // Clear hover state when switching modes
          this.clearHighlight();
          
          // Update selection info in right panel
          this.updateSelectionInfo();
        });
      });
      
      // Handle ploppable button clicks
      ploppableButtons.forEach((button) => {
        button.addEventListener('click', () => {
          // Remove selected class from all buttons
          colorButtons.forEach(btn => btn.classList.remove('selected'));
          ploppableButtons.forEach(btn => btn.classList.remove('selected'));
          
          // Add selected class to clicked button
          button.classList.add('selected');
          
          // Clear color/line selection
          this.selectedColor = null;
          this.selectedColorName = null;
          this.selectedColorDescription = null;
          this.isLineMode = false;
          
          // Clear vehicle spawner mode
          this.isVehicleSpawnerMode = false;
          this.pendingSpawnerCell = null;
          const vehicleButton = document.getElementById('vehicle-spawner-button');
          if (vehicleButton) {
            vehicleButton.classList.remove('selected');
          }
          
          // Clear pedestrian spawner selection
          const pedestrianButton = document.getElementById('pedestrian-spawner-button');
          if (pedestrianButton) {
            pedestrianButton.classList.remove('selected');
          }
          
          // Clear demolish mode
          this.isDemolishMode = false;
          const demolishBtn = document.getElementById('demolish-button');
          if (demolishBtn) {
            demolishBtn.classList.remove('selected');
          }
          
          // Set ploppable type
          this.selectedPloppableType = button.getAttribute('data-name') || null;
          
          // Reset orientation
          this.ploppableOrientation = 0;
          
          // Disable permanent mode
          if (this.isPermanentMode) {
            this.isPermanentMode = false;
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
          }
          
          // Clear hover state
          this.clearHighlight();
          
          // Update selection info
          this.updateSelectionInfo();
        });
      });
    });
  }

  private updateSelectionInfo(): void {
    const selectionInfo = document.getElementById('selection-info');
    const colorPreview = document.getElementById('selection-color-preview');
    const selectionName = document.getElementById('selection-name');
    const selectionDescription = document.getElementById('selection-description');
    const selectionInstructions = document.getElementById('selection-instructions');

    if (this.isVehicleSpawnerMode) {
      // Show vehicle spawner info
      if (selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
        colorPreview.style.display = 'none';
        selectionInstructions.style.display = 'none';
        if (this.pendingSpawnerCell) {
          selectionName.textContent = 'Vehicle Despawner';
          selectionDescription.textContent = 'Click a different cell to place the vehicle despawner (🎯).';
        } else {
          selectionName.textContent = 'Vehicle Spawner';
          selectionDescription.textContent = 'Click a cell to place the vehicle spawner (🚗). After placing, you will be prompted to place a despawner.';
        }
        selectionInfo.style.display = 'block';
      }
    } else if (this.isDemolishMode) {
      // Show demolish mode info
      if (selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
        colorPreview.style.display = 'none';
        selectionInstructions.style.display = 'none';
        selectionName.textContent = 'Demolish Tool';
        selectionDescription.textContent = 'Click on any ploppable to to remove it. No refunds.';
        selectionInfo.style.display = 'block';
      }
    } else if (this.selectedPloppableType) {
      // Show ploppable info
      if (selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
        // Hide color preview for ploppables
        colorPreview.style.display = 'none';
        selectionName.textContent = this.selectedPloppableType;
        
        // Build description
        let description = '';
        let instructions = '';
        if (this.selectedPloppableType === 'Pedestrian Spawner') {
          description = 'Click a cell to place a pedestrian spawner (🚶). Pedestrians will spawn here and wander randomly on the pedestrian rail grid.';
        } else {
          const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
          if (button) {
            description = button.getAttribute('data-description') || '';
          }
          // Check if this ploppable uses rotation (Q/E keys)
          if (this.selectedPloppableType === 'Parking Spot' || 
              this.selectedPloppableType === 'Trash Can' || 
              this.selectedPloppableType === 'Vending Machine' ||
              this.selectedPloppableType === 'Dumpster' ||
              this.selectedPloppableType === 'Portable Toilet' ||
              this.selectedPloppableType === 'Street Light' ||
              this.selectedPloppableType === 'Bench' ||
              this.selectedPloppableType === 'Speed Bump' ||
              this.selectedPloppableType === 'Crosswalk') {
            instructions = 'Use Q and E keys to rotate orientation.';
          }
          if (this.selectedPloppableType === 'Security Camera') {
            instructions = 'Can only be placed on cells that already contain a Street Light.';
          }
        }
        selectionDescription.textContent = description;
        if (instructions) {
          selectionInstructions.textContent = instructions;
          selectionInstructions.style.display = 'block';
        } else {
          selectionInstructions.style.display = 'none';
        }
        
        selectionInfo.style.display = 'block';
      }
    } else if (this.selectedColor !== null && selectionInfo && colorPreview && selectionName && selectionDescription) {
      // Show color/line info
      colorPreview.style.display = 'block';
      // Convert hex number to hex string for CSS
      const colorHexString = '#' + this.selectedColor.toString(16).padStart(6, '0');
      
      colorPreview.style.backgroundColor = colorHexString;
      selectionName.textContent = this.selectedColorName || 'Unknown';
      selectionDescription.textContent = this.selectedColorDescription || '';
      
      selectionInfo.style.display = 'block';
    } else if (selectionInfo) {
      selectionInfo.style.display = 'none';
    }
  }

  private setupKeyboardControls(): void {
    this.input.keyboard?.on('keydown-Q', () => {
      if (this.selectedPloppableType === 'Parking Spot') {
        // Rotate missing edge counter-clockwise (Q)
        // Orientation mapping: 0 (missing left) -> 1 (missing bottom) -> 3 (missing right) -> 2 (missing top) -> 0
        // Sequence: 0->1->3->2->0
        // Formula: (orientation + 1) % 4, but adjusted for the sequence
        const rotationMap = [1, 3, 0, 2]; // maps current orientation to next when rotating CCW
        this.ploppableOrientation = rotationMap[this.ploppableOrientation];
        // Update highlight if hovering over a cell
        if (this.hoveredCell) {
          this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
        }
      } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine' || this.selectedPloppableType === 'Dumpster' || this.selectedPloppableType === 'Portable Toilet' || this.selectedPloppableType === 'Street Light' || this.selectedPloppableType === 'Bench' || this.selectedPloppableType === 'Speed Bump' || this.selectedPloppableType === 'Crosswalk') {
        // Rotate counter-clockwise (Q): 0 -> 3 -> 2 -> 1 -> 0
        this.ploppableOrientation = (this.ploppableOrientation + 3) % 4;
        // Update highlight if hovering over a cell
        if (this.hoveredCell) {
          this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
        }
      }
    });
    
    this.input.keyboard?.on('keydown-E', () => {
      if (this.selectedPloppableType === 'Parking Spot') {
        // Rotate missing edge clockwise (E)
        // Orientation mapping: 0 (missing left) -> 2 (missing top) -> 3 (missing right) -> 1 (missing bottom) -> 0
        // Sequence: 0->2->3->1->0
        const rotationMap = [2, 0, 3, 1]; // maps current orientation to next when rotating CW
        this.ploppableOrientation = rotationMap[this.ploppableOrientation];
        // Update highlight if hovering over a cell
        if (this.hoveredCell) {
          this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
        }
      } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine' || this.selectedPloppableType === 'Dumpster' || this.selectedPloppableType === 'Portable Toilet' || this.selectedPloppableType === 'Street Light' || this.selectedPloppableType === 'Bench' || this.selectedPloppableType === 'Speed Bump' || this.selectedPloppableType === 'Crosswalk') {
        // Rotate clockwise (E): 0 -> 1 -> 2 -> 3 -> 0
        this.ploppableOrientation = (this.ploppableOrientation + 1) % 4;
        // Update highlight if hovering over a cell
        if (this.hoveredCell) {
          this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
        }
      }
    });
  }

  private exportGrid(): void {
    const serialized = this.gridManager.serializeGrid();
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parking-lot-grid-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Grid exported to file');
  }

  private importGrid(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const success = this.gridManager.deserializeGrid(content);
      if (success) {
        // Rebuild spawner-despawner pairs from loaded cell data
        SpawnerManager.rebuildSpawnerPairsFromGrid(
          this.gridManager,
          this.gridWidth,
          this.gridHeight,
          this.vehicleSystem,
          this.pedestrianSystem
        );
        // Redraw with imported data
        this.redrawGrid();
        console.log('Grid imported from file');
      } else {
        alert('Failed to import grid. Invalid file format.');
      }
    };
    reader.readAsText(file);
  }

  private setupPedestrianSpawnerButton(): void {
    this.time.delayedCall(100, () => {
      const pedestrianButton = document.getElementById('pedestrian-spawner-button');
      
      if (pedestrianButton) {
        pedestrianButton.addEventListener('click', () => {
          // Toggle pedestrian spawner selection (treats it as a ploppable)
          if (this.selectedPloppableType === 'Pedestrian Spawner') {
            // Deselect
            this.selectedPloppableType = null;
            pedestrianButton.classList.remove('selected');
          } else {
            // Select pedestrian spawner
            this.selectedPloppableType = 'Pedestrian Spawner';
            pedestrianButton.classList.add('selected');
            
            // Clear other selections
            this.selectedColor = null;
            this.selectedColorName = null;
            this.selectedColorDescription = null;
            this.isLineMode = false;
            this.isVehicleSpawnerMode = false;
            this.pendingSpawnerCell = null;
            this.isPermanentMode = false;
            this.isDemolishMode = false;
            this.clearVisualizationModes();
            
            // Clear button selections
            document.querySelectorAll('.color-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            document.querySelectorAll('.ploppable-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            const vehicleButton = document.getElementById('vehicle-spawner-button');
            if (vehicleButton) {
              vehicleButton.classList.remove('selected');
            }
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
            const demolishButton = document.getElementById('demolish-button');
            if (demolishButton) {
              demolishButton.classList.remove('selected');
            }
          }
          
          this.clearHighlight();
          this.updateSelectionInfo();
        });
      }
    });
  }

  private setupVehicleSpawnerButton(): void {
    this.time.delayedCall(100, () => {
      const vehicleButton = document.getElementById('vehicle-spawner-button');
      
      if (vehicleButton) {
        vehicleButton.addEventListener('click', () => {
          // Toggle vehicle spawner mode
          this.isVehicleSpawnerMode = !this.isVehicleSpawnerMode;
          
          // Update button appearance
          if (this.isVehicleSpawnerMode) {
            vehicleButton.classList.add('selected');
            
            // Clear other selections
            this.selectedColor = null;
            this.selectedColorName = null;
            this.selectedColorDescription = null;
            this.isLineMode = false;
            this.selectedPloppableType = null;
            this.isPermanentMode = false;
            this.isDemolishMode = false;
            this.clearVisualizationModes();
            
            // Clear button selections
            document.querySelectorAll('.color-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            document.querySelectorAll('.ploppable-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
            const demolishButton = document.getElementById('demolish-button');
            if (demolishButton) {
              demolishButton.classList.remove('selected');
            }
            
            // Reset pending state
            this.pendingSpawnerCell = null;
            
            this.clearHighlight();
            this.updateSelectionInfo();
          } else {
            vehicleButton.classList.remove('selected');
            this.pendingSpawnerCell = null;
            this.clearHighlight();
            this.updateSelectionInfo();
          }
        });
      }
    });
  }

  private setupPermanentButton(): void {
    this.time.delayedCall(100, () => {
      const permanentButton = document.getElementById('permanent-button');
      
      if (permanentButton) {
        permanentButton.addEventListener('click', () => {
          // Toggle permanent mode
          this.isPermanentMode = !this.isPermanentMode;
          
          // Update button appearance
          if (this.isPermanentMode) {
            permanentButton.classList.add('selected');
            permanentButton.textContent = 'Mark Permanent (Active)';
          } else {
            permanentButton.classList.remove('selected');
            permanentButton.textContent = 'Mark Permanent';
          }
          
          // Clear any color selection when entering permanent mode
          if (this.isPermanentMode) {
            this.selectedColor = null;
            this.selectedColorName = null;
            this.selectedColorDescription = null;
            this.isLineMode = false;
            this.selectedPloppableType = null;
            this.isVehicleSpawnerMode = false;
            this.isDemolishMode = false;
            this.pendingSpawnerCell = null;
            this.clearVisualizationModes();
            
            // Clear color button selections
            document.querySelectorAll('.color-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            document.querySelectorAll('.ploppable-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            const vehicleButton = document.getElementById('vehicle-spawner-button');
            if (vehicleButton) {
              vehicleButton.classList.remove('selected');
            }
            const demolishButton = document.getElementById('demolish-button');
            if (demolishButton) {
              demolishButton.classList.remove('selected');
            }
            
            this.clearHighlight();
            this.updateSelectionInfo();
          }
        });
      }
    });
  }

  private setupDemolishButton(): void {
    this.time.delayedCall(100, () => {
      const demolishButton = document.getElementById('demolish-button');
      
      if (demolishButton) {
        demolishButton.addEventListener('click', () => {
          // Toggle demolish mode
          this.isDemolishMode = !this.isDemolishMode;
          
          // Update button appearance
          if (this.isDemolishMode) {
            demolishButton.classList.add('selected');
            
            // Clear other selections
            this.selectedColor = null;
            this.selectedColorName = null;
            this.selectedColorDescription = null;
            this.isLineMode = false;
            this.selectedPloppableType = null;
            this.isVehicleSpawnerMode = false;
            this.isPermanentMode = false;
            this.pendingSpawnerCell = null;
            this.clearVisualizationModes();
            
            // Clear button selections
            document.querySelectorAll('.color-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            document.querySelectorAll('.ploppable-button').forEach(btn => {
              btn.classList.remove('selected');
            });
            const vehicleButton = document.getElementById('vehicle-spawner-button');
            if (vehicleButton) {
              vehicleButton.classList.remove('selected');
            }
            const pedestrianButton = document.getElementById('pedestrian-spawner-button');
            if (pedestrianButton) {
              pedestrianButton.classList.remove('selected');
            }
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
            
            this.clearHighlight();
            this.updateSelectionInfo();
          } else {
            demolishButton.classList.remove('selected');
            this.clearHighlight();
            this.updateSelectionInfo();
          }
        });
      }
    });
  }

  /**
   * Clear visualization modes (helper method)
   */
  private clearVisualizationModes(): void {
    this.showAppealVisualization = false;
    this.showSafetyVisualization = false;
    const appealButton = document.getElementById('appeal-visualization-button');
    const safetyButton = document.getElementById('safety-visualization-button');
    if (appealButton) appealButton.classList.remove('selected');
    if (safetyButton) safetyButton.classList.remove('selected');
  }

  private setupAppealVisualizationButton(): void {
    this.time.delayedCall(100, () => {
      const appealButton = document.getElementById('appeal-visualization-button');
      
      if (appealButton) {
        appealButton.addEventListener('click', () => {
          // Toggle appeal visualization
          this.showAppealVisualization = !this.showAppealVisualization;
          
          // If enabling appeal, disable safety (mutually exclusive)
          if (this.showAppealVisualization) {
            this.showSafetyVisualization = false;
            const safetyButton = document.getElementById('safety-visualization-button');
            if (safetyButton) {
              safetyButton.classList.remove('selected');
            }
            appealButton.classList.add('selected');
          } else {
            appealButton.classList.remove('selected');
          }
          
          // Redraw to show/hide visualization
          this.redrawGrid();
        });
      }
    });
  }

  private setupSafetyVisualizationButton(): void {
    this.time.delayedCall(100, () => {
      const safetyButton = document.getElementById('safety-visualization-button');
      
      if (safetyButton) {
        safetyButton.addEventListener('click', () => {
          // Toggle safety visualization
          this.showSafetyVisualization = !this.showSafetyVisualization;
          
          // If enabling safety, disable appeal (mutually exclusive)
          if (this.showSafetyVisualization) {
            this.showAppealVisualization = false;
            const appealButton = document.getElementById('appeal-visualization-button');
            if (appealButton) {
              appealButton.classList.remove('selected');
            }
            safetyButton.classList.add('selected');
          } else {
            safetyButton.classList.remove('selected');
          }
          
          // Redraw to show/hide visualization
          this.redrawGrid();
        });
      }
    });
  }

  /**
   * Demolish a ploppable at the given cell
   * Handles multi-part ploppables (vehicle spawner/despawner pairs)
   */
  private demolishAtCell(gridX: number, gridY: number): void {
    const cellData = this.gridManager.getCellData(gridX, gridY);
    if (!cellData) return;
    
    let needsRedraw = false;
    
    // Check for vehicle spawner/despawner
    if (cellData.vehicleSpawner || cellData.vehicleDespawner) {
      // Use SpawnerManager to remove the pair
      SpawnerManager.removeVehicleSpawnerPair(
        gridX,
        gridY,
        this.gridManager,
        this.vehicleSystem
      );
        needsRedraw = true;
    }
    
    // Check for ploppable
    if (cellData.ploppable) {
      const ploppableType = cellData.ploppable.type;
      
      // Special handling for Security Camera: restore Street Light when removed
      if (ploppableType === 'Security Camera') {
        // Remove Security Camera's safety AoE (8 radius)
        PloppableManager.removePloppable(gridX, gridY, this.gridManager, this.gridWidth, this.gridHeight);
        
        // Restore Street Light with default orientation
        const streetLight: Ploppable = {
          id: `Street Light-${gridX}-${gridY}-${Date.now()}`,
          type: 'Street Light',
          x: gridX,
          y: gridY,
          cost: 0,
          orientation: 0, // Default orientation
          orientationType: 'A',
          passable: true
        };
        
        // Place Street Light
        PloppableManager.placePloppable(gridX, gridY, streetLight, this.gridManager, this.gridWidth, this.gridHeight);
        needsRedraw = true;
        return;
      }
      
      // If it's a pedestrian spawner, remove from pedestrian system
      if (ploppableType === 'Pedestrian Spawner') {
        SpawnerManager.removePedestrianSpawner(gridX, gridY, this.pedestrianSystem);
      }
      
      // Special handling for Crosswalk: remove behavesLikeSidewalk property
      if (ploppableType === 'Crosswalk') {
        const cellData = this.gridManager.getCellData(gridX, gridY);
        if (cellData) {
          this.gridManager.setCellData(gridX, gridY, { ...cellData, behavesLikeSidewalk: undefined });
        }
      }
      
      // Remove ploppable using PloppableManager
      PloppableManager.removePloppable(gridX, gridY, this.gridManager, this.gridWidth, this.gridHeight);
      needsRedraw = true;
    }
    
    // Redraw if something was demolished
    if (needsRedraw) {
      this.redrawGrid();
    }
  }

  private setupExportImportButtons(): void {
    this.time.delayedCall(100, () => {
      const exportButton = document.getElementById('export-button');
      const importButton = document.getElementById('import-button');
      const importInput = document.getElementById('import-input') as HTMLInputElement;

      if (exportButton) {
        exportButton.addEventListener('click', () => {
          this.exportGrid();
        });
      }

      if (importButton && importInput) {
        importButton.addEventListener('click', () => {
          importInput.click();
        });

        importInput.addEventListener('change', (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            this.importGrid(file);
          }
        });
      }
    });
  }

  private setupGridResizeControls(): void {
    this.time.delayedCall(100, () => {
      const resizeButton = document.getElementById('resize-grid-button');
      const gridSizeXInput = document.getElementById('grid-size-x') as HTMLInputElement;
      const gridSizeYInput = document.getElementById('grid-size-y') as HTMLInputElement;

      // Initialize input values with current grid dimensions
      if (gridSizeXInput) {
        gridSizeXInput.value = this.gridWidth.toString();
      }
      if (gridSizeYInput) {
        gridSizeYInput.value = this.gridHeight.toString();
      }

      if (resizeButton) {
        resizeButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const newSizeX = parseInt(gridSizeXInput?.value || '10', 10);
          const newSizeY = parseInt(gridSizeYInput?.value || '10', 10);

          // Validate inputs
          if (isNaN(newSizeX) || isNaN(newSizeY) || newSizeX < 1 || newSizeY < 1 || newSizeX > 100 || newSizeY > 100) {
            alert('Please enter valid grid dimensions (1-100)');
            return;
          }

          // Check if dimensions changed
          if (newSizeX === this.gridWidth && newSizeY === this.gridHeight) {
            // No change needed
            return;
          }
          
          // Resize the grid
          try {
            this.resizeGrid(newSizeX, newSizeY);
          } catch (error) {
            console.error('Error resizing grid:', error);
            alert('Error resizing grid. Check console for details.');
          }
        });
      } else {
        console.error('Resize button not found!');
      }
    });
  }

  private resizeGrid(newWidth: number, newHeight: number): void {
    // Store existing grid data
    const serializedData = this.gridManager.serializeGrid();
    
    // Update grid dimensions
    this.gridWidth = newWidth;
    this.gridHeight = newHeight;
    
    // Create new GridManager with new dimensions
    this.gridManager = new GridManager(this.gridWidth, this.gridHeight);
    
    // Try to deserialize the old data (will only load cells that fit in new grid)
    const deserializeSuccess = this.gridManager.deserializeGrid(serializedData);
    if (!deserializeSuccess) {
      console.warn('Failed to deserialize grid data during resize');
    }
    
    // Re-center the grid (this recalculates gridOffsetX and gridOffsetY based on new size)
    // Do this BEFORE clearing graphics so offset is correct
    this.centerGrid();
    
    // Clear all graphics
    this.gridGraphics.clear();
    this.linesGraphics.clear();
    this.parkingSpotGraphics.clear();
    this.railGraphics.clear();
    this.vehicleGraphics.clear();
    this.pedestrianGraphics.clear();
    this.highlightGraphics.clear();
    this.clearLabels();
    
    // Reinitialize systems with new grid dimensions (this creates new empty systems)
    this.initializeSystems();
    
    // Rebuild spawner pairs from loaded data (after systems are reinitialized)
    SpawnerManager.rebuildSpawnerPairsFromGrid(
      this.gridManager,
      this.gridWidth,
      this.gridHeight,
      this.vehicleSystem,
      this.pedestrianSystem
    );
    
    // Ensure graphics are visible
    this.gridGraphics.setVisible(true);
    this.linesGraphics.setVisible(true);
    this.parkingSpotGraphics.setVisible(true);
    this.railGraphics.setVisible(true);
    this.vehicleGraphics.setVisible(true);
    this.pedestrianGraphics.setVisible(true);
    this.highlightGraphics.setVisible(true);
    
    // Redraw everything (this calls render() which draws all graphics)
    this.render();
    
    // Update input values to show the actual grid dimensions
    const gridSizeXInput = document.getElementById('grid-size-x') as HTMLInputElement;
    const gridSizeYInput = document.getElementById('grid-size-y') as HTMLInputElement;
    if (gridSizeXInput) {
      gridSizeXInput.value = this.gridWidth.toString();
    }
    if (gridSizeYInput) {
      gridSizeYInput.value = this.gridHeight.toString();
    }
  }

  // update() and updateGameUI() removed - now in BaseGameplayScene

  // Rebuild methods removed - now in SpawnerManager.rebuildSpawnerPairsFromGrid()
  // getAllParkingSpots and getPedestrianDestinations removed - now in BaseGameplayScene

  // Pathfinding methods removed - now in PathfindingUtilities

  // Rendering methods (drawRails, drawVehicles, drawPedestrians) removed - now in BaseGameplayScene.renderEntities() and EntityRenderer
}
