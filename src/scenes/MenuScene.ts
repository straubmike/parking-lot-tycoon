import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { screenToIso, getIsometricTilePoints } from '@/utils/isometric';
import { CellData } from '@/types';

export class MenuScene extends Phaser.Scene {
  private gridSize = 10;
  private gridOffsetX = 0;
  private gridOffsetY = 0;
  private isDragging = false;
  private isPainting = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;
  private readonly minZoom = 0.5;
  private readonly maxZoom = 2.0;
  private readonly zoomStep = 0.1;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private highlightGraphics!: Phaser.GameObjects.Graphics;
  private hoveredCell: { x: number; y: number } | null = null;
  private cellData: Map<string, CellData> = new Map(); // Stores all cell data
  private selectedColor: number | null = null;
  private selectedColorName: string | null = null;
  private selectedColorDescription: string | null = null;
  private lastPaintedCell: { x: number; y: number } | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Calculate grid center position to center it in the viewport
    this.centerGrid();
    
    // Create graphics object for the grid (static)
    this.gridGraphics = this.add.graphics();
    this.drawGrid();
    
    // Create graphics object for hover highlight (will be updated)
    this.highlightGraphics = this.add.graphics();

    // Set up camera controls
    this.setupCameraControls();
    
    // Set up color selection buttons
    this.setupColorButtons();
    
