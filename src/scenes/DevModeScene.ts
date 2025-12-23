import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { screenToIso, getIsometricTilePoints, isoToScreen } from '@/utils/isometric';
import { CellData, Ploppable, SpawnerDespawnerPair } from '@/types';
import { VehicleSystem } from '@/systems/VehicleSystem';
import { PedestrianSystem } from '@/systems/PedestrianSystem';
import { GameSystems } from '@/core/GameSystems';

export class DevModeScene extends Phaser.Scene {
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
  private linesGraphics!: Phaser.GameObjects.Graphics;
  private parkingSpotGraphics!: Phaser.GameObjects.Graphics;
  private railGraphics!: Phaser.GameObjects.Graphics;
  private permanentLabels: Phaser.GameObjects.Text[] = [];
  private hoveredCell: { x: number; y: number } | null = null;
  private hoveredEdge: { cellX: number; cellY: number; edge: number } | null = null;
  private cellData: Map<string, CellData> = new Map(); // Stores all cell data
  // Border segment: stores cell coordinates, edge index, and color
  // Key format: `${cellX},${cellY},${edge}`
  private borderSegments: Map<string, number> = new Map();
  private selectedColor: number | null = null;
  private selectedColorName: string | null = null;
  private selectedColorDescription: string | null = null;
  private isLineMode: boolean = false;
  private isPermanentMode: boolean = false;
  private selectedPloppableType: string | null = null;
  private ploppableOrientation: number = 0; // 0=north, 1=east, 2=south, 3=west
  private lastPaintedCell: { x: number; y: number } | null = null;
  private isVehicleSpawnerMode: boolean = false;
  private isDemolishMode: boolean = false; // Demolish mode for removing ploppables
  private pendingSpawnerCell: { x: number; y: number } | null = null; // Cell where spawner was placed, waiting for despawner
  private vehicleSpawnerLabels: Phaser.GameObjects.Text[] = []; // Labels for spawner/despawner emojis
  private ploppableLabels: Phaser.GameObjects.Text[] = []; // Labels for ploppable emojis (trash can, vending machine, etc.)
  private vehicleSystem!: VehicleSystem;
  private vehicleGraphics!: Phaser.GameObjects.Graphics;
  private pedestrianSystem!: PedestrianSystem;
  private pedestrianGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'DevModeScene' });
  }

  create(): void {
    // Initialize game systems for dev mode (starting budget of $10,000)
    GameSystems.resetForChallenge(10000);
    
    // Calculate grid center position to center it in the viewport
    this.centerGrid();
    
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
    
    // Create graphics object for pedestrian rails - drawn on top of vehicle rails
    
    // Create graphics object for hover highlight (will be updated) - drawn on top of everything
    this.highlightGraphics = this.add.graphics();
    this.highlightGraphics.setDepth(2);
    
    // Create graphics object for vehicles - drawn on top of grid but below highlights
    this.vehicleGraphics = this.add.graphics();
    this.vehicleGraphics.setDepth(1.8);
    
    // Create graphics object for pedestrians - drawn on top of grid but below highlights
    this.pedestrianGraphics = this.add.graphics();
    this.pedestrianGraphics.setDepth(1.85);
    
    // Create edge blocking callback for pathfinding
    const isEdgeBlocked = (
      cellX: number, 
      cellY: number, 
      edge: number, 
      entityType: 'vehicle' | 'pedestrian', 
      checkParkingSpots: boolean,
      movementDirection: 'north' | 'south' | 'east' | 'west'
    ): boolean => {
      return this.isEdgeBlockedForEntity(cellX, cellY, edge, entityType, checkParkingSpots, movementDirection);
    };
    
    // Initialize pedestrian system first (needed by vehicle system)
    this.pedestrianSystem = new PedestrianSystem(
      this.gridSize,
      (x: number, y: number) => this.getCellData(x, y),
      () => this.getPedestrianDestinations(),
      isEdgeBlocked
    );
    
    // Initialize vehicle system (with pedestrian system reference)
    this.vehicleSystem = new VehicleSystem(
      this.gridSize,
      (x: number, y: number) => this.getCellData(x, y),
      () => this.getAllParkingSpots(),
      isEdgeBlocked,
      this.pedestrianSystem
    );
    
    // Draw the grid and lines
    this.drawGrid();
    this.drawLines();
    this.drawRails();

    // Set up camera controls
    this.setupCameraControls();
    
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
    this.parkingSpotGraphics.clear();
    
    // Clear existing permanent labels
    this.permanentLabels.forEach(label => label.destroy());
    this.permanentLabels = [];
    
    // Clear existing vehicle spawner/despawner labels
    this.vehicleSpawnerLabels.forEach(label => label.destroy());
    this.vehicleSpawnerLabels = [];
    
    // Clear existing ploppable labels
    this.ploppableLabels.forEach(label => label.destroy());
    this.ploppableLabels = [];
    
    // Draw 10x10 isometric grid
    for (let x = 0; x < this.gridSize; x++) {
      for (let y = 0; y < this.gridSize; y++) {
        this.drawCell(x, y);
        this.drawPermanentLabel(x, y);
        this.drawParkingSpotLines(x, y);
        this.drawVehicleSpawnerDespawner(x, y);
        this.drawPedestrianSpawner(x, y);
        this.drawPloppable(x, y);
      }
    }
  }

  private getCellKey(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  /**
   * Get a simple key for a border segment: cell coordinates and edge index
   * Format: `${cellX},${cellY},${edge}` where edge is 0=top, 1=right, 2=bottom, 3=left
   */
  private getBorderSegmentKey(cellX: number, cellY: number, edge: number): string {
    return `${cellX},${cellY},${edge}`;
  }

  /**
   * Get all possible keys for a border segment, since edges are shared between adjacent cells
   * Returns an array of all possible keys (from current cell and adjacent cell if applicable)
   */
  private getAllPossibleBorderSegmentKeys(cellX: number, cellY: number, edge: number): string[] {
    const allKeys: string[] = [];
    
    // Get the current cell's edge key
    const currentKey = this.getBorderSegmentKey(cellX, cellY, edge);
    allKeys.push(currentKey);
    
    // Check for adjacent cell that shares this edge
    // Edge relationships in isometric grid (based on actual cell positions):
    // - Left edge (3) of (x,y) = Right edge (1) of (x-1, y) [horizontal neighbor]
    // - Right edge (1) of (x,y) = Left edge (3) of (x+1, y) [horizontal neighbor]
    // - Top edge (0) of (x,y) = Bottom edge (2) of (x-1, y+1) [diagonal neighbor]
    // - Bottom edge (2) of (x,y) = Top edge (0) of (x+1, y-1) [diagonal neighbor]
    
    if (edge === 0) { // top - shared with bottom of (x-1, y+1)
      const neighborX = cellX - 1;
      const neighborY = cellY + 1;
      if (neighborX >= 0 && neighborY < this.gridSize) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 2)); // bottom
      }
    } else if (edge === 1) { // right - shared with left of (x+1, y) [fixed: horizontal, not diagonal]
      const neighborX = cellX + 1;
      const neighborY = cellY;
      if (neighborX < this.gridSize && neighborY >= 0 && neighborY < this.gridSize) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 3)); // left
      }
    } else if (edge === 2) { // bottom - shared with top of (x+1, y-1)
      const neighborX = cellX + 1;
      const neighborY = cellY - 1;
      if (neighborX < this.gridSize && neighborY >= 0) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 0)); // top
      }
    } else if (edge === 3) { // left - shared with right of (x-1, y) [fixed: horizontal, not diagonal]
      const neighborX = cellX - 1;
      const neighborY = cellY;
      if (neighborX >= 0 && neighborY >= 0 && neighborY < this.gridSize) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 1)); // right
      }
    }
    
    return allKeys;
  }

  /**
   * Find the existing border segment key for a given edge, checking all possible keys
   * Returns the key if found, or null if not found
   */
  private findExistingBorderSegmentKey(cellX: number, cellY: number, edge: number): string | null {
    const allKeys = this.getAllPossibleBorderSegmentKeys(cellX, cellY, edge);
    
    for (const key of allKeys) {
      if (this.borderSegments.has(key)) {
        return key;
      }
    }
    
    return null;
  }

  /**
   * Get the screen coordinates for a border segment
   * Returns the start and end points of the edge in screen space
   */
  private getBorderSegmentCoords(cellX: number, cellY: number, edge: number): { startX: number; startY: number; endX: number; endY: number } {
    const points = getIsometricTilePoints(cellX, cellY);
    const offsetPoints = points.map(p => ({
      x: p.x + this.gridOffsetX,
      y: p.y + this.gridOffsetY
    }));
    
    const startIdx = edge;
    const endIdx = (edge + 1) % 4;
    
    return {
      startX: offsetPoints[startIdx].x,
      startY: offsetPoints[startIdx].y,
      endX: offsetPoints[endIdx].x,
      endY: offsetPoints[endIdx].y
    };
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

  // NOTE: Lane line blocking is now handled directly in isEdgeBlockedForEntity() during pathfinding.
  // The canNorth/canSouth/canEast/canWest properties on CellData are no longer used for pathfinding
  // but are kept for potential future use (UI display, etc.).

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

  private drawParkingSpotLines(gridX: number, gridY: number): void {
    const cellData = this.getCellData(gridX, gridY);
    if (cellData?.ploppable?.type !== 'Parking Spot') return;
    
    const orientation = cellData.ploppable.orientation || 0;
    
    // Get diamond points
    const points = getIsometricTilePoints(gridX, gridY);
    const offsetPoints = points.map(p => ({
      x: p.x + this.gridOffsetX,
      y: p.y + this.gridOffsetY
    }));
    
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
    
    const edges = edgesToDraw[orientation];
    
    // Draw lines on parkingSpotGraphics so they're above the grid
    this.parkingSpotGraphics.lineStyle(2, 0xffffff, 1);
    edges.forEach(edgeIdx => {
      const startIdx = edgeIdx;
      const endIdx = (edgeIdx + 1) % 4;
      this.parkingSpotGraphics.lineBetween(
        offsetPoints[startIdx].x,
        offsetPoints[startIdx].y,
        offsetPoints[endIdx].x,
        offsetPoints[endIdx].y
      );
    });
  }

  private drawPermanentLabel(gridX: number, gridY: number): void {
    const cellData = this.getCellData(gridX, gridY);
    if (!cellData?.isPermanent) return;
    
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + this.gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + this.gridOffsetY;
    
    // Create "P" label
    const label = this.add.text(screenX, screenY, 'P', {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    
    // Center the text
    label.setOrigin(0.5, 0.5);
    label.setDepth(3); // Draw on top of grid
    
    this.permanentLabels.push(label);
  }

  private drawVehicleSpawnerDespawner(gridX: number, gridY: number): void {
    const cellData = this.getCellData(gridX, gridY);
    if (!cellData?.vehicleSpawner && !cellData?.vehicleDespawner) return;
    
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + this.gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + this.gridOffsetY;
    
    // Create emoji label
    const emoji = cellData.vehicleSpawner ? '🚗' : '🎯';
    const label = this.add.text(screenX, screenY, emoji, {
      fontSize: '24px',
    });
    
    // Center the text
    label.setOrigin(0.5, 0.5);
    label.setDepth(3); // Draw on top of grid
    
    this.vehicleSpawnerLabels.push(label);
  }

  private drawPedestrianSpawner(gridX: number, gridY: number): void {
    const cellData = this.getCellData(gridX, gridY);
    if (cellData?.ploppable?.type !== 'Pedestrian Spawner') return;
    
    // Convert grid coords to screen coords (isometric)
    const screenX = (gridX - gridY) * (TILE_WIDTH / 2) + this.gridOffsetX;
    const screenY = (gridX + gridY) * (TILE_HEIGHT / 2) + this.gridOffsetY;
    
    // Create emoji label
    const label = this.add.text(screenX, screenY, '🚶', {
      fontSize: '24px',
    });
    
    // Center the text
    label.setOrigin(0.5, 0.5);
    label.setDepth(3); // Draw on top of grid
    
    this.vehicleSpawnerLabels.push(label); // Reuse the same array for simplicity
  }

  /**
   * Calculate position along rail intersection for orientation-based ploppables
   * The rails form an X intersection at the cell center. Each orientation corresponds
   * to one of the four extremities of this X (along the rail directions).
   * @param centerX Screen X coordinate of cell center
   * @param centerY Screen Y coordinate of cell center
   * @param orientation 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
   * @param distance Distance from center along the rail direction
   * @returns Screen coordinates for the position
   */
  private getOrientationPosition(centerX: number, centerY: number, orientation: number, distance: number): { x: number; y: number } {
    // Calculate the direction vector length
    const directionLength = Math.sqrt(TILE_WIDTH * TILE_WIDTH + TILE_HEIGHT * TILE_HEIGHT) / 2;
    
    // Unit vectors for each orientation (along rail directions from center)
    let dirX: number, dirY: number;
    switch (orientation) {
      case 0: // Top-left: along row rail towards smaller X (decreasing X, same Y)
        dirX = -TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 1: // Top-right: along column rail towards smaller Y (same X, decreasing Y)
        dirX = TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 2: // Bottom-right: along row rail towards larger X (increasing X, same Y)
        dirX = TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      case 3: // Bottom-left: along column rail towards larger Y (same X, increasing Y)
        dirX = -TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      default:
        dirX = 0;
        dirY = 0;
    }
    
    // Normalize the direction vector and scale by distance
    const scale = distance / directionLength;
    return {
      x: centerX + dirX * scale,
      y: centerY + dirY * scale
    };
  }
  
  /**
   * Calculate position for Type A ploppables (trash can, etc.)
   * Positions are at the extremities of the rail X intersection, but inside the cell.
   * Uses a percentage of the distance from center to edge to ensure positions stay well inside.
   * @param centerX Screen X coordinate of cell center
   * @param centerY Screen Y coordinate of cell center
   * @param orientation 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
   * @returns Screen coordinates for the position
   */
  private getTypeAPosition(centerX: number, centerY: number, orientation: number): { x: number; y: number } {
    // The distance from center to edge along each rail direction is directionLength
    const directionLength = Math.sqrt(TILE_WIDTH * TILE_WIDTH + TILE_HEIGHT * TILE_HEIGHT) / 2;
    
    // Use 40% of the distance from center to edge to ensure positions are subtly inside the cell borders
    const distanceFromCenter = directionLength * 0.4;
    return this.getOrientationPosition(centerX, centerY, orientation, distanceFromCenter);
  }

  /**
   * Draw an arrow from the center pointing in the orientation direction
   * Used for Type B ploppables (vending machine, etc.) to show facing direction
   * @param graphics Graphics object to draw on
   * @param centerX Screen X coordinate of cell center
   * @param centerY Screen Y coordinate of cell center
   * @param orientation 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
   * @param arrowLength Length of the arrow shaft in pixels
   * @param color Color of the arrow (hex number)
   * @param alpha Alpha/opacity of the arrow (0-1)
   */
  private drawOrientationArrow(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    orientation: number,
    arrowLength: number = 20,
    color: number = 0x00ff00,
    alpha: number = 1.0
  ): void {
    // Get the direction vector for this orientation
    const directionLength = Math.sqrt(TILE_WIDTH * TILE_WIDTH + TILE_HEIGHT * TILE_HEIGHT) / 2;
    let dirX: number, dirY: number;
    switch (orientation) {
      case 0: // Top-left
        dirX = -TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 1: // Top-right
        dirX = TILE_WIDTH / 2;
        dirY = -TILE_HEIGHT / 2;
        break;
      case 2: // Bottom-right
        dirX = TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      case 3: // Bottom-left
        dirX = -TILE_WIDTH / 2;
        dirY = TILE_HEIGHT / 2;
        break;
      default:
        dirX = 0;
        dirY = 0;
    }
    
    // Normalize the direction vector
    const scale = arrowLength / directionLength;
    const endX = centerX + dirX * scale;
    const endY = centerY + dirY * scale;
    
    // Draw arrow shaft
    graphics.lineStyle(2, color, alpha);
    graphics.lineBetween(centerX, centerY, endX, endY);
    
    // Draw arrowhead (small triangle at the end)
    const arrowheadSize = 6;
    const arrowheadAngle = Math.atan2(dirY, dirX);
    
    // Calculate arrowhead points (perpendicular to the direction)
    const perpAngle = arrowheadAngle + Math.PI / 2;
    const arrowheadBaseX = endX - Math.cos(arrowheadAngle) * arrowheadSize;
    const arrowheadBaseY = endY - Math.sin(arrowheadAngle) * arrowheadSize;
    
    const arrowheadLeftX = arrowheadBaseX + Math.cos(perpAngle) * arrowheadSize * 0.5;
    const arrowheadLeftY = arrowheadBaseY + Math.sin(perpAngle) * arrowheadSize * 0.5;
    
    const arrowheadRightX = arrowheadBaseX - Math.cos(perpAngle) * arrowheadSize * 0.5;
    const arrowheadRightY = arrowheadBaseY - Math.sin(perpAngle) * arrowheadSize * 0.5;
    
    // Fill arrowhead triangle
    graphics.fillStyle(color, alpha);
    graphics.fillTriangle(endX, endY, arrowheadLeftX, arrowheadLeftY, arrowheadRightX, arrowheadRightY);
  }

  /**
   * Draw ploppables with orientation types A and B
   * Type A: Position along rail extremities (trash can, etc.) - origin at mid-bottom of sprite
   * Type B: Central position with rotation indicator (vending machine, etc.)
   */
  private drawPloppable(gridX: number, gridY: number): void {
    const cellData = this.getCellData(gridX, gridY);
    if (!cellData?.ploppable) return;
    
    const ploppable = cellData.ploppable;
    
    // Skip ploppables that have their own rendering (parking spot, pedestrian spawner)
    if (ploppable.type === 'Parking Spot' || ploppable.type === 'Pedestrian Spawner') return;
    
    // Convert grid coords to screen coords (isometric center)
    const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + this.gridOffsetX;
    const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + this.gridOffsetY;
    
    const orientation = ploppable.orientation || 0;
    const orientationType = ploppable.orientationType || 'B'; // Default to Type B
    
    // Get emoji based on ploppable type
    let emoji = '❓';
    if (ploppable.type === 'Trash Can') emoji = '🗑️';
    else if (ploppable.type === 'Vending Machine') emoji = '🥤';
    
    if (orientationType === 'A') {
      // Type A: Position along rail extremities, but inside the cell
      // Uses 50% of the distance from center to edge to ensure positions stay well inside
      const position = this.getTypeAPosition(centerX, centerY, orientation);
      
      // Create emoji label - origin at mid-bottom for Type A (trash can)
      const label = this.add.text(position.x, position.y, emoji, {
        fontSize: '18px',
      });
      label.setOrigin(0.5, 1.0); // Mid-bottom origin
      label.setDepth(3);
      this.ploppableLabels.push(label);
    } else {
      // Type B: Central position with rotation indicator (arrow showing facing direction)
      // Create main emoji label at center
      const label = this.add.text(centerX, centerY, emoji, {
        fontSize: '24px',
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(3);
      this.ploppableLabels.push(label);
      
      // Draw orientation arrow pointing in the facing direction
      this.drawOrientationArrow(
        this.parkingSpotGraphics,
        centerX,
        centerY,
        orientation,
        20, // arrow length
        0x00ff00, // green color
        1.0 // full opacity
      );
    }
  }

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
      
      const cellData = this.getCellData(gridX, gridY);
      const isPermanent = cellData?.isPermanent || false;
      
      // Toggle permanent status
      this.setCellData(gridX, gridY, { isPermanent: !isPermanent });
      
      // Redraw the grid to update permanent labels
      this.drawGrid();
      this.drawLines();
      this.drawRails();
      
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
      
      const cellData = this.getCellData(gridX, gridY);
      
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
        
        // Place despawner
        this.setCellData(gridX, gridY, { vehicleDespawner: true });
        
        // Register spawner-despawner pair with vehicle system
        const pair: SpawnerDespawnerPair = {
          spawnerX: this.pendingSpawnerCell.x,
          spawnerY: this.pendingSpawnerCell.y,
          despawnerX: gridX,
          despawnerY: gridY
        };
        this.vehicleSystem.addSpawnerDespawnerPair(pair);
        
        // Clear pending state and exit spawner mode
        this.pendingSpawnerCell = null;
        this.isVehicleSpawnerMode = false;
        
        // Update button state
        const vehicleButton = document.getElementById('vehicle-spawner-button');
        if (vehicleButton) {
          vehicleButton.classList.remove('selected');
        }
        
        // Redraw grid
        this.drawGrid();
        this.drawLines();
        this.drawRails();
        
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
        this.setCellData(gridX, gridY, { vehicleSpawner: true });
        this.pendingSpawnerCell = { x: gridX, y: gridY };
        
        // Redraw grid
        this.drawGrid();
        this.drawLines();
        this.drawRails();
        
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
      const cellData = this.getCellData(gridX, gridY);
      if (cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner) {
        // Cell already has a ploppable or vehicle entity, don't place another one
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
      
      // Store in cell data
      this.setCellData(gridX, gridY, { ploppable });
      
      // If this is a pedestrian spawner, register it with the pedestrian system
      if (this.selectedPloppableType === 'Pedestrian Spawner') {
        this.pedestrianSystem.addDestination(gridX, gridY);
      }
      
      // Redraw grid to show parking spot lines and ploppable label
      this.drawGrid();
      this.drawLines();
      this.drawRails();
      
      // Remember last painted cell
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }
    
    if (this.selectedColor === null) return;
    
    if (this.isLineMode && this.hoveredEdge) {
      const { cellX, cellY, edge } = this.hoveredEdge;
      
      // Check if we already toggled this exact edge (prevent duplicates during drag)
      if (this.lastPaintedCell && 
          this.lastPaintedCell.x === cellX && 
          this.lastPaintedCell.y === cellY) {
        return;
      }
      
      // Use the current cell's key for storage (so coordinates match what user sees)
      const currentKey = this.getBorderSegmentKey(cellX, cellY, edge);
      
      // Find existing key if any (check all possible keys for shared edges)
      const existingKey = this.findExistingBorderSegmentKey(cellX, cellY, edge);
      const existingEdgeColor = existingKey ? this.borderSegments.get(existingKey) : undefined;
      
      // Toggle logic:
      // - If a line exists with the selected color, remove it (toggle off)
      // - Otherwise, add/update the line (toggle on)
      if (existingKey && existingEdgeColor === this.selectedColor) {
        // Toggle off: remove the existing line (works regardless of which cell's key it was stored under)
        this.borderSegments.delete(existingKey);
      } else {
        // Toggle on: add or update the line
        // If there's an existing key with a different color, remove it first (cleanup)
        if (existingKey && existingKey !== currentKey) {
          this.borderSegments.delete(existingKey);
        }
        
        // Add/update using current cell's key (matches what user sees)
        this.borderSegments.set(currentKey, this.selectedColor);
      }
      
      // Redraw lines
      this.drawLines();
      
      // Remember last painted edge
      this.lastPaintedCell = { x: cellX, y: cellY };
    } else if (!this.isLineMode) {
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
        const indicatorPos = this.getTypeAPosition(centerX, centerY, this.ploppableOrientation);
        this.highlightGraphics.fillStyle(0x00ff00, 0.8);
        this.highlightGraphics.fillCircle(indicatorPos.x, indicatorPos.y, 4);
      } else {
        // For Type B, show arrow pointing in the facing direction
        this.drawOrientationArrow(
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
      // Draw blue line on the specific edge (same style as yellow highlight)
      this.highlightGraphics.lineStyle(1.5, 0x0000ff, 0.6);
      const startIdx = edge;
      const endIdx = (edge + 1) % 4;
      this.highlightGraphics.lineBetween(
        offsetPoints[startIdx].x,
        offsetPoints[startIdx].y,
        offsetPoints[endIdx].x,
        offsetPoints[endIdx].y
      );
    } else {
      // Draw normal yellow border highlight
      this.highlightGraphics.lineStyle(1.5, 0xffff00, 0.6);
      this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
    }
  }

  private clearHighlight(): void {
    this.highlightGraphics.clear();
    this.hoveredCell = null;
    this.hoveredEdge = null;
  }

  private drawLines(): void {
    this.linesGraphics.clear();
    
    // Track which segments we've drawn by their actual screen coordinates to avoid duplicates
    const drawnSegments = new Set<string>();
    
    // Iterate through all border segments and draw them
    this.borderSegments.forEach((color, segmentKey) => {
      const [cellXStr, cellYStr, edgeStr] = segmentKey.split(',');
      const cellX = parseInt(cellXStr, 10);
      const cellY = parseInt(cellYStr, 10);
      const edge = parseInt(edgeStr, 10);
      
      // Get the screen coordinates for this border segment
      const coords = this.getBorderSegmentCoords(cellX, cellY, edge);
      
      // Create a unique key based on the actual line coordinates (rounded to avoid floating point issues)
      // This handles deduplication when the same edge is stored from adjacent cells
      const coordKey = `${Math.round(coords.startX)},${Math.round(coords.startY)}-${Math.round(coords.endX)},${Math.round(coords.endY)}`;
      const reverseCoordKey = `${Math.round(coords.endX)},${Math.round(coords.endY)}-${Math.round(coords.startX)},${Math.round(coords.startY)}`;
      
      // Skip if we've already drawn this segment (check both directions)
      if (drawnSegments.has(coordKey) || drawnSegments.has(reverseCoordKey)) {
        return;
      }
      
      // Mark as drawn
      drawnSegments.add(coordKey);
      
      // Draw the line segment
      this.linesGraphics.lineStyle(3, color, 1);
      this.linesGraphics.lineBetween(
        coords.startX,
        coords.startY,
        coords.endX,
        coords.endY
      );
    });
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

  private getNearestEdge(
    gridX: number,
    gridY: number,
    pointer: Phaser.Input.Pointer
  ): number {
    // Get world coordinates relative to cell center
    const worldX = this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
    const worldY = this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
    
    // Get all edge points
    const points = getIsometricTilePoints(gridX, gridY);
    const offsetPoints = points.map(p => ({
      x: p.x + this.gridOffsetX,
      y: p.y + this.gridOffsetY
    }));
    
    // Calculate distances to each edge
    const edges = [
      { idx: 0, name: 'top', p1: offsetPoints[0], p2: offsetPoints[1] },      // 0->1
      { idx: 1, name: 'right', p1: offsetPoints[1], p2: offsetPoints[2] },   // 1->2
      { idx: 2, name: 'bottom', p1: offsetPoints[2], p2: offsetPoints[3] },  // 2->3
      { idx: 3, name: 'left', p1: offsetPoints[3], p2: offsetPoints[0] }     // 3->0
    ];
    
    let minDist = Infinity;
    let nearestEdge = 0;
    
    edges.forEach(edge => {
      // Calculate distance from point to line segment
      const dx = edge.p2.x - edge.p1.x;
      const dy = edge.p2.y - edge.p1.y;
      const lengthSq = dx * dx + dy * dy;
      
      if (lengthSq === 0) return;
      
      const t = Math.max(0, Math.min(1, ((worldX - edge.p1.x) * dx + (worldY - edge.p1.y) * dy) / lengthSq));
      const projX = edge.p1.x + t * dx;
      const projY = edge.p1.y + t * dy;
      
      const dist = Math.sqrt((worldX - projX) ** 2 + (worldY - projY) ** 2);
      
      if (dist < minDist) {
        minDist = dist;
        nearestEdge = edge.idx;
      }
    });
    
    return nearestEdge;
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
      // Check if left mouse button (button 0) - paint, mark permanent, place ploppable, place vehicle spawner/despawner, or demolish
      else if (pointer.leftButtonDown() && (this.selectedColor !== null || this.isPermanentMode || this.selectedPloppableType !== null || this.isVehicleSpawnerMode || this.isDemolishMode)) {
        // Update hover first to ensure hoveredEdge is set in line mode
        this.updateHoverHighlight(pointer);
        
        this.isPainting = true;
        this.lastPaintedCell = null; // Reset for new paint stroke
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

  private serializeGrid(): string {
    // Convert Map to object for JSON serialization
    const gridData: Record<string, CellData> = {};
    this.cellData.forEach((value, key) => {
      // Don't serialize edges in cellData since we now use borderSegments
      const { edges, ...cellDataWithoutEdges } = value;
      if (Object.keys(cellDataWithoutEdges).length > 0) {
        gridData[key] = cellDataWithoutEdges;
      }
    });
    
    const borderSegmentsData: Record<string, number> = {};
    this.borderSegments.forEach((value, key) => {
      borderSegmentsData[key] = value;
    });
    
    return JSON.stringify({
      gridSize: this.gridSize,
      cellData: gridData,
      borderSegments: borderSegmentsData,
      version: '3.0' // Updated to use simple border segment keys
    });
  }

  private deserializeGrid(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      
      // Clear existing data
      this.cellData.clear();
      this.borderSegments.clear();
      
      // Load cell data
      if (data.cellData && typeof data.cellData === 'object') {
        Object.entries(data.cellData).forEach(([key, value]) => {
          this.cellData.set(key, value as CellData);
        });
      }
      
      // Load border segments (new format)
      if (data.borderSegments && typeof data.borderSegments === 'object') {
        Object.entries(data.borderSegments).forEach(([key, value]) => {
          this.borderSegments.set(key, value as number);
        });
      } else if (data.edgeLines && typeof data.edgeLines === 'object') {
        // Migrate from old edgeLines format (version 2.0)
        Object.entries(data.edgeLines).forEach(([key, value]) => {
          this.borderSegments.set(key, value as number);
        });
      } else if (data.version === '1.0' || (!data.borderSegments && !data.edgeLines)) {
        // Migrate from old format (cell-based edges) to new format
        this.migrateOldEdgeFormat(data.cellData);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to load grid:', error);
      return false;
    }
  }

  private migrateOldEdgeFormat(cellData: Record<string, CellData> | undefined): void {
    // Migrate edges from old cell-based format to new border segment format
    if (!cellData) return;
    
    Object.entries(cellData).forEach(([cellKey, cell]) => {
      if (cell.edges) {
        const [x, y] = cellKey.split(',').map(Number);
        const edgeNames = ['top', 'right', 'bottom', 'left'];
        
        edgeNames.forEach((edgeName, edgeIdx) => {
          const edgeColor = cell.edges?.[edgeName as keyof typeof cell.edges];
          if (edgeColor !== undefined) {
            const segmentKey = this.getBorderSegmentKey(x, y, edgeIdx);
            this.borderSegments.set(segmentKey, edgeColor);
          }
        });
      }
    });
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
        // Rebuild spawner-despawner pairs from loaded cell data
        this.rebuildSpawnerDespawnerPairs();
        // Rebuild pedestrian spawners from loaded cell data
        this.rebuildPedestrianSpawners();
        this.drawGrid(); // Redraw with imported data
        this.drawLines(); // Redraw lines
        this.drawRails(); // Redraw rails
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
    const cellData = this.getCellData(gridX, gridY);
    if (!cellData) return;
    
    let needsRedraw = false;
    
    // Check for vehicle spawner/despawner
    if (cellData.vehicleSpawner || cellData.vehicleDespawner) {
      // Find the associated pair
      const pair = this.vehicleSystem.findPairByCell(gridX, gridY);
      if (pair) {
        // Remove both spawner and despawner cell data
        const spawnerCellData = this.getCellData(pair.spawnerX, pair.spawnerY);
        if (spawnerCellData) {
          delete spawnerCellData.vehicleSpawner;
          this.setCellData(pair.spawnerX, pair.spawnerY, spawnerCellData);
        }
        
        const despawnerCellData = this.getCellData(pair.despawnerX, pair.despawnerY);
        if (despawnerCellData) {
          delete despawnerCellData.vehicleDespawner;
          this.setCellData(pair.despawnerX, pair.despawnerY, despawnerCellData);
        }
        
        // Remove from vehicle system
        this.vehicleSystem.removeSpawnerDespawnerPair(pair.spawnerX, pair.spawnerY);
        needsRedraw = true;
      }
    }
    
    // Check for ploppable
    if (cellData.ploppable) {
      const ploppableType = cellData.ploppable.type;
      
      // If it's a pedestrian spawner, remove from pedestrian system
      if (ploppableType === 'Pedestrian Spawner') {
        this.pedestrianSystem.removeDestination(gridX, gridY);
      }
      
      // Remove ploppable from cell data
      delete cellData.ploppable;
      this.setCellData(gridX, gridY, cellData);
      needsRedraw = true;
    }
    
    // Redraw if something was demolished
    if (needsRedraw) {
      this.drawGrid();
      this.drawLines();
      this.drawRails();
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

  update(_time: number, delta: number): void {
    // Update central game systems (time, rating triggers, etc.)
    GameSystems.update(delta);
    
    // Update vehicle system
    this.vehicleSystem.update(delta, this.gridSize, this.gridOffsetX, this.gridOffsetY);
    
    // Update pedestrian system
    this.pedestrianSystem.update(delta, this.gridSize, this.gridOffsetX, this.gridOffsetY);
    
    // Update game UI displays
    this.updateGameUI();
    
    // Draw vehicles
    this.drawVehicles();
    
    // Draw pedestrians
    this.drawPedestrians();
  }

  /**
   * Update game UI elements (clock, day, budget, rating)
   */
  private updateGameUI(): void {
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
      const current = GameSystems.rating.getCurrentRating();
      ratingEl.textContent = current.toFixed(0);
    }
  }

  /**
   * Rebuild pedestrian spawners from cell data
   */
  private rebuildPedestrianSpawners(): void {
    // Clear existing pedestrian spawners
    this.pedestrianSystem.clearPedestrians();
    
    // Find all pedestrian spawners
    for (let x = 0; x < this.gridSize; x++) {
      for (let y = 0; y < this.gridSize; y++) {
        const cellData = this.getCellData(x, y);
        if (cellData?.ploppable?.type === 'Pedestrian Spawner') {
          this.pedestrianSystem.addDestination(x, y);
        }
      }
    }
  }

  /**
   * Rebuild spawner-despawner pairs from cell data
   * Uses a simple nearest-neighbor approach to pair spawners with despawners
   */
  private rebuildSpawnerDespawnerPairs(): void {
    // Clear existing pairs
    this.vehicleSystem.clearVehicles();
    
    // Find all spawners and despawners
    const spawners: { x: number; y: number }[] = [];
    const despawners: { x: number; y: number }[] = [];
    
    for (let x = 0; x < this.gridSize; x++) {
      for (let y = 0; y < this.gridSize; y++) {
        const cellData = this.getCellData(x, y);
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
        const dx = nearestDespawner.x;
        const dy = nearestDespawner.y;
        const pair: SpawnerDespawnerPair = {
          spawnerX: spawner.x,
          spawnerY: spawner.y,
          despawnerX: dx,
          despawnerY: dy
        };
        this.vehicleSystem.addSpawnerDespawnerPair(pair);
        usedDespawners.add(`${dx},${dy}`);
      }
    });
  }

  /**
   * Get all parking spots from the grid
   */
  private getPedestrianDestinations(): { x: number; y: number }[] {
    const destinations: { x: number; y: number }[] = [];
    for (let x = 0; x < this.gridSize; x++) {
      for (let y = 0; y < this.gridSize; y++) {
        const cellData = this.getCellData(x, y);
        if (cellData?.ploppable?.type === 'Pedestrian Spawner') {
          destinations.push({ x, y });
        }
      }
    }
    return destinations;
  }

  private getAllParkingSpots(): Ploppable[] {
    const parkingSpots: Ploppable[] = [];
    
    for (let x = 0; x < this.gridSize; x++) {
      for (let y = 0; y < this.gridSize; y++) {
        const cellData = this.getCellData(x, y);
        const ploppable = cellData?.ploppable;
        if (ploppable && ploppable.type === 'Parking Spot') {
          parkingSpots.push(ploppable);
        }
      }
    }
    
    return parkingSpots;
  }

  /**
   * Check if an edge is impassable (curb, fence, or parking spot border)
   */
  isEdgeImpassable(cellX: number, cellY: number, edge: number): boolean {
    // Check if this edge is a curb or fence (from border segments)
    const existingKey = this.findExistingBorderSegmentKey(cellX, cellY, edge);
    if (existingKey) {
      const color = this.borderSegments.get(existingKey);
      // Curb: #808080 (gray), Fence: #ff0000 (red)
      if (color === 0x808080 || color === 0xff0000) {
        return true;
      }
    }
    
    // Check if this edge is part of a parking spot border
    const cellData = this.getCellData(cellX, cellY);
    if (cellData?.ploppable?.type === 'Parking Spot') {
      const orientation = cellData.ploppable.orientation || 0;
      // Orientation represents which edge is missing (undrawn):
      // 0 = missing left (edge 3) - draws edges 0,1,2
      // 1 = missing bottom (edge 2) - draws edges 0,1,3
      // 2 = missing top (edge 0) - draws edges 1,2,3
      // 3 = missing right (edge 1) - draws edges 0,2,3
      const edgesToDraw = [
        [0, 1, 2], // orientation 0: missing left (3)
        [0, 1, 3], // orientation 1: missing bottom (2)
        [1, 2, 3], // orientation 2: missing top (0)
        [0, 2, 3]  // orientation 3: missing right (1)
      ];
      const drawnEdges = edgesToDraw[orientation];
      if (drawnEdges.includes(edge)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if an edge blocks a specific entity type
   * - Vehicles: Blocked by curbs, fences, lane lines (directional), and parking spot borders
   * - Pedestrians: Blocked only by fences
   * 
   * @param checkParkingSpots - If false, skip parking spot border checks (used for corridor edges)
   * @param movementDirection - The direction of movement (for lane line "drive on the right" logic)
   */
  isEdgeBlockedForEntity(
    cellX: number, 
    cellY: number, 
    edge: number, 
    entityType: 'vehicle' | 'pedestrian', 
    checkParkingSpots: boolean = true,
    movementDirection: 'north' | 'south' | 'east' | 'west' = 'north'
  ): boolean {
    // Check border segments (curbs, fences, and lane lines)
    // Key insight: 
    // - Fences block everything everywhere (use shared edge lookup)
    // - Curbs/lane lines only block on ENTRY edges (checkParkingSpots=true), not corridor walls
    // - For N/S corridor edges, use current cell key only to avoid false positives from neighbors
    const isNorthSouthMovement = movementDirection === 'north' || movementDirection === 'south';
    const isEastWestMovement = movementDirection === 'east' || movementDirection === 'west';
    const isCorridorEdge = !checkParkingSpots;
    
    // For fences: always use shared edge lookup (fences block everything)
    const existingKey = this.findExistingBorderSegmentKey(cellX, cellY, edge);
    
    // For curbs/lane lines on N/S corridor edges: use current cell key to avoid false positives
    // For entry edges and E/W movement: use shared lookup
    const currentCellKey = this.getBorderSegmentKey(cellX, cellY, edge);
    const curbLaneKey = (isNorthSouthMovement && isCorridorEdge) ? currentCellKey : existingKey;
    const curbLaneColor = curbLaneKey ? this.borderSegments.get(curbLaneKey) : undefined;
    
    if (existingKey) {
      const color = this.borderSegments.get(existingKey);
      
      // Fence blocks everything (including corridor edges) - use shared edge lookup
      if (color === 0xff0000) {
        return true;
      }
    }
    
    // Curb blocks vehicles when exiting through the edge the curb is on
    // Edge 0 (top) blocks North, Edge 1 (right) blocks East, 
    // Edge 2 (bottom) blocks South, Edge 3 (left) blocks West
    if (curbLaneColor === 0x808080 && entityType === 'vehicle') {
      const edgeBlocksDirection = 
        (edge === 0 && movementDirection === 'north') ||
        (edge === 1 && movementDirection === 'east') ||
        (edge === 2 && movementDirection === 'south') ||
        (edge === 3 && movementDirection === 'west');
      
      if (edgeBlocksDirection) {
        return true;
      }
    }
    
    // Lane line (yellow) - block parallel movement on ENTRY edges only
    if (curbLaneColor === 0xffff00 && entityType === 'vehicle' && checkParkingSpots) {
      const isVerticalEdge = edge === 0 || edge === 2;
      const isHorizontalEdge = edge === 1 || edge === 3;
      
      // Block parallel movement (movement that directly crosses the edge)
      // Allow perpendicular movement (turning across the lane line)
      if (isVerticalEdge && isNorthSouthMovement) {
        return true; // Lane line on top/bottom edge blocks N/S movement
      }
      if (isHorizontalEdge && isEastWestMovement) {
        return true; // Lane line on right/left edge blocks E/W movement
      }
    }
    
    // Check parking spot borders (only block vehicles, and only if checkParkingSpots is true)
    // Parking spot borders only block direct entry into the spot, not corridor movement
    // NOTE: We only check the current cell, not neighbors, because parking spot borders
    // should only block entry into the parking spot cell itself, not movement past adjacent cells
    if (entityType === 'vehicle' && checkParkingSpots) {
      if (this.isParkingSpotEdgeBlocked(cellX, cellY, edge)) {
        return true;
      }
      
      // REMOVED: Neighbor cell check for parking spots
      // This was incorrectly blocking vehicles from passing by parking spots in adjacent cells.
      // Parking spot borders should only block entry into the parking spot cell itself.
    }
    
    return false;
  }

  /**
   * Check if a cell has a parking spot with the given edge blocked (drawn)
   */
  private isParkingSpotEdgeBlocked(cellX: number, cellY: number, edge: number): boolean {
    const cellData = this.getCellData(cellX, cellY);
    if (cellData?.ploppable?.type === 'Parking Spot') {
      const orientation = cellData.ploppable.orientation || 0;
      // Edges that are drawn (blocked) for each orientation
      // Orientation represents which edge is MISSING (passable)
      const drawnEdges = [
        [0, 1, 2], // orientation 0: missing left (3) - draws top, right, bottom
        [0, 1, 3], // orientation 1: missing bottom (2) - draws top, right, left
        [1, 2, 3], // orientation 2: missing top (0) - draws right, bottom, left
        [0, 2, 3]  // orientation 3: missing right (1) - draws top, bottom, left
      ];
      const blocked = drawnEdges[orientation];
      return blocked.includes(edge);
    }
    return false;
  }

  /**
   * Get the neighbor cell that shares a given edge
   * Returns the neighbor cell coordinates and the corresponding edge number
   */
  private getNeighborCellForEdge(cellX: number, cellY: number, edge: number): { cellX: number; cellY: number; edge: number } | null {
    // Edge sharing relationships:
    // - Edge 0 (top) of (x,y) = Edge 2 (bottom) of (x-1, y+1)
    // - Edge 1 (right) of (x,y) = Edge 3 (left) of (x+1, y)
    // - Edge 2 (bottom) of (x,y) = Edge 0 (top) of (x+1, y-1)
    // - Edge 3 (left) of (x,y) = Edge 1 (right) of (x-1, y)
    
    switch (edge) {
      case 0: // top -> neighbor's bottom
        return { cellX: cellX - 1, cellY: cellY + 1, edge: 2 };
      case 1: // right -> neighbor's left
        return { cellX: cellX + 1, cellY: cellY, edge: 3 };
      case 2: // bottom -> neighbor's top
        return { cellX: cellX + 1, cellY: cellY - 1, edge: 0 };
      case 3: // left -> neighbor's right
        return { cellX: cellX - 1, cellY: cellY, edge: 1 };
      default:
        return null;
    }
  }

  /**
   * Check if a rail segment (between two cell centers) crosses an impassable line
   */
  doesRailSegmentCrossImpassable(
    startX: number, startY: number,
    endX: number, endY: number
  ): boolean {
    // Convert cell centers to screen coordinates (without offset, for calculation)
    const startScreen = isoToScreen(startX, startY);
    const endScreen = isoToScreen(endX, endY);
    
    // Check all cells that might have edges crossing this rail segment
    // We need to check cells along the path
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    
    // Check all cells in the bounding box
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) continue;
        
        // Check all 4 edges of this cell
        for (let edge = 0; edge < 4; edge++) {
          if (this.isEdgeImpassable(x, y, edge)) {
            // Get edge coordinates
            const edgeCoords = this.getBorderSegmentCoords(x, y, edge);
            // Remove offset for comparison
            const edgeStart = {
              x: edgeCoords.startX - this.gridOffsetX,
              y: edgeCoords.startY - this.gridOffsetY
            };
            const edgeEnd = {
              x: edgeCoords.endX - this.gridOffsetX,
              y: edgeCoords.endY - this.gridOffsetY
            };
            
            // Check if rail segment intersects with this edge
            if (this.linesIntersect(
              startScreen.x, startScreen.y,
              endScreen.x, endScreen.y,
              edgeStart.x, edgeStart.y,
              edgeEnd.x, edgeEnd.y
            )) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Check if two line segments intersect
   */
  private linesIntersect(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
  ): boolean {
    // Using cross product to check intersection
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    // Check if intersection point is on both segments
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  private drawRails(): void {
    this.railGraphics.clear();
    
    // Draw dotted lines through midpoints of each row and column
    // Rows: cells with same grid Y (diagonal lines in screen space, top-left to bottom-right)
    // Columns: cells with same grid X (diagonal lines in screen space, top-right to bottom-left)
    
    const dotLength = 4;
    const gapLength = 4;
    const lineColor = 0x00ff00; // Green color for rails
    const lineAlpha = 0.5;
    
    // Draw row rails (diagonal lines through cell centers with same grid Y)
    for (let y = 0; y < this.gridSize; y++) {
      // Get the first and last cell centers in this row
      const firstCellCenter = isoToScreen(0, y);
      const lastCellCenter = isoToScreen(this.gridSize - 1, y);
      
      const startX = firstCellCenter.x + this.gridOffsetX;
      const startY = firstCellCenter.y + this.gridOffsetY;
      const endX = lastCellCenter.x + this.gridOffsetX;
      const endY = lastCellCenter.y + this.gridOffsetY;
      
      // Calculate line length and direction
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / length;
      const unitY = dy / length;
      
      // Draw dotted line
      this.railGraphics.lineStyle(2, lineColor, lineAlpha);
      let currentDistance = 0;
      while (currentDistance < length) {
        const segmentStartX = startX + currentDistance * unitX;
        const segmentStartY = startY + currentDistance * unitY;
        const segmentEndDistance = Math.min(currentDistance + dotLength, length);
        const segmentEndX = startX + segmentEndDistance * unitX;
        const segmentEndY = startY + segmentEndDistance * unitY;
        
        this.railGraphics.lineBetween(segmentStartX, segmentStartY, segmentEndX, segmentEndY);
        currentDistance = segmentEndDistance + gapLength;
      }
    }
    
    // Draw column rails (diagonal lines through cell centers with same grid X)
    for (let x = 0; x < this.gridSize; x++) {
      // Get the first and last cell centers in this column
      const firstCellCenter = isoToScreen(x, 0);
      const lastCellCenter = isoToScreen(x, this.gridSize - 1);
      
      const startX = firstCellCenter.x + this.gridOffsetX;
      const startY = firstCellCenter.y + this.gridOffsetY;
      const endX = lastCellCenter.x + this.gridOffsetX;
      const endY = lastCellCenter.y + this.gridOffsetY;
      
      // Calculate line length and direction
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / length;
      const unitY = dy / length;
      
      // Draw dotted line
      this.railGraphics.lineStyle(2, lineColor, lineAlpha);
      let currentDistance = 0;
      while (currentDistance < length) {
        const segmentStartX = startX + currentDistance * unitX;
        const segmentStartY = startY + currentDistance * unitY;
        const segmentEndDistance = Math.min(currentDistance + dotLength, length);
        const segmentEndX = startX + segmentEndDistance * unitX;
        const segmentEndY = startY + segmentEndDistance * unitY;
        
        this.railGraphics.lineBetween(segmentStartX, segmentStartY, segmentEndX, segmentEndY);
        currentDistance = segmentEndDistance + gapLength;
      }
    }
  }


  private drawVehicles(): void {
    this.vehicleGraphics.clear();
    
    const vehicles = this.vehicleSystem.getVehicles();
    
    vehicles.forEach(vehicle => {
      // Draw red diamond smaller than a cell, matching isometric orientation
      const halfWidth = (TILE_WIDTH / 2) * 0.7; // Match isometric width ratio
      const halfHeight = (TILE_HEIGHT / 2) * 0.7; // Match isometric height ratio
      
      // Vehicle position in screen coordinates
      const screenX = vehicle.screenX + this.gridOffsetX;
      const screenY = vehicle.screenY + this.gridOffsetY;
      
      // Draw diamond shape matching isometric tile orientation
      // Points: top, right, bottom, left (same as isometric cells)
      this.vehicleGraphics.fillStyle(0xff0000, 1); // Red
      this.vehicleGraphics.beginPath();
      this.vehicleGraphics.moveTo(screenX, screenY - halfHeight); // Top
      this.vehicleGraphics.lineTo(screenX + halfWidth, screenY); // Right
      this.vehicleGraphics.lineTo(screenX, screenY + halfHeight); // Bottom
      this.vehicleGraphics.lineTo(screenX - halfWidth, screenY); // Left
      this.vehicleGraphics.closePath();
      this.vehicleGraphics.fillPath();
    });
  }


  private drawPedestrians(): void {
    this.pedestrianGraphics.clear();
    
    const pedestrians = this.pedestrianSystem.getActivePedestrians();
    
    pedestrians.forEach(pedestrian => {
      // Draw blue upright rectangle (tall and narrow)
      const width = (TILE_WIDTH / 2) * 0.25; // 25% of tile width (narrower)
      const height = (TILE_HEIGHT / 2) * 1.0; // 100% of tile height (taller)
      
      // Pedestrian position in screen coordinates
      // This position represents the base midpoint (feet position) on the pedestrian rail
      const screenX = pedestrian.screenX + this.gridOffsetX;
      const screenY = pedestrian.screenY + this.gridOffsetY;
      
      // Draw upright rectangle with base at the pedestrian's position
      // The base (bottom) center is at (screenX, screenY) where the feet are
      this.pedestrianGraphics.fillStyle(0x0000ff, 1); // Blue
      this.pedestrianGraphics.fillRect(
        screenX - width / 2,  // Left edge (centered horizontally)
        screenY - height,      // Top edge (base is at screenY)
        width,                 // Width
        height                 // Height
      );
      
      // Draw a small circle at the rail connection point (base of feet)
      this.pedestrianGraphics.fillStyle(0xffff00, 1); // Yellow dot
      this.pedestrianGraphics.fillCircle(screenX, screenY, 3); // 3 pixel radius
      
      // Draw a larger circle at the destination cell (cell center)
      // Show destination when going to destination, show vehicle when returning
      if (pedestrian.state === 'going_to_destination' && pedestrian.destinationX !== undefined && pedestrian.destinationY !== undefined) {
        const destScreenPos = isoToScreen(pedestrian.destinationX, pedestrian.destinationY);
        const destScreenX = destScreenPos.x + this.gridOffsetX;
        const destScreenY = destScreenPos.y + this.gridOffsetY;
        
        this.pedestrianGraphics.lineStyle(2, 0xffaa00, 1); // Orange outline
        this.pedestrianGraphics.fillStyle(0xffaa00, 0.3); // Orange fill with transparency
        this.pedestrianGraphics.fillCircle(destScreenX, destScreenY, 8); // 8 pixel radius
        this.pedestrianGraphics.strokeCircle(destScreenX, destScreenY, 8);
      } else if (pedestrian.state === 'returning_to_vehicle') {
        // Show vehicle location when returning
        const vehicleScreenPos = isoToScreen(pedestrian.vehicleX, pedestrian.vehicleY);
        const vehicleScreenX = vehicleScreenPos.x + this.gridOffsetX;
        const vehicleScreenY = vehicleScreenPos.y + this.gridOffsetY;
        
        this.pedestrianGraphics.lineStyle(2, 0x00ff00, 1); // Green outline
        this.pedestrianGraphics.fillStyle(0x00ff00, 0.3); // Green fill with transparency
        this.pedestrianGraphics.fillCircle(vehicleScreenX, vehicleScreenY, 8); // 8 pixel radius
        this.pedestrianGraphics.strokeCircle(vehicleScreenX, vehicleScreenY, 8);
      }
    });
  }
}

