import Phaser from 'phaser';
import { getIsometricTilePoints } from '@/utils/isometric';
import { Ploppable } from '@/types';
import { BaseGameplayScene } from '@/core/BaseGameplayScene';
import { GameSystems } from '@/core/GameSystems';
import { PloppableManager } from '@/systems/PloppableManager';
import { SpawnerManager } from '@/managers/SpawnerManager';
import { GridInteractionHandler } from '@/systems/GridInteractionHandler';

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

  constructor() {
    super({ key: 'DevModeScene' }, 10); // gridSize = 10
  }

  protected setupScene(): void {
    // Initialize game systems for dev mode (starting budget of $10,000)
    GameSystems.resetForChallenge(10000);
    
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
  }

  // Grid rendering methods removed - now in BaseGameplayScene.render() and GridRenderer
  // Grid management methods removed - now use this.gridManager from BaseGameplayScene
  // Ploppable rendering methods removed - now in PloppableManager
  // Orientation calculation methods removed - now in PloppableManager

  // Wrapper method for rendering (calls base class render)
  private redrawGrid(): void {
    this.render();
  }

  // All rendering methods removed - now in BaseGameplayScene.render() and extracted renderers

  private paintCell(gridX: number, gridY: number): void {
    // Check bounds
    if (gridX < 0 || gridX >= this.gridSize || gridY < 0 || gridY >= this.gridSize) return;
    
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
      
      // Check if cell already has a ploppable, spawner, or despawner
      if (!PloppableManager.canPlacePloppable(gridX, gridY, this.gridManager)) {
        return;
      }
      
      // Get ploppable properties from button data attributes
      const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
      const orientationType = button?.getAttribute('data-orientation-type') as 'A' | 'B' | undefined;
      const passableAttr = button?.getAttribute('data-passable');
      const passable = passableAttr === 'true';
      
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
      PloppableManager.placePloppable(gridX, gridY, ploppable, this.gridManager);
      
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
    } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine') {
      // Draw preview for oriented ploppables
      const centerX = (offsetPoints[0].x + offsetPoints[2].x) / 2;
      const centerY = (offsetPoints[0].y + offsetPoints[2].y) / 2;
      
      // Get orientation type from button data
      const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
      const orientationType = button?.getAttribute('data-orientation-type') || 'B';
      
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
        // For Type B, show arrow pointing in the facing direction
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
      this.gridSize,
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
        if (this.isLineMode) {
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
        if (this.isLineMode) {
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

    if (this.isVehicleSpawnerMode) {
      // Show vehicle spawner info
      if (selectionInfo && colorPreview && selectionName && selectionDescription) {
        colorPreview.style.display = 'none';
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
      if (selectionInfo && colorPreview && selectionName && selectionDescription) {
        colorPreview.style.display = 'none';
        selectionName.textContent = 'Demolish Tool';
        selectionDescription.textContent = 'Click on any ploppable, vehicle spawner, or pedestrian spawner to remove it. Multi-part ploppables (like spawner/despawner pairs) will be fully removed.';
        selectionInfo.style.display = 'block';
      }
    } else if (this.selectedPloppableType) {
      // Show ploppable info
      if (selectionInfo && colorPreview && selectionName && selectionDescription) {
        // Hide color preview for ploppables
        colorPreview.style.display = 'none';
        selectionName.textContent = this.selectedPloppableType;
        
        // Build description with orientation info
        let description = '';
        if (this.selectedPloppableType === 'Pedestrian Spawner') {
          description = 'Click a cell to place a pedestrian spawner (🚶). Pedestrians will spawn here and wander randomly on the pedestrian rail grid.';
        } else {
          const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
          if (button) {
            description = button.getAttribute('data-description') || '';
          }
          if (this.selectedPloppableType === 'Parking Spot' || 
              this.selectedPloppableType === 'Trash Can' || 
              this.selectedPloppableType === 'Vending Machine') {
            description += '\n\nUse Q and E keys to rotate orientation.';
          }
        }
        selectionDescription.textContent = description;
        
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
      } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine') {
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
      } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine') {
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
    const serialized = this.gridManager.serializeGrid(this.gridSize);
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
          this.gridSize,
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
      
      // If it's a pedestrian spawner, remove from pedestrian system
      if (ploppableType === 'Pedestrian Spawner') {
        SpawnerManager.removePedestrianSpawner(gridX, gridY, this.pedestrianSystem);
      }
      
      // Remove ploppable using PloppableManager
      PloppableManager.removePloppable(gridX, gridY, this.gridManager);
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

  // update() and updateGameUI() removed - now in BaseGameplayScene

  // Rebuild methods removed - now in SpawnerManager.rebuildSpawnerPairsFromGrid()
  // getAllParkingSpots and getPedestrianDestinations removed - now in BaseGameplayScene

  // Pathfinding methods removed - now in PathfindingUtilities

  // Rendering methods (drawRails, drawVehicles, drawPedestrians) removed - now in BaseGameplayScene.renderEntities() and EntityRenderer
}
