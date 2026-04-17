/**
 * GridEditorController - Owns all tool state and behavior for ChallengeScene (paint, ploppables, camera, etc.).
 * Receives a GridEditorContext (the scene) and delegates grid/redraw/system access through it.
 */

import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { getIsometricTilePoints } from '@/utils/isometric';
import { Ploppable, COLOR_TO_SURFACE } from '@/types';
import { GridManager } from '@/core/GridManager';
import { GridInteractionHandler } from '@/systems/GridInteractionHandler';
import { GridRenderer } from '@/systems/GridRenderer';
import { PloppableManager } from '@/systems/PloppableManager';
import { PLOPPABLE_SPRITES, PLOPPABLE_SPRITE_CONFIG } from '@/renderers/EntityRenderer';
import { SpawnerManager } from '@/managers/SpawnerManager';
import { SafetySystem } from '@/systems/SafetySystem';
import { ParkingTimerSystem } from '@/systems/ParkingTimerSystem';
import { GameSystems } from '@/core/GameSystems';
import { getPloppableCost, DEMOLISH_REFUND_FRACTION } from '@/config/ploppableCosts.config';
import { getSurfaceCost } from '@/config/surfaceCosts.config';
import { getLineCost } from '@/config/lineCosts.config';
import type { VehicleSystem } from '@/systems/VehicleSystem';
import type { PedestrianSystem } from '@/systems/PedestrianSystem';

export interface GridEditorContext {
  getGridManager(): GridManager;
  getGridWidth(): number;
  getGridHeight(): number;
  getGridOffsetX(): number;
  getGridOffsetY(): number;
  getHighlightGraphics(): Phaser.GameObjects.Graphics;
  redrawGrid(): void;
  getVehicleSystem(): VehicleSystem;
  getPedestrianSystem(): PedestrianSystem;
  getIsDevMode(): boolean;
  getCamera(): Phaser.Cameras.Scene2D.Camera;
  getInput(): Phaser.Input.InputPlugin;
  getTime(): Phaser.Time.Clock;
  getAdd(): { graphics(): Phaser.GameObjects.Graphics; sprite(x: number, y: number, texture: string): Phaser.GameObjects.Sprite; container(x: number, y: number): Phaser.GameObjects.Container };
  resizeGrid(newWidth: number, newHeight: number): void;
  /** Returns a forced Parking Spot orientation (0-3) or null if the player is free to rotate. */
  getLockedParkingSpotOrientation?(): number | null;
}

export class GridEditorController {
  private ctx: GridEditorContext;

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
  private isLineMode = false;
  private isPermanentMode = false;
  private selectedPloppableType: string | null = null;
  private ploppableOrientation = 0;
  private lastPaintedCell: { x: number; y: number } | null = null;
  private lastPaintedEdgeKey: string | null = null;
  private isVehicleSpawnerMode = false;
  private isDemolishMode = false;
  private pendingSpawnerCell: { x: number; y: number } | null = null;
  private showAppealVisualization = false;
  private showSafetyVisualization = false;
  private visualizationGraphics: Phaser.GameObjects.Graphics | null = null;
  private ghostSprite: Phaser.GameObjects.GameObject | null = null;
  /** DOM listeners for tools UI; aborted in dispose() so scene restarts do not stack handlers. */
  private domAbort: AbortController | null = null;

  constructor(context: GridEditorContext) {
    this.ctx = context;
  }

  init(): void {
    this.domAbort = new AbortController();
    const domSignal = this.domAbort.signal;
    this.setupCamera();
    this.setupRateInputHandler(domSignal);
    this.setupColorButtons(domSignal);
    this.setupDemolishButton(domSignal);
    this.setupVehicleSpawnerButton(domSignal);
    this.setupPedestrianSpawnerButton(domSignal);
    this.setupPermanentButton(domSignal);
    this.setupAppealVisualizationButton(domSignal);
    this.setupSafetyVisualizationButton(domSignal);
    this.setupExportImportButtons(domSignal);
    this.setupGridResizeControls(domSignal);
    this.setupKeyboardControls();
  }

  /**
   * Tear down input + DOM subscriptions when leaving ChallengeScene. Prevents duplicate listeners
   * on shared HTML buttons after menu ↔ challenge cycles.
   */
  dispose(): void {
    this.domAbort?.abort();
    this.domAbort = null;
    const input = this.ctx.getInput();
    input.off('pointerdown', this.onEditorPointerDown);
    input.off('pointerup', this.onEditorPointerUp);
    input.off('pointermove', this.onEditorPointerMove);
    input.off('wheel', this.onEditorWheel);
    const kb = input.keyboard;
    if (kb) {
      kb.off('keydown-Q', this.onKeyQ);
      kb.off('keydown-E', this.onKeyE);
    }
    this.clearHighlight();
    if (this.visualizationGraphics) {
      this.visualizationGraphics.destroy();
      this.visualizationGraphics = null;
    }
    this.destroyGhostSprite();
  }

  private scheduleDomSetup(signal: AbortSignal, fn: () => void): void {
    this.ctx.getTime().delayedCall(100, () => {
      if (signal.aborted) return;
      fn();
    });
  }

  updatePointer(pointer: Phaser.Input.Pointer): void {
    this.updateHoverHighlight(pointer);
  }

  setDevOnlyToolsVisibility(visible: boolean): void {
    const toolsEl = document.getElementById('dev-only-tools');
    if (toolsEl) (toolsEl as HTMLElement).style.display = visible ? '' : 'none';
    const dayEl = document.getElementById('day-dev-controls');
    const hourEl = document.getElementById('hour-dev-controls');
    const display = visible ? 'flex' : 'none';
    if (dayEl) (dayEl as HTMLElement).style.display = display;
    if (hourEl) (hourEl as HTMLElement).style.display = display;
  }