    // Set up export/import buttons
    this.setupExportImportButtons();
  }

  private centerGrid(): void {
    // Calculate the center tile position in grid coordinates
    const centerGridX = (this.gridSize - 1) / 2;
    const centerGridY = (this.gridSize - 1) / 2;
    
    // Convert center grid position to screen coordinates (without offset)
    const centerScreenX = (centerGridX - centerGridY) * (TILE_WIDTH / 2);
    const centerScreenY = (centerGridX + centerGridY) * (TILE_HEIGHT / 2);
    
    // Get camera center (viewport center)
    const cameraCenterX = this.cameras.main.centerX;
    const cameraCenterY = this.cameras.main.centerY;
    
    // Calculate offset to center the grid
    this.gridOffsetX = cameraCenterX - centerScreenX;
    this.gridOffsetY = cameraCenterY - centerScreenY;
  }

  private drawGrid(): void {
    this.gridGraphics.clear();
    
    // Draw 10x10 isometric grid
    for (let x = 0; x < this.gridSize; x++) {
      for (let y = 0; y < this.gridSize; y++) {
        this.drawCell(x, y);
      }
    }
  }

  private getCellKey(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  private getCellData(gridX: number, gridY: number): CellData | undefined {
    const cellKey = this.getCellKey(gridX, gridY);
    return this.cellData.get(cellKey);
  }

  private setCellData(gridX: number, gridY: number, data: CellData): void {
    const cellKey = this.getCellKey(gridX, gridY);
    const existingData = this.cellData.get(cellKey) || {};
    this.cellData.set(cellKey, { ...existingData, ...data });
  }

  private drawCell(gridX: number, gridY: number): void {
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + this.gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + this.gridOffsetY;
    
    // Calculate diamond points
    const topX = screenX;
    const topY = screenY - TILE_HEIGHT / 2;
    const rightX = screenX + TILE_WIDTH / 2;
    const rightY = screenY;
    const bottomX = screenX;
    const bottomY = screenY + TILE_HEIGHT / 2;
    const leftX = screenX - TILE_WIDTH / 2;
    const leftY = screenY;
    
    // Get color from cell data or use default checkerboard
    const cellData = this.getCellData(gridX, gridY);
    let color: number;
    if (cellData?.color !== undefined) {
      color = cellData.color;
    } else {
      // Default checkerboard pattern
      color = (gridX + gridY) % 2 === 0 ? 0x4a4a4a : 0x3a3a3a;
    }
    
    // Draw filled diamond using two triangles
    this.gridGraphics.fillStyle(color, 1);
    this.gridGraphics.fillTriangle(topX, topY, rightX, rightY, bottomX, bottomY);
    this.gridGraphics.fillTriangle(topX, topY, bottomX, bottomY, leftX, leftY);
    
    // Draw border
    this.gridGraphics.lineStyle(1, 0x555555, 1);
    this.gridGraphics.lineBetween(topX, topY, rightX, rightY);
    this.gridGraphics.lineBetween(rightX, rightY, bottomX, bottomY);
    this.gridGraphics.lineBetween(bottomX, bottomY, leftX, leftY);
    this.gridGraphics.lineBetween(leftX, leftY, topX, topY);
  }

  private paintCell(gridX: number, gridY: number): void {
    if (this.selectedColor === null) return;
    
    // Check bounds
    if (gridX < 0 || gridX >= this.gridSize || gridY < 0 || gridY >= this.gridSize) return;
    
    // Check if we already painted this cell (prevent duplicates during drag)
    if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) {
      return;
    }
    
    // Store the color in cell data
    this.setCellData(gridX, gridY, { color: this.selectedColor });
    
    // Redraw the cell
    this.drawCell(gridX, gridY);
    
    // Remember last painted cell
    this.lastPaintedCell = { x: gridX, y: gridY };
  }

  private drawHighlight(gridX: number, gridY: number): void {
    this.highlightGraphics.clear();
    
    // Get diamond points for this grid cell
    const points = getIsometricTilePoints(gridX, gridY);
    
    // Offset points by grid offset
    const offsetPoints = points.map(p => ({
      x: p.x + this.gridOffsetX,
      y: p.y + this.gridOffsetY
    }));
    
    // Draw subtle yellow border (thin and transparent)
    this.highlightGraphics.lineStyle(1.5, 0xffff00, 0.6);
    this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
    this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
    this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
    this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
  }

  private clearHighlight(): void {
    this.highlightGraphics.clear();
    this.hoveredCell = null;
  }

  private getCellAtPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } | null {
    // Get world coordinates (accounting for camera scroll and zoom)
    const worldX = this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
    const worldY = this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
    
    // Convert to coordinates relative to grid origin (accounting for grid offset)
    const relativeX = worldX - this.gridOffsetX;
    const relativeY = worldY - this.gridOffsetY;
    
    // Convert to isometric grid coordinates
    const isoCoords = screenToIso(relativeX, relativeY);
    
    // Round to nearest grid cell
    const gridX = Math.round(isoCoords.x);
    const gridY = Math.round(isoCoords.y);
    
    // Check if within grid bounds
    if (gridX >= 0 && gridX < this.gridSize && gridY >= 0 && gridY < this.gridSize) {
      return { x: gridX, y: gridY };
    }
    return null;
  }

  private updateHoverHighlight(pointer: Phaser.Input.Pointer): void {
    // Skip if dragging camera
    if (this.isDragging) {
      return;
    }
    
    const cell = this.getCellAtPointer(pointer);
    
    if (cell) {
      // Check if this is a new hovered cell
      if (!this.hoveredCell || this.hoveredCell.x !== cell.x || this.hoveredCell.y !== cell.y) {
        this.hoveredCell = cell;
        this.drawHighlight(cell.x, cell.y);
      }
    } else {
      // Mouse is outside grid bounds
      if (this.hoveredCell) {
        this.clearHighlight();
      }
    }
  }

  private setupCameraControls(): void {
    // Prevent context menu on right click
    this.input.mouse?.disableContextMenu();

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
      // Check if left mouse button (button 0) - paint
      else if (pointer.leftButtonDown() && this.selectedColor !== null) {
        this.isPainting = true;
        this.lastPaintedCell = null; // Reset for new paint stroke
        const cell = this.getCellAtPointer(pointer);
        if (cell) {
          this.paintCell(cell.x, cell.y);
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
      } else if (this.isPainting && pointer.leftButtonDown() && this.selectedColor !== null) {
        // Paint while dragging
        const cell = this.getCellAtPointer(pointer);
        if (cell) {
          this.paintCell(cell.x, cell.y);
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
      
      colorButtons.forEach((button) => {
        button.addEventListener('click', () => {
          // Remove selected class from all buttons
          colorButtons.forEach(btn => btn.classList.remove('selected'));
          
          // Add selected class to clicked button
          button.classList.add('selected');
          
          // Get color from data attribute and convert to hex number
          const colorHex = button.getAttribute('data-color');
          if (colorHex) {
            this.selectedColor = parseInt('0x' + colorHex, 16);
          }
          
          // Get name and description
          this.selectedColorName = button.getAttribute('data-name') || null;
          this.selectedColorDescription = button.getAttribute('data-description') || null;
          
          // Update selection info in right panel
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

    if (this.selectedColor !== null && selectionInfo && colorPreview && selectionName && selectionDescription) {
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

  private serializeGrid(): string {
    // Convert Map to object for JSON serialization
    const gridData: Record<string, CellData> = {};
    this.cellData.forEach((value, key) => {
      gridData[key] = value;
    });
    
    return JSON.stringify({
      gridSize: this.gridSize,
      cellData: gridData,
      version: '1.0' // For future compatibility
    });
  }

  private deserializeGrid(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      
      // Clear existing cell data
      this.cellData.clear();
      
      // Load cell data
      if (data.cellData && typeof data.cellData === 'object') {
        Object.entries(data.cellData).forEach(([key, value]) => {
          this.cellData.set(key, value as CellData);
        });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to load grid:', error);
      return false;
    }
  }

  private exportGrid(): void {
    const serialized = this.serializeGrid();
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
      const success = this.deserializeGrid(content);
      if (success) {
        this.drawGrid(); // Redraw with imported data
        console.log('Grid imported from file');
      } else {
        alert('Failed to import grid. Invalid file format.');
      }
    };
    reader.readAsText(file);
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
}