  renderVisualization(): void {
    if (!this.showAppealVisualization && !this.showSafetyVisualization) {
      if (this.visualizationGraphics) {
        this.visualizationGraphics.clear();
        this.visualizationGraphics.setVisible(false);
        this.visualizationGraphics.setActive(false);
      }
      return;
    }
    const graphics = this.getVisualizationGraphics();
    graphics.clear();
    graphics.setActive(true);
    graphics.setVisible(true);
    const gridManager = this.ctx.getGridManager();
    const gridWidth = this.ctx.getGridWidth();
    const gridHeight = this.ctx.getGridHeight();
    const gridOffsetX = this.ctx.getGridOffsetX();
    const gridOffsetY = this.ctx.getGridOffsetY();
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cellData = gridManager.getCellData(x, y);
        if (cellData?.isPermanent) continue;
        const value = this.showAppealVisualization ? (cellData?.appeal ?? 0) : (cellData?.safety ?? 0);
        const isPositive = value > 0;
        const color = isPositive ? 0x00ff00 : 0xff0000;
        const alpha = 0.3;
        const points = getIsometricTilePoints(x, y);
        const offsetPoints = points.map(p => ({ x: p.x + gridOffsetX, y: p.y + gridOffsetY }));
        graphics.fillStyle(color, alpha);
        graphics.fillTriangle(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y, offsetPoints[3].x, offsetPoints[3].y);
        graphics.fillTriangle(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[1].x, offsetPoints[1].y, offsetPoints[3].x, offsetPoints[3].y);
      }
    }
  }

  getShowAppealVisualization(): boolean {
    return this.showAppealVisualization;
  }

  getShowSafetyVisualization(): boolean {
    return this.showSafetyVisualization;
  }

  private getVisualizationGraphics(): Phaser.GameObjects.Graphics {
    if (!this.visualizationGraphics) {
      this.visualizationGraphics = this.ctx.getAdd().graphics();
      this.visualizationGraphics.setDepth(1.6);
      this.visualizationGraphics.setVisible(false);
      this.visualizationGraphics.setActive(false);
    }
    return this.visualizationGraphics;
  }

  private setupCamera(): void {
    const input = this.ctx.getInput();
    input.on('pointerdown', this.onEditorPointerDown);
    input.on('pointerup', this.onEditorPointerUp);
    input.on('pointermove', this.onEditorPointerMove);
    input.on('wheel', this.onEditorWheel);
  }

  private readonly onEditorPointerDown = (pointer: Phaser.Input.Pointer): void => {
    const camera = this.ctx.getCamera();
    if (pointer.rightButtonDown()) {
      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.cameraStartX = camera.scrollX;
      this.cameraStartY = camera.scrollY;
    } else if (pointer.leftButtonDown() && (this.selectedColor !== null || this.isPermanentMode || this.selectedPloppableType !== null || this.isVehicleSpawnerMode || this.isDemolishMode)) {
      this.updateHoverHighlight(pointer);
      this.isPainting = true;
      this.lastPaintedCell = null;
      this.lastPaintedEdgeKey = null;
      if (this.isLineMode && !this.isDemolishMode && this.hoveredEdge) {
        this.paintCell(this.hoveredEdge.cellX, this.hoveredEdge.cellY);
      } else {
        const cell = this.getCellAtPointer(pointer);
        if (cell) this.paintCell(cell.x, cell.y);
      }
    }
  };

  private readonly onEditorPointerUp = (): void => {
    this.isDragging = false;
    this.isPainting = false;
    this.lastPaintedCell = null;
    this.lastPaintedEdgeKey = null;
  };

  private readonly onEditorPointerMove = (pointer: Phaser.Input.Pointer): void => {
    const camera = this.ctx.getCamera();
    if (this.isDragging && pointer.rightButtonDown()) {
      const deltaX = pointer.x - this.dragStartX;
      const deltaY = pointer.y - this.dragStartY;
      camera.setScroll(this.cameraStartX - deltaX, this.cameraStartY - deltaY);
    } else if (this.isPainting && pointer.leftButtonDown() && (this.selectedColor !== null || this.isPermanentMode || this.selectedPloppableType !== null || this.isVehicleSpawnerMode || this.isDemolishMode)) {
      if (this.isLineMode && !this.isDemolishMode && this.hoveredEdge) {
        this.paintCell(this.hoveredEdge.cellX, this.hoveredEdge.cellY);
      } else {
        const cell = this.getCellAtPointer(pointer);
        if (cell) this.paintCell(cell.x, cell.y);
      }
      this.updateHoverHighlight(pointer);
    } else {
      this.updateHoverHighlight(pointer);
    }
  };

  private readonly onEditorWheel = (
    _p: Phaser.Input.Pointer,
    _g: Phaser.GameObjects.GameObject[],
    _dx: number,
    deltaY: number,
    _dz: number
  ): void => {
    const camera = this.ctx.getCamera();
    const currentZoom = camera.zoom;
    const zoomDelta = deltaY > 0 ? -this.zoomStep : this.zoomStep;
    camera.setZoom(Phaser.Math.Clamp(currentZoom + zoomDelta, this.minZoom, this.maxZoom));
  };

  private getCellAtPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } | null {
    return GridInteractionHandler.getCellAtPointer(
      pointer,
      this.ctx.getCamera(),
      this.ctx.getGridWidth(),
      this.ctx.getGridHeight(),
      this.ctx.getGridOffsetX(),
      this.ctx.getGridOffsetY()
    );
  }

  private getNearestEdge(gridX: number, gridY: number, pointer: Phaser.Input.Pointer): number {
    return GridInteractionHandler.getNearestEdge(
      gridX,
      gridY,
      pointer,
      this.ctx.getCamera(),
      this.ctx.getGridOffsetX(),
      this.ctx.getGridOffsetY()
    );
  }

  private clearHighlight(): void {
    this.ctx.getHighlightGraphics().clear();
    this.destroyGhostSprite();
    this.hoveredCell = null;
    this.hoveredEdge = null;
  }

  private destroyGhostSprite(): void {
    if (this.ghostSprite) {
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }
  }

  private createGhostSprite(x: number, y: number, textureKey: string, originX: number, originY: number, flipX: boolean, baseScale: number, scaleMult: number, rotation?: number): void {
    this.destroyGhostSprite();
    const sprite = this.ctx.getAdd().sprite(x, y, textureKey);
    sprite.setOrigin(originX, originY);
    sprite.setDepth(10);
    sprite.setFlipX(flipX);
    sprite.setAlpha(0.5);
    if (sprite.width > 0) sprite.setScale((baseScale / sprite.width) * scaleMult);
    if (rotation !== undefined) sprite.setRotation(rotation);
    this.ghostSprite = sprite;
  }

  private setGhostObject(obj: Phaser.GameObjects.GameObject): void {
    this.destroyGhostSprite();
    this.ghostSprite = obj;
  }

  private updateHoverHighlight(pointer: Phaser.Input.Pointer): void {
    if (this.isDragging) return;
    const cell = this.getCellAtPointer(pointer);
    if (cell) {
      if (this.isLineMode) {
        const edge = this.getNearestEdge(cell.x, cell.y, pointer);
        if (!this.hoveredEdge || this.hoveredEdge.cellX !== cell.x || this.hoveredEdge.cellY !== cell.y || this.hoveredEdge.edge !== edge) {
          this.hoveredEdge = { cellX: cell.x, cellY: cell.y, edge };
          this.drawHighlight(cell.x, cell.y, edge);
        }
      } else {
        if (!this.hoveredCell || this.hoveredCell.x !== cell.x || this.hoveredCell.y !== cell.y) {
          this.hoveredCell = cell;
          this.drawHighlight(cell.x, cell.y);
        }
      }
    } else {
      if (this.hoveredCell || this.hoveredEdge) this.clearHighlight();
    }
  }

  private drawHighlight(gridX: number, gridY: number, edge?: number): void {
    const g = this.ctx.getHighlightGraphics();
    const gridManager = this.ctx.getGridManager();
    const gridWidth = this.ctx.getGridWidth();
    const gridHeight = this.ctx.getGridHeight();
    const ox = this.ctx.getGridOffsetX();
    const oy = this.ctx.getGridOffsetY();
    g.clear();
    this.destroyGhostSprite();
    const points = getIsometricTilePoints(gridX, gridY);
    const offsetPoints = points.map(p => ({ x: p.x + ox, y: p.y + oy }));

    // Try to draw a ghost sprite preview for ploppables that have sprite art
    if (!this.isDemolishMode && this.selectedPloppableType && this.tryDrawGhostPreview(gridX, gridY, ox, oy, gridWidth, gridHeight, gridManager)) {
      return;
    }

    // Crosswalk: draw ghost stripes (semi-transparent), no arrow
    if (!this.isDemolishMode && this.selectedPloppableType === 'Crosswalk') {
      const [top, right, bottom, left] = offsetPoints;
      GridRenderer.drawCrosswalkStripes(
        top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y,
        this.ploppableOrientation,
        g,
        true // isGhost
      );
      return;
    }

    if (this.isDemolishMode) {
      g.lineStyle(2, 0xff0000, 0.8);
      g.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      g.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      g.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      g.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
    } else if (this.selectedPloppableType === 'Parking Spot') {
      g.lineStyle(2, 0xffffff, 1);
      const edgesToDraw = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]];
      const edges = edgesToDraw[this.ploppableOrientation];
      edges.forEach(edgeIdx => {
        const endIdx = (edgeIdx + 1) % 4;
        g.lineBetween(offsetPoints[edgeIdx].x, offsetPoints[edgeIdx].y, offsetPoints[endIdx].x, offsetPoints[endIdx].y);
      });
    } else if (['Trash Can', 'Vending Machine', 'Dumpster', 'Portable Toilet', 'Bench', 'Crosswalk'].includes(this.selectedPloppableType || '')) {
      const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
      const orientationType = button?.getAttribute('data-orientation-type') || 'B';
      const sizeAttr = button?.getAttribute('data-size');
      const size = sizeAttr ? parseInt(sizeAttr, 10) : 1;
      const noArrow = button?.getAttribute('data-no-arrow') === 'true';
      const centerX = (offsetPoints[0].x + offsetPoints[2].x) / 2;
      const centerY = (offsetPoints[0].y + offsetPoints[2].y) / 2;
      if (size === 2) {
        const secondCell = PloppableManager.getSecondCellForTwoTile(gridX, gridY, this.ploppableOrientation, gridWidth, gridHeight);
        if (secondCell) {
          g.lineStyle(1.5, 0x00ff00, 0.6);
          g.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
          g.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
          g.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
          g.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
          const secondPoints = getIsometricTilePoints(secondCell.x, secondCell.y);
          const secondOffsetPoints = secondPoints.map(p => ({ x: p.x + ox, y: p.y + oy }));
          g.lineBetween(secondOffsetPoints[0].x, secondOffsetPoints[0].y, secondOffsetPoints[1].x, secondOffsetPoints[1].y);
          g.lineBetween(secondOffsetPoints[1].x, secondOffsetPoints[1].y, secondOffsetPoints[2].x, secondOffsetPoints[2].y);
          g.lineBetween(secondOffsetPoints[2].x, secondOffsetPoints[2].y, secondOffsetPoints[3].x, secondOffsetPoints[3].y);
          g.lineBetween(secondOffsetPoints[3].x, secondOffsetPoints[3].y, secondOffsetPoints[0].x, secondOffsetPoints[0].y);
          const center1X = (offsetPoints[0].x + offsetPoints[2].x) / 2, center1Y = (offsetPoints[0].y + offsetPoints[2].y) / 2;
          const center2X = (secondOffsetPoints[0].x + secondOffsetPoints[2].x) / 2, center2Y = (secondOffsetPoints[0].y + secondOffsetPoints[2].y) / 2;
          const cx = (center1X + center2X) / 2, cy = (center1Y + center2Y) / 2;
          if (!noArrow) PloppableManager.drawOrientationArrow(g, cx, cy, this.ploppableOrientation, 20, 0x00ff00, 0.8);
        } else {
          g.lineStyle(1.5, 0xff0000, 0.6);
          g.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
          g.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
          g.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
          g.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
        }
      } else {
        g.lineStyle(1.5, 0x00ff00, 0.6);
        g.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
        g.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
        g.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
        g.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
        if (orientationType === 'A') {
          const pos = PloppableManager.getTypeAPosition(centerX, centerY, this.ploppableOrientation);
          g.fillStyle(0x00ff00, 0.8);
          g.fillCircle(pos.x, pos.y, 4);
        } else if (!noArrow) {
          PloppableManager.drawOrientationArrow(g, centerX, centerY, this.ploppableOrientation, 20, 0x00ff00, 0.8);
        }
      }
    } else if (this.isLineMode && edge !== undefined) {
      if (this.selectedColorName === 'Fence') {
        GridRenderer.drawChainLinkFenceOnEdge(g, gridX, gridY, edge, ox, oy, { ghost: true });
      } else {
        GridInteractionHandler.drawEdgeHighlight(gridX, gridY, edge, g, ox, oy);
      }
    } else {
      GridInteractionHandler.drawBasicHighlight(gridX, gridY, g, ox, oy);
    }
  }

  /**
   * Try to draw a ghost (transparent) sprite preview for the selected ploppable.
   * Returns true if a ghost preview was drawn (caller should skip old highlight logic).
   * Mirrors the position/flip/scale logic from PloppableManager.drawPloppable.
   */
  private tryDrawGhostPreview(gridX: number, gridY: number, ox: number, oy: number, gridWidth: number, gridHeight: number, gridManager: GridManager): boolean {
    const type = this.selectedPloppableType;
    if (!type) return false;
    const spriteKey = PLOPPABLE_SPRITES[type];
    const config = PLOPPABLE_SPRITE_CONFIG[type];
    const orientation = this.ploppableOrientation;

    // Non-oriented ploppables: Tree, Shrub, Flower Patch, Speed Bump, Crosswalk
    if (type === 'Tree' || type === 'Shrub' || type === 'Flower Patch') {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const SHRUB_ORIGIN_OFFSET_Y = -5;
      const posY = type === 'Shrub' ? centerY + SHRUB_ORIGIN_OFFSET_Y : centerY;
      this.createGhostSprite(centerX, posY, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 0.5, false,
        TILE_WIDTH * 0.7, config?.scaleMultiplier ?? 1);
      return true;
    }

    // Type A oriented: Trash Can, Bench, Street Light
    if (type === 'Trash Can' || type === 'Bench' || type === 'Street Light') {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const position = PloppableManager.getTypeAPosition(centerX, centerY, orientation);

      const TRASHCAN_ORIGIN_OFFSET_Y_TOP = 5;
      const TRASHCAN_ORIGIN_OFFSET_Y_BOTTOM = 2;
      const TRASHCAN_ORIGIN_OFFSET_X = -5;
      const BENCH_ORIGIN_OFFSET_Y_TOP = 0;
      const BENCH_ORIGIN_OFFSET_Y_BOTTOM = -5;
      const BENCH_ORIGIN_OFFSET_X = -5;
      const isBottom = orientation === 2 || orientation === 3;

      let posX = position.x;
      let posY = position.y;
      let flipX = false;

      if (type === 'Trash Can') {
        posY = position.y + (isBottom ? TRASHCAN_ORIGIN_OFFSET_Y_BOTTOM : TRASHCAN_ORIGIN_OFFSET_Y_TOP);
        posX = position.x + (orientation === 1 || orientation === 2 ? TRASHCAN_ORIGIN_OFFSET_X : -TRASHCAN_ORIGIN_OFFSET_X);
      } else if (type === 'Bench') {
        posY = position.y + (isBottom ? BENCH_ORIGIN_OFFSET_Y_BOTTOM : BENCH_ORIGIN_OFFSET_Y_TOP);
        posX = position.x + (orientation === 1 || orientation === 2 ? BENCH_ORIGIN_OFFSET_X : -BENCH_ORIGIN_OFFSET_X);
        flipX = orientation === 1 || orientation === 3;
      } else if (type === 'Street Light') {
        flipX = orientation === 0 || orientation === 2;
      }

      this.createGhostSprite(posX, posY, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 1.0, flipX,
        TILE_WIDTH * 0.5, config?.scaleMultiplier ?? 1);
      return true;
    }

    // Type B single-tile: Vending Machine (only south/west have art)
    if (type === 'Vending Machine') {
      if (orientation !== 2 && orientation !== 3) return false;
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const VENDING_ORIGIN_OFFSET_X = 10;
      const VENDING_ORIGIN_OFFSET_Y = 5;
      const flipX = orientation === 3;
      const offsetX = orientation === 2 ? -VENDING_ORIGIN_OFFSET_X : VENDING_ORIGIN_OFFSET_X;
      this.createGhostSprite(centerX + offsetX, centerY + VENDING_ORIGIN_OFFSET_Y, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 1.0, flipX,
        TILE_WIDTH * 0.5, config?.scaleMultiplier ?? 1);
      return true;
    }

    // Dumpster: single cell, center (south/west have art)
    if (type === 'Dumpster' && spriteKey && (orientation === 2 || orientation === 3)) {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const DUMPSTER_OFFSET_Y = 5;
      const DUMPSTER_OFFSET_X = 10;
      const offsetX = orientation === 2 ? -DUMPSTER_OFFSET_X : DUMPSTER_OFFSET_X;
      const flipX = orientation === 2;
      this.createGhostSprite(centerX + offsetX, centerY + DUMPSTER_OFFSET_Y, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 1.0, flipX,
        TILE_WIDTH * 0.5, config?.scaleMultiplier ?? 1);
      return true;
    }

    // Portable Toilet: south (2) and west (3) only; origin middle-bottom; west flipped
    if (type === 'Portable Toilet' && spriteKey && (orientation === 2 || orientation === 3)) {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const POTTY_OFFSET_Y = 5;
      const POTTY_OFFSET_X = 10;
      const offsetX = orientation === 2 ? -POTTY_OFFSET_X : POTTY_OFFSET_X;
      const flipX = orientation === 3;
      this.createGhostSprite(centerX + offsetX, centerY + POTTY_OFFSET_Y, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 1.0, flipX,
        TILE_WIDTH * 0.5, config?.scaleMultiplier ?? 1);
      return true;
    }

    // Speed Bump: center position, 2 orientations with flip + rotation
    if (type === 'Speed Bump' && spriteKey) {
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const flip = orientation === 3;
      const SPEED_BUMP_ROTATION_DEG = 2.5;
      const rad = (SPEED_BUMP_ROTATION_DEG * Math.PI) / 180;
      const rotation = flip ? -rad : rad;
      this.createGhostSprite(centerX, centerY, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 0.5, flip,
        TILE_WIDTH * 0.7, config?.scaleMultiplier ?? 1, rotation);
      return true;
    }

    // Parking Meter: positioned on the parking spot's opposite edge
    if (type === 'Parking Meter' && spriteKey) {
      const cellData = gridManager.getCellData(gridX, gridY);
      if (!cellData?.ploppable || cellData.ploppable.type !== 'Parking Spot') return false;
      const spotOrientation = cellData.ploppable.orientation ?? 0;
      const oppositeOrientationMap = [2, 1, 3, 0];
      const meterOrientation = oppositeOrientationMap[spotOrientation];
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const position = PloppableManager.getTypeAPosition(centerX, centerY, meterOrientation);
      const METER_OFFSET_X = meterOrientation === 2 ? 3 : meterOrientation === 3 ? -3 : 0;
      this.createGhostSprite(position.x + METER_OFFSET_X, position.y, spriteKey,
        config?.originX ?? 0.5, config?.originY ?? 1.0, false,
        TILE_WIDTH * 0.5, config?.scaleMultiplier ?? 1);
      return true;
    }

    // Parking Booth: booth sprite on primary cell, barrier sprite on secondary cell
    if (type === 'Parking Booth') {
      const boothKey = PLOPPABLE_SPRITES['Parking Booth'];
      const barrierKey = PLOPPABLE_SPRITES['Booth Barrier'];
      if (!boothKey || !barrierKey) return false;
      const secondCell = PloppableManager.getSecondCellForTwoTile(gridX, gridY, orientation, gridWidth, gridHeight);
      if (!secondCell) return false;

      this.destroyGhostSprite();
      const container = this.ctx.getAdd().container(0, 0);
      container.setDepth(10);

      const boothConfig = PLOPPABLE_SPRITE_CONFIG['Parking Booth'];
      const bCenterX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const bCenterY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const BOOTH_OFFSET_Y = -3;
      const boothSprite = this.ctx.getAdd().sprite(bCenterX, bCenterY + TILE_HEIGHT / 2 + BOOTH_OFFSET_Y, boothKey);
      boothSprite.setOrigin(boothConfig?.originX ?? 0.5, boothConfig?.originY ?? 1.0);
      boothSprite.setDepth(10);
      boothSprite.setFlipX(orientation === 0 || orientation === 1);
      boothSprite.setAlpha(0.5);
      const boothBaseScale = TILE_WIDTH * 0.5;
      if (boothSprite.width > 0) boothSprite.setScale((boothBaseScale / boothSprite.width) * (boothConfig?.scaleMultiplier ?? 1));
      container.add(boothSprite);

      const barrierConfig = PLOPPABLE_SPRITE_CONFIG['Booth Barrier'];
      const sCenterX = (secondCell.x - secondCell.y) * (TILE_WIDTH / 2) + ox;
      const sCenterY = (secondCell.x + secondCell.y) * (TILE_HEIGHT / 2) + oy;
      let edgeOffX = 0, edgeOffY = 0, barrierFlip = false;
      switch (orientation) {
        case 0: edgeOffX = TILE_WIDTH / 4; edgeOffY = -TILE_HEIGHT / 4; barrierFlip = false; break;
        case 1: edgeOffX = TILE_WIDTH / 4; edgeOffY = TILE_HEIGHT / 4; barrierFlip = true; break;
        case 2: edgeOffX = -TILE_WIDTH / 4; edgeOffY = TILE_HEIGHT / 4; barrierFlip = false; break;
        case 3: edgeOffX = -TILE_WIDTH / 4; edgeOffY = -TILE_HEIGHT / 4; barrierFlip = true; break;
      }
      const BARRIER_OFFSET_Y = 3;
      const barrierSprite = this.ctx.getAdd().sprite(sCenterX + edgeOffX, sCenterY + edgeOffY + BARRIER_OFFSET_Y, barrierKey);
      barrierSprite.setOrigin(barrierConfig?.originX ?? 0.5, barrierConfig?.originY ?? 1.0);
      barrierSprite.setDepth(10);
      barrierSprite.setFlipX(barrierFlip);
      barrierSprite.setAlpha(0.5);
      const barrierBaseScale = TILE_WIDTH * 0.5;
      if (barrierSprite.width > 0) barrierSprite.setScale((barrierBaseScale / barrierSprite.width) * (barrierConfig?.scaleMultiplier ?? 1));
      container.add(barrierSprite);

      const targetCellData = gridManager.getCellData(secondCell.x, secondCell.y);
      const targetOccupied = !!targetCellData?.ploppable;
      const highlightColor = targetOccupied ? 0xff0000 : 0x00ff00;
      const g = this.ctx.getHighlightGraphics();
      const targetPoints = getIsometricTilePoints(secondCell.x, secondCell.y).map(p => ({ x: p.x + ox, y: p.y + oy }));
      g.lineStyle(1.5, highlightColor, 0.6);
      g.lineBetween(targetPoints[0].x, targetPoints[0].y, targetPoints[1].x, targetPoints[1].y);
      g.lineBetween(targetPoints[1].x, targetPoints[1].y, targetPoints[2].x, targetPoints[2].y);
      g.lineBetween(targetPoints[2].x, targetPoints[2].y, targetPoints[3].x, targetPoints[3].y);
      g.lineBetween(targetPoints[3].x, targetPoints[3].y, targetPoints[0].x, targetPoints[0].y);

      this.setGhostObject(container);
      return true;
    }

    // Security Camera add-on: two camera sprites on the existing street light
    if (type === 'Security Camera') {
      const camKey = PLOPPABLE_SPRITES['Security Camera'];
      if (!camKey) return false;
      const cellData = gridManager.getCellData(gridX, gridY);
      if (!cellData?.ploppable || cellData.ploppable.type !== 'Street Light') return false;
      if (cellData.ploppable.addOns?.includes('Security Camera')) return false;

      const lampOrientation = cellData.ploppable.orientation ?? 0;
      const centerX = (gridX - gridY) * (TILE_WIDTH / 2) + ox;
      const centerY = (gridX + gridY) * (TILE_HEIGHT / 2) + oy;
      const lampPosition = PloppableManager.getTypeAPosition(centerX, centerY, lampOrientation);

      this.destroyGhostSprite();
      const container = this.ctx.getAdd().container(lampPosition.x, lampPosition.y);
      container.setDepth(10);
      container.setAlpha(0.5);

      const lampConfig = PLOPPABLE_SPRITE_CONFIG['Street Light'];
      const lampBaseScale = TILE_WIDTH * 0.5;
      const lampScaleMult = lampConfig?.scaleMultiplier ?? 1;
      const tempLamp = this.ctx.getAdd().sprite(0, 0, PLOPPABLE_SPRITES['Street Light']!);
      tempLamp.setOrigin(lampConfig?.originX ?? 0.5, lampConfig?.originY ?? 1.0);
      if (tempLamp.width > 0) tempLamp.setScale((lampBaseScale / tempLamp.width) * lampScaleMult);
      const lampHeight = tempLamp.displayHeight;
      tempLamp.destroy();

      const camConfig = PLOPPABLE_SPRITE_CONFIG['Security Camera'];
      const camBaseScale = TILE_WIDTH * 0.5;
      const camScaleMult = camConfig?.scaleMultiplier ?? 1;
      const camY = -lampHeight * 0.5;

      const camLeft = this.ctx.getAdd().sprite(-7, camY, camKey);
      camLeft.setOrigin(camConfig?.originX ?? 0.5, camConfig?.originY ?? 1.0);
      if (camLeft.width > 0) camLeft.setScale((camBaseScale / camLeft.width) * camScaleMult);
      camLeft.setFlipX(false);
      container.add(camLeft);

      const camRight = this.ctx.getAdd().sprite(7, camY, camKey);
      camRight.setOrigin(camConfig?.originX ?? 0.5, camConfig?.originY ?? 1.0);
      if (camRight.width > 0) camRight.setScale((camBaseScale / camRight.width) * camScaleMult);
      camRight.setFlipX(true);
      container.add(camRight);

      this.setGhostObject(container);
      return true;
    }

    return false;
  }

  private paintCell(gridX: number, gridY: number): void {
    const gridManager = this.ctx.getGridManager();
    const gridWidth = this.ctx.getGridWidth();
    const gridHeight = this.ctx.getGridHeight();
    const vehicleSystem = this.ctx.getVehicleSystem();
    const pedestrianSystem = this.ctx.getPedestrianSystem();
    const isDevMode = this.ctx.getIsDevMode();

    if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) return;

    if (this.isDemolishMode) {
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) return;
      this.demolishAtCell(gridX, gridY);
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }

    if (this.isPermanentMode) {
      if (!isDevMode) return;
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) return;
      const cellData = gridManager.getCellData(gridX, gridY);
      const isPermanent = cellData?.isPermanent || false;
      gridManager.setCellData(gridX, gridY, { isPermanent: !isPermanent });
      this.ctx.redrawGrid();
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }

    if (this.isVehicleSpawnerMode) {
      if (!isDevMode) return;
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) return;
      const cellData = gridManager.getCellData(gridX, gridY);
      if (this.pendingSpawnerCell) {
        if (this.pendingSpawnerCell.x === gridX && this.pendingSpawnerCell.y === gridY) return;
        if (cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner) return;
        SpawnerManager.addVehicleSpawnerPair(this.pendingSpawnerCell.x, this.pendingSpawnerCell.y, gridX, gridY, gridManager, vehicleSystem);
        this.pendingSpawnerCell = null;
        this.isVehicleSpawnerMode = false;
        document.getElementById('vehicle-spawner-button')?.classList.remove('selected');
        this.ctx.redrawGrid();
        this.lastPaintedCell = { x: gridX, y: gridY };
        return;
      } else {
        if (cellData?.ploppable || cellData?.vehicleSpawner || cellData?.vehicleDespawner) return;
        gridManager.setCellData(gridX, gridY, { vehicleSpawner: true });
        this.pendingSpawnerCell = { x: gridX, y: gridY };
        this.ctx.redrawGrid();
        this.lastPaintedCell = { x: gridX, y: gridY };
        return;
      }
    }

    if (this.selectedPloppableType) {
      if (this.selectedPloppableType === 'Pedestrian Spawner' && !isDevMode) return;
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) return;
      if (this.selectedPloppableType === 'Security Camera') {
        const cellData = gridManager.getCellData(gridX, gridY);
        if (!cellData?.ploppable || cellData.ploppable.type !== 'Street Light') return;
        if (cellData.ploppable.addOns?.includes('Security Camera')) return;
      }
      if (this.selectedPloppableType === 'Parking Meter') {
        const cellData = gridManager.getCellData(gridX, gridY);
        if (!cellData?.ploppable || cellData.ploppable.type !== 'Parking Spot') return;
      }
      if (this.selectedPloppableType !== 'Security Camera' && this.selectedPloppableType !== 'Parking Meter') {
        if (!PloppableManager.canPlacePloppable(gridX, gridY, gridManager, this.selectedPloppableType, this.ploppableOrientation, gridWidth, gridHeight)) {
          return;
        }
      }
      const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
      const orientationType = button?.getAttribute('data-orientation-type') as 'A' | 'B' | undefined;
      const passable = button?.getAttribute('data-passable') === 'true';

      if (this.selectedPloppableType === 'Security Camera') {
        const cellData = gridManager.getCellData(gridX, gridY);
        const streetLight = cellData?.ploppable;
        if (streetLight && streetLight.type === 'Street Light') {
          if (streetLight.addOns?.includes('Security Camera')) return;
          const cost = getPloppableCost('Security Camera');
          if (!GameSystems.economy.canAfford(cost)) {
            GameSystems.messages.addSystemMessage(`Can't afford Security Camera ($${cost}).`, '💰');
            return;
          }
          GameSystems.economy.spend(cost);
          streetLight.addOns = streetLight.addOns ?? [];
          streetLight.addOns.push('Security Camera');
          const cameraAoE: Ploppable = { id: `cam-aoe-${gridX}-${gridY}`, type: 'Security Camera', x: gridX, y: gridY, cost: 0 };
          SafetySystem.getInstance().applyPloppableAoE(cameraAoE, gridManager, gridWidth, gridHeight, false);
          this.ctx.redrawGrid();
          this.lastPaintedCell = { x: gridX, y: gridY };
          return;
        }
      }

      if (this.selectedPloppableType === 'Parking Meter') {
        const cellData = gridManager.getCellData(gridX, gridY);
        const parkingSpot = cellData?.ploppable;
        if (parkingSpot && parkingSpot.type === 'Parking Spot') {
          const cost = getPloppableCost('Parking Meter');
          if (!GameSystems.economy.canAfford(cost)) {
            GameSystems.messages.addSystemMessage(`Can't afford Parking Meter ($${cost}).`, '💰');
            return;
          }
          GameSystems.economy.spend(cost);
          const spotOrientation = parkingSpot.orientation || 0;
          const oppositeOrientationMap = [2, 1, 3, 0];
          const meterOrientation = oppositeOrientationMap[spotOrientation];
          const parkingMeter: Ploppable = {
            id: `Parking Meter-${gridX}-${gridY}-${Date.now()}`,
            type: 'Parking Meter',
            x: gridX,
            y: gridY,
            cost,
            orientation: meterOrientation,
            orientationType: 'A',
            passable: passable ?? true,
            parkingSpotOrientation: spotOrientation,
          };
          gridManager.setCellData(gridX, gridY, { ploppable: parkingMeter });
          this.ctx.redrawGrid();
          this.lastPaintedCell = { x: gridX, y: gridY };
          return;
        }
      }

      const cost = getPloppableCost(this.selectedPloppableType);
      if (!GameSystems.economy.canAfford(cost)) {
        GameSystems.messages.addSystemMessage(`Can't afford ${this.selectedPloppableType} ($${cost}).`, '💰');
        return;
      }
      GameSystems.economy.spend(cost);
      const ploppable: Ploppable = {
        id: `${this.selectedPloppableType}-${gridX}-${gridY}-${Date.now()}`,
        type: this.selectedPloppableType,
        x: gridX,
        y: gridY,
        cost,
        orientation: this.ploppableOrientation,
        orientationType: orientationType,
        passable: passable ?? false,
      };
      if (this.selectedPloppableType === 'Parking Booth') ploppable.subType = 'BOOTH';
      if (this.selectedPloppableType === 'Tree' || this.selectedPloppableType === 'Shrub' || this.selectedPloppableType === 'Flower Patch') {
        ploppable.spriteFlip = Math.random() < 0.5;
      }
      const placed = PloppableManager.placePloppable(gridX, gridY, ploppable, gridManager, gridWidth, gridHeight);
      if (!placed) {
        GameSystems.economy.earn(cost);
        return;
      }
      if (this.selectedPloppableType === 'Crosswalk') {
        const cellData = gridManager.getCellData(gridX, gridY);
        gridManager.setCellData(gridX, gridY, { ...cellData, behavesLikeSidewalk: true });
      }
      if (this.selectedPloppableType === 'Pedestrian Spawner') {
        SpawnerManager.addPedestrianSpawner(gridX, gridY, pedestrianSystem);
      }
      this.ctx.redrawGrid();
      this.lastPaintedCell = { x: gridX, y: gridY };
      return;
    }

    if (this.selectedColor === null) return;

    if (this.isLineMode && this.hoveredEdge) {
      const { cellX, cellY, edge } = this.hoveredEdge;
      const existingKey = gridManager.findExistingBorderSegmentKey(cellX, cellY, edge);
      const edgeKeyToCheck = existingKey || gridManager.getBorderSegmentKey(cellX, cellY, edge);
      if (this.lastPaintedEdgeKey === edgeKeyToCheck) return;
      const currentKey = gridManager.getBorderSegmentKey(cellX, cellY, edge);
      const existingEdgeColor = existingKey ? gridManager.getBorderSegment(existingKey) : undefined;
      if (existingKey && existingEdgeColor === this.selectedColor) {
        gridManager.deleteBorderSegment(existingKey);
      } else {
        const lineCost = getLineCost(this.selectedColorName || '');
        if (lineCost > 0) {
          if (!GameSystems.economy.canAfford(lineCost)) {
            GameSystems.messages.addSystemMessage(`Can't afford ${this.selectedColorName || 'line'} ($${lineCost}/edge).`, '💰');
            return;
          }
          GameSystems.economy.spend(lineCost);
        }
        if (existingKey && existingKey !== currentKey) gridManager.deleteBorderSegment(existingKey);
        gridManager.setBorderSegment(currentKey, this.selectedColor);
      }
      this.ctx.redrawGrid();
      this.lastPaintedEdgeKey = existingKey || currentKey;
      this.lastPaintedCell = { x: cellX, y: cellY };
    } else if (!this.isLineMode) {
      if (this.lastPaintedCell && this.lastPaintedCell.x === gridX && this.lastPaintedCell.y === gridY) return;
      const surfaceType = this.selectedColor !== null ? COLOR_TO_SURFACE[this.selectedColor] : undefined;
      if (!surfaceType) return;
      const cellData = gridManager.getCellData(gridX, gridY);
      if (cellData?.isPermanent) return;
      const currentSurface = cellData?.surfaceType;
      if (currentSurface !== surfaceType) {
        const cost = getSurfaceCost(surfaceType);
        if (!GameSystems.economy.canAfford(cost)) {
          GameSystems.messages.addSystemMessage(`Can't afford ${surfaceType} ($${cost}/tile).`, '💰');
          return;
        }
        GameSystems.economy.spend(cost);
      }
      gridManager.setCellData(gridX, gridY, { ...(cellData || {}), color: this.selectedColor, surfaceType });
      this.ctx.redrawGrid();
      this.lastPaintedCell = { x: gridX, y: gridY };
    }
  }

  private demolishAtCell(gridX: number, gridY: number): void {
    const gridManager = this.ctx.getGridManager();
    const gridWidth = this.ctx.getGridWidth();
    const gridHeight = this.ctx.getGridHeight();
    const vehicleSystem = this.ctx.getVehicleSystem();
    const pedestrianSystem = this.ctx.getPedestrianSystem();
    const cellData = gridManager.getCellData(gridX, gridY);
    if (!cellData) return;
    let needsRedraw = false;
    if (cellData.vehicleSpawner || cellData.vehicleDespawner) {
      SpawnerManager.removeVehicleSpawnerPair(gridX, gridY, gridManager, vehicleSystem);
      needsRedraw = true;
    }
    if (cellData.ploppable) {
      if (cellData.ploppable.addOns?.includes('Security Camera')) {
        const camCost = getPloppableCost('Security Camera');
        const refund = Math.floor(camCost * DEMOLISH_REFUND_FRACTION);
        if (refund > 0) GameSystems.economy.earn(refund);
        cellData.ploppable.addOns = cellData.ploppable.addOns.filter(a => a !== 'Security Camera');
        if (cellData.ploppable.addOns.length === 0) delete cellData.ploppable.addOns;
        const cameraAoE: Ploppable = { id: `cam-aoe-${gridX}-${gridY}`, type: 'Security Camera', x: gridX, y: gridY, cost: 0 };
        SafetySystem.getInstance().applyPloppableAoE(cameraAoE, gridManager, gridWidth, gridHeight, true);
        this.ctx.redrawGrid();
        return;
      }
      const ploppableType = cellData.ploppable.type;
      const removedCost = cellData.ploppable.cost ?? getPloppableCost(ploppableType);
      const refund = Math.floor(removedCost * DEMOLISH_REFUND_FRACTION);
      if (refund > 0) GameSystems.economy.earn(refund);
      if (ploppableType === 'Pedestrian Spawner') {
        SpawnerManager.removePedestrianSpawner(gridX, gridY, pedestrianSystem);
      }
      if (ploppableType === 'Crosswalk') {
        const cd = gridManager.getCellData(gridX, gridY);
        if (cd) gridManager.setCellData(gridX, gridY, { ...cd, behavesLikeSidewalk: undefined });
      }
      PloppableManager.removePloppable(gridX, gridY, gridManager, gridWidth, gridHeight);
      needsRedraw = true;
    }
    if (needsRedraw) this.ctx.redrawGrid();
  }

  private clearVisualizationModes(): void {
    this.showAppealVisualization = false;
    this.showSafetyVisualization = false;
    const appealButton = document.getElementById('appeal-visualization-button');
    const safetyButton = document.getElementById('safety-visualization-button');
    if (appealButton) appealButton.classList.remove('selected');
    if (safetyButton) safetyButton.classList.remove('selected');
  }

  private setupRateInputHandler(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const parkingTimer = ParkingTimerSystem.getInstance();
      const meterInput = document.getElementById('meter-rate-input') as HTMLInputElement;
      const boothInput = document.getElementById('booth-rate-input') as HTMLInputElement;
      if (meterInput) {
        meterInput.addEventListener('change', () => {
          const rate = Math.max(1, Math.floor(parseFloat(meterInput.value) || 1));
          meterInput.value = rate.toString();
          parkingTimer.setMeterParkingRate(rate);
        }, { signal });
      }
      if (boothInput) {
        boothInput.addEventListener('change', () => {
          const rate = Math.max(1, Math.floor(parseFloat(boothInput.value) || 1));
          boothInput.value = rate.toString();
          parkingTimer.setBoothParkingRate(rate);
        }, { signal });
      }
    });
  }

  private setupColorButtons(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const colorButtons = document.querySelectorAll('.color-button');
      const ploppableButtons = document.querySelectorAll('.ploppable-button');
      const clearAndUpdate = () => {
        this.selectedColor = null;
        this.selectedColorName = null;
        this.selectedColorDescription = null;
        this.isLineMode = false;
        this.selectedPloppableType = null;
        this.clearVisualizationModes();
        this.clearHighlight();
        this.updateSelectionInfo();
      };
      colorButtons.forEach((button) => {
        button.addEventListener('click', () => {
          if (button.classList.contains('selected')) {
            colorButtons.forEach(btn => btn.classList.remove('selected'));
            ploppableButtons.forEach(btn => btn.classList.remove('selected'));
            clearAndUpdate();
            return;
          }
          colorButtons.forEach(btn => btn.classList.remove('selected'));
          ploppableButtons.forEach(btn => btn.classList.remove('selected'));
          button.classList.add('selected');
          this.selectedPloppableType = null;
          this.isVehicleSpawnerMode = false;
          this.pendingSpawnerCell = null;
          document.getElementById('vehicle-spawner-button')?.classList.remove('selected');
          document.getElementById('pedestrian-spawner-button')?.classList.remove('selected');
          const colorHex = button.getAttribute('data-color');
          if (colorHex) this.selectedColor = parseInt('0x' + colorHex, 16);
          this.selectedColorName = button.getAttribute('data-name') || null;
          this.selectedColorDescription = button.getAttribute('data-description') || null;
          this.isLineMode = ['Lane Line', 'Curb', 'Fence'].includes(this.selectedColorName || '');
          if (this.isPermanentMode) {
            this.isPermanentMode = false;
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
          }
          this.isDemolishMode = false;
          document.getElementById('demolish-button')?.classList.remove('selected');
          this.clearVisualizationModes();
          this.clearHighlight();
          this.updateSelectionInfo();
        }, { signal });
      });
      ploppableButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const ploppableName = button.getAttribute('data-name') || null;
          if (this.selectedPloppableType === ploppableName) {
            colorButtons.forEach(btn => btn.classList.remove('selected'));
            ploppableButtons.forEach(btn => btn.classList.remove('selected'));
            clearAndUpdate();
            return;
          }
          colorButtons.forEach(btn => btn.classList.remove('selected'));
          ploppableButtons.forEach(btn => btn.classList.remove('selected'));
          button.classList.add('selected');
          this.selectedColor = null;
          this.selectedColorName = null;
          this.selectedColorDescription = null;
          this.isLineMode = false;
          this.isVehicleSpawnerMode = false;
          this.pendingSpawnerCell = null;
          document.getElementById('vehicle-spawner-button')?.classList.remove('selected');
          document.getElementById('pedestrian-spawner-button')?.classList.remove('selected');
          this.isDemolishMode = false;
          document.getElementById('demolish-button')?.classList.remove('selected');
          this.selectedPloppableType = ploppableName;
          const lockedParkingOrient = this.ctx.getLockedParkingSpotOrientation?.() ?? null;
          this.ploppableOrientation =
            ploppableName === 'Parking Spot' && lockedParkingOrient !== null
              ? lockedParkingOrient
              : (ploppableName === 'Vending Machine' || ploppableName === 'Dumpster' || ploppableName === 'Portable Toilet' || ploppableName === 'Speed Bump')
                ? 2
                : 0;
          if (this.isPermanentMode) {
            this.isPermanentMode = false;
            const permanentButton = document.getElementById('permanent-button');
            if (permanentButton) {
              permanentButton.classList.remove('selected');
              permanentButton.textContent = 'Mark Permanent';
            }
          }
          this.clearHighlight();
          this.updateSelectionInfo();
        }, { signal });
      });
    });
  }

  private updateSelectionInfo(): void {
    const selectionInfo = document.getElementById('selection-info');
    const colorPreview = document.getElementById('selection-color-preview');
    const selectionName = document.getElementById('selection-name');
    const selectionPrice = document.getElementById('selection-price');
    const selectionDescription = document.getElementById('selection-description');
    const selectionInstructions = document.getElementById('selection-instructions');
    const rateInputContainer = document.getElementById('selection-rate-input-container');
    const meterRateInput = document.getElementById('meter-rate-input') as HTMLInputElement;
    const boothRateInput = document.getElementById('booth-rate-input') as HTMLInputElement;
    const setPrice = (text: string) => {
      if (selectionPrice) {
        selectionPrice.textContent = text;
        selectionPrice.style.display = text ? 'block' : 'none';
      }
    };
    if (this.isVehicleSpawnerMode) {
      setPrice('');
      if (rateInputContainer) rateInputContainer.style.display = 'none';
      if (selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
        colorPreview.style.display = 'none';
        selectionInstructions.style.display = 'none';
        selectionName.textContent = this.pendingSpawnerCell ? 'Vehicle Despawner' : 'Vehicle Spawner';
        selectionDescription.textContent = this.pendingSpawnerCell
          ? 'Click a different cell to place the vehicle despawner (🎯).'
          : 'Click a cell to place the vehicle spawner (🚗). After placing, you will be prompted to place a despawner.';
        selectionInfo.style.display = 'block';
      }
    } else if (this.isDemolishMode) {
      setPrice('');
      if (rateInputContainer) rateInputContainer.style.display = 'none';
      if (selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
        colorPreview.style.display = 'none';
        selectionInstructions.style.display = 'none';
        selectionName.textContent = 'Demolish Tool';
        selectionDescription.textContent = 'Click on any ploppable to to remove it. No refunds.';
        selectionInfo.style.display = 'block';
      }
    } else if (this.selectedPloppableType) {
      const ploppableCost = getPloppableCost(this.selectedPloppableType);
      setPrice(ploppableCost > 0 ? `$${ploppableCost}` : 'Free');
      if (selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
        colorPreview.style.display = 'none';
        const selectionDisplayNames: Record<string, string> = {
          'Portable Toilet': 'Lotty Potty',
          'Vending Machine': 'Lot Pop',
        };
        selectionName.textContent = selectionDisplayNames[this.selectedPloppableType] || this.selectedPloppableType;
        const button = document.querySelector(`.ploppable-button[data-name="${this.selectedPloppableType}"]`);
        let description = button?.getAttribute('data-description') || '';
        let instructions = '';
        if (this.selectedPloppableType === 'Pedestrian Spawner') {
          description = 'Click a cell to place a pedestrian spawner (🚶). Pedestrians will spawn here and wander randomly on the pedestrian rail grid.';
        } else {
          const rotTypes = ['Parking Spot', 'Trash Can', 'Vending Machine', 'Dumpster', 'Portable Toilet', 'Street Light', 'Bench', 'Speed Bump', 'Parking Booth'];
          if (rotTypes.includes(this.selectedPloppableType)) instructions = 'Use Q and E keys to rotate orientation.';
          if (this.selectedPloppableType === 'Crosswalk') instructions = 'Requires asphalt. Use Q and E keys to rotate orientation.';
          if (this.selectedPloppableType === 'Security Camera') instructions = 'Can only be placed on cells that already contain a Street Light.';
          if (this.selectedPloppableType === 'Parking Spot') {
            instructions = this.ctx.getLockedParkingSpotOrientation?.() != null
              ? 'Can only be placed on dirt, gravel, or asphalt. Orientation is locked for this lot.'
              : 'Can only be placed on dirt, gravel, or asphalt. Use Q and E to rotate.';
          }
          if (this.selectedPloppableType === 'Parking Meter') instructions = 'Can only be placed on cells that already contain a Parking Spot.';
        }
        selectionDescription.textContent = description;
        selectionInstructions.textContent = instructions;
        selectionInstructions.style.display = instructions ? 'block' : 'none';
        if ((this.selectedPloppableType === 'Parking Meter' || this.selectedPloppableType === 'Parking Booth') && rateInputContainer && meterRateInput && boothRateInput) {
          rateInputContainer.style.display = 'block';
          const parkingTimer = ParkingTimerSystem.getInstance();
          meterRateInput.value = parkingTimer.getMeterParkingRate().toString();
          boothRateInput.value = parkingTimer.getBoothParkingRate().toString();
        } else if (rateInputContainer) rateInputContainer.style.display = 'none';
        selectionInfo.style.display = 'block';
      }
    } else if (this.selectedColor !== null && selectionInfo && colorPreview && selectionName && selectionDescription && selectionInstructions) {
      if (rateInputContainer) rateInputContainer.style.display = 'none';
      selectionInstructions.textContent = '';
      selectionInstructions.style.display = 'none';
      const surfaceType = COLOR_TO_SURFACE[this.selectedColor];
      if (this.isLineMode) setPrice(getLineCost(this.selectedColorName || '') > 0 ? `$${getLineCost(this.selectedColorName || '')} per edge` : 'Free');
      else if (!surfaceType) setPrice('Free');
      else setPrice(`$${getSurfaceCost(surfaceType)} per tile`);
      // Fence is rendered as a chain-link mesh, not a flat color; hide the red swatch preview.
      if (this.selectedColorName === 'Fence') {
        colorPreview.style.display = 'none';
      } else {
        colorPreview.style.display = 'block';
        colorPreview.style.backgroundColor = '#' + this.selectedColor.toString(16).padStart(6, '0');
      }
      selectionName.textContent = this.selectedColorName || 'Unknown';
      selectionDescription.textContent = this.selectedColorDescription || '';
      selectionInfo.style.display = 'block';
    } else {
      setPrice('');
      if (selectionInfo) selectionInfo.style.display = 'none';
    }
  }

  private setupKeyboardControls(): void {
    const kb = this.ctx.getInput().keyboard;
    kb?.on('keydown-Q', this.onKeyQ);
    kb?.on('keydown-E', this.onKeyE);
  }

  private readonly onKeyQ = (): void => {
    if (this.selectedPloppableType === 'Parking Spot') {
      if (this.ctx.getLockedParkingSpotOrientation?.() != null) return;
      const rotationMap = [1, 3, 0, 2];
      this.ploppableOrientation = rotationMap[this.ploppableOrientation];
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    } else if (this.selectedPloppableType === 'Vending Machine' || this.selectedPloppableType === 'Dumpster' || this.selectedPloppableType === 'Portable Toilet' || this.selectedPloppableType === 'Speed Bump') {
      this.ploppableOrientation = this.ploppableOrientation === 2 ? 3 : 2;
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    } else if (['Trash Can', 'Street Light', 'Bench'].includes(this.selectedPloppableType || '')) {
      this.ploppableOrientation = (this.ploppableOrientation + 3) % 4;
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    } else if (this.selectedPloppableType === 'Crosswalk') {
      this.ploppableOrientation = this.ploppableOrientation === 0 ? 1 : 0;
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    }
  };

  private readonly onKeyE = (): void => {
    if (this.selectedPloppableType === 'Parking Spot') {
      if (this.ctx.getLockedParkingSpotOrientation?.() != null) return;
      const rotationMap = [2, 0, 3, 1];
      this.ploppableOrientation = rotationMap[this.ploppableOrientation];
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    } else if (this.selectedPloppableType === 'Vending Machine' || this.selectedPloppableType === 'Dumpster' || this.selectedPloppableType === 'Portable Toilet' || this.selectedPloppableType === 'Speed Bump') {
      this.ploppableOrientation = this.ploppableOrientation === 2 ? 3 : 2;
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    } else if (['Trash Can', 'Street Light', 'Bench', 'Parking Booth'].includes(this.selectedPloppableType || '')) {
      this.ploppableOrientation = (this.ploppableOrientation + 1) % 4;
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    } else if (this.selectedPloppableType === 'Crosswalk') {
      this.ploppableOrientation = this.ploppableOrientation === 0 ? 1 : 0;
      if (this.hoveredCell) this.drawHighlight(this.hoveredCell.x, this.hoveredCell.y);
    }
  };

  private exportGrid(): void {
    const gridManager = this.ctx.getGridManager();
    const vehicleSystem = this.ctx.getVehicleSystem();
    const serialized = gridManager.serializeGrid();
    const obj = JSON.parse(serialized) as Record<string, unknown>;
    obj.vehicleSpawnerPairs = vehicleSystem.getSpawnerDespawnerPairs().map(p => [p.spawnerX, p.spawnerY, p.despawnerX, p.despawnerY]);
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parking-lot-grid-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private importGrid(file: File): void {
    const gridManager = this.ctx.getGridManager();
    const gridWidth = this.ctx.getGridWidth();
    const gridHeight = this.ctx.getGridHeight();
    const vehicleSystem = this.ctx.getVehicleSystem();
    const pedestrianSystem = this.ctx.getPedestrianSystem();
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      let pairs: Array<[number, number, number, number]> | undefined;
      try {
        const data = JSON.parse(content) as { vehicleSpawnerPairs?: Array<[number, number, number, number]> };
        pairs = data.vehicleSpawnerPairs;
      } catch {
        // ignore
      }
      const success = gridManager.deserializeGrid(content);
      if (success) {
        SpawnerManager.rebuildSpawnerPairsFromGrid(gridManager, gridWidth, gridHeight, vehicleSystem, pedestrianSystem, pairs);
        this.ctx.redrawGrid();
      } else {
        alert('Failed to import grid. Invalid file format.');
      }
    };
    reader.readAsText(file);
  }

  private setupDemolishButton(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const demolishButton = document.getElementById('demolish-button');
      if (demolishButton) {
        demolishButton.addEventListener('click', () => {
          const wasSelected = demolishButton.classList.contains('selected');
          demolishButton.classList.toggle('selected');
          this.isDemolishMode = !wasSelected;
          if (this.isDemolishMode) {
            this.selectedColor = null;
            this.selectedPloppableType = null;
            this.isVehicleSpawnerMode = false;
            this.pendingSpawnerCell = null;
            document.querySelectorAll('.color-button').forEach(btn => btn.classList.remove('selected'));
            document.querySelectorAll('.ploppable-button').forEach(btn => btn.classList.remove('selected'));
            document.getElementById('vehicle-spawner-button')?.classList.remove('selected');
            document.getElementById('pedestrian-spawner-button')?.classList.remove('selected');
          }
          this.clearHighlight();
          this.updateSelectionInfo();
        }, { signal });
      }
    });
  }

  private setupVehicleSpawnerButton(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const vehicleButton = document.getElementById('vehicle-spawner-button');
      if (vehicleButton && this.ctx.getIsDevMode()) {
        vehicleButton.addEventListener('click', () => {
          const wasSelected = vehicleButton.classList.contains('selected');
          vehicleButton.classList.toggle('selected');
          this.isVehicleSpawnerMode = !wasSelected;
          if (!this.isVehicleSpawnerMode) this.pendingSpawnerCell = null;
          else {
            this.selectedColor = null;
            this.selectedPloppableType = null;
            this.isDemolishMode = false;
            document.querySelectorAll('.color-button').forEach(btn => btn.classList.remove('selected'));
            document.querySelectorAll('.ploppable-button').forEach(btn => btn.classList.remove('selected'));
            document.getElementById('demolish-button')?.classList.remove('selected');
          }
          this.clearHighlight();
          this.updateSelectionInfo();
        }, { signal });
      }
    });
  }

  private setupPedestrianSpawnerButton(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const pedestrianButton = document.getElementById('pedestrian-spawner-button');
      if (pedestrianButton && this.ctx.getIsDevMode()) {
        pedestrianButton.addEventListener('click', () => {
          const wasSelected = pedestrianButton.classList.contains('selected');
          pedestrianButton.classList.toggle('selected');
          if (wasSelected) {
            this.selectedPloppableType = null;
          } else {
            this.selectedPloppableType = 'Pedestrian Spawner';
            this.selectedColor = null;
            this.isVehicleSpawnerMode = false;
            this.pendingSpawnerCell = null;
            this.isDemolishMode = false;
            document.querySelectorAll('.color-button').forEach(btn => btn.classList.remove('selected'));
            document.querySelectorAll('.ploppable-button').forEach(btn => btn.classList.remove('selected'));
            document.getElementById('vehicle-spawner-button')?.classList.remove('selected');
            document.getElementById('demolish-button')?.classList.remove('selected');
          }
          this.clearHighlight();
          this.updateSelectionInfo();
        }, { signal });
      }
    });
  }

  private setupPermanentButton(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const permanentButton = document.getElementById('permanent-button');
      if (permanentButton && this.ctx.getIsDevMode()) {
        permanentButton.addEventListener('click', () => {
          this.isPermanentMode = !this.isPermanentMode;
          permanentButton.classList.toggle('selected', this.isPermanentMode);
          permanentButton.textContent = this.isPermanentMode ? 'Unmark Permanent' : 'Mark Permanent';
          this.selectedColor = null;
          this.selectedPloppableType = null;
          this.clearHighlight();
          this.updateSelectionInfo();
        }, { signal });
      }
    });
  }

  private setupAppealVisualizationButton(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const appealButton = document.getElementById('appeal-visualization-button');
      if (appealButton) {
        appealButton.addEventListener('click', () => {
          this.showAppealVisualization = !this.showAppealVisualization;
          if (this.showAppealVisualization) {
            this.showSafetyVisualization = false;
            document.getElementById('safety-visualization-button')?.classList.remove('selected');
            appealButton.classList.add('selected');
          } else appealButton.classList.remove('selected');
          this.ctx.redrawGrid();
        }, { signal });
      }
    });
  }

  private setupSafetyVisualizationButton(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const safetyButton = document.getElementById('safety-visualization-button');
      if (safetyButton) {
        safetyButton.addEventListener('click', () => {
          this.showSafetyVisualization = !this.showSafetyVisualization;
          if (this.showSafetyVisualization) {
            this.showAppealVisualization = false;
            document.getElementById('appeal-visualization-button')?.classList.remove('selected');
            safetyButton.classList.add('selected');
          } else safetyButton.classList.remove('selected');
          this.ctx.redrawGrid();
        }, { signal });
      }
    });
  }

  private setupExportImportButtons(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const exportButton = document.getElementById('export-button');
      const importButton = document.getElementById('import-button');
      const importInput = document.getElementById('import-input') as HTMLInputElement;
      if (exportButton) exportButton.addEventListener('click', () => this.exportGrid(), { signal });
      if (importButton && importInput) {
        importButton.addEventListener('click', () => importInput.click(), { signal });
        importInput.addEventListener('change', (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) this.importGrid(file);
        }, { signal });
      }
    });
  }

  private setupGridResizeControls(signal: AbortSignal): void {
    this.scheduleDomSetup(signal, () => {
      const resizeButton = document.getElementById('resize-grid-button');
      const gridSizeXInput = document.getElementById('grid-size-x') as HTMLInputElement;
      const gridSizeYInput = document.getElementById('grid-size-y') as HTMLInputElement;
      if (gridSizeXInput) gridSizeXInput.value = this.ctx.getGridWidth().toString();
      if (gridSizeYInput) gridSizeYInput.value = this.ctx.getGridHeight().toString();
      if (resizeButton) {
        resizeButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const newSizeX = parseInt(gridSizeXInput?.value || '10', 10);
          const newSizeY = parseInt(gridSizeYInput?.value || '10', 10);
          if (isNaN(newSizeX) || isNaN(newSizeY) || newSizeX < 1 || newSizeY < 1 || newSizeX > 100 || newSizeY > 100) {
            alert('Please enter valid grid dimensions (1-100)');
            return;
          }
          if (newSizeX === this.ctx.getGridWidth() && newSizeY === this.ctx.getGridHeight()) return;
          try {
            this.ctx.resizeGrid(newSizeX, newSizeY);
          } catch (err) {
            console.error('Error resizing grid:', err);
            alert('Error resizing grid. Check console for details.');
          }
          if (gridSizeXInput) gridSizeXInput.value = this.ctx.getGridWidth().toString();
          if (gridSizeYInput) gridSizeYInput.value = this.ctx.getGridHeight().toString();
        }, { signal });
      }
    });
  }
}
