import Phaser from 'phaser';
import { getIsometricTilePoints } from '@/utils/isometric';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { Ploppable, COLOR_TO_SURFACE } from '@/types';
import { BaseGameplayScene } from '@/core/BaseGameplayScene';
import { GameSystems } from '@/core/GameSystems';
import { PloppableManager } from '@/systems/PloppableManager';
import { SpawnerManager } from '@/managers/SpawnerManager';
import { GridInteractionHandler } from '@/systems/GridInteractionHandler';
import { GridManager } from '@/core/GridManager';
import { SafetySystem } from '@/systems/SafetySystem';
import { ParkingTimerSystem } from '@/systems/ParkingTimerSystem';
import { getChallengeById, getSpawnIntervalMsForSchedule } from '@/config/challenges.config';
import { getPloppableCost, DEMOLISH_REFUND_FRACTION } from '@/config/ploppableCosts.config';
import { ChallengeSystem } from '@/systems/ChallengeSystem';
import { completeChallenge } from '@/managers/ProgressManager';
import { LeaderboardSystem } from '@/systems/LeaderboardSystem';
import { TimeSystem } from '@/systems/TimeSystem';

type TutorialHighlightType = 'none' | 'playable' | 'road' | 'lane_line' | 'curb';

const LEARNING_LOT_TUTORIAL_STEPS: { text: string; highlight: TutorialHighlightType }[] = [
  { text: 'Welcome to Parking Lot Tycoon! Your goal is to design a parking lot that meets each challenge\'s win conditions.', highlight: 'none' },
  { text: 'This is the playable area. You can edit these tiles to design the lot.', highlight: 'playable' },
  { text: 'This is the road access. You cannot edit these tiles (or the sidewalks on the grid border).', highlight: 'road' },
  { text: 'This is a lane line. Cars prefer to stay on the right and avoid crossing lane lines when possible.', highlight: 'lane_line' },
  { text: 'This is a curb. Cars cannot pass over them, so remember to delete them where necessary.', highlight: 'curb' },
  { text: 'Try designing a lot with a rating of 50 and at least three parking spots before the end of day 3. You have $5000 to play with. Once achieved, you\'ll unlock the Pizza Parking Problem!', highlight: 'none' },
];

export class ChallengeScene extends BaseGameplayScene {
  protected challengeId!: string;
  protected isDevMode!: boolean;

  private initialBudget: number = 0;
  private challengeSystem: ChallengeSystem | null = null;
  private gameOverState: 'playing' | 'won' | 'lost' = 'playing';
  private lastWinMetrics: { profit: number; rating: number; currentDay: number } | null = null;

  // Shared state (dev and challenge mode)
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

  // Learning Lot tutorial (only when challengeId === 'learning-lot' && !isDevMode)
  private tutorialActive: boolean = false;
  private tutorialStepIndex: number = 0;
  private tutorialBlinkVisible: boolean = true;
  private tutorialBlinkAccum: number = 0;
  private tutorialHighlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private leftPanelTutorialOverlay: HTMLElement | null = null;

  constructor() {
    super({ key: 'ChallengeScene' }, 10, 10); // gridWidth/height can be overridden by scene data
  }

  create(): void {
    const data = (this.scene.settings.data || {}) as Record<string, unknown>;
    this.challengeId = (data.challengeId as string) ?? 'learning-lot';
    this.isDevMode = data.isDevMode === true;
    super.create();
  }

  protected setupScene(): void {
    this.showDevOnlyCellLabels = this.isDevMode;
    const challenge = getChallengeById(this.challengeId);
    const budget = challenge?.budget ?? 10000;
    this.initialBudget = budget;
    GameSystems.resetForChallenge(budget, this.gridManager, this.gridWidth, this.gridHeight);

    if (challenge && !this.isDevMode) {
      this.challengeSystem = new ChallengeSystem(challenge);
      const fallbackSpawnMs = challenge.vehicleSpawnIntervalMs ?? 3000;
      this.vehicleSystem.setSpawnIntervalMs(fallbackSpawnMs);
      if (challenge.vehicleSpawnSchedule?.length) {
        this.vehicleSystem.setGetSpawnIntervalMs(() => {
          const totalMinutes = TimeSystem.getInstance().getTotalMinutes();
          return getSpawnIntervalMsForSchedule(totalMinutes, challenge.vehicleSpawnSchedule!, fallbackSpawnMs);
        });
      }
      if (challenge.pedestrianRespawnBands?.length) {
        this.pedestrianSystem.setRespawnBands(challenge.pedestrianRespawnBands);
      } else if (challenge.pedestrianRespawnMinMs != null && challenge.pedestrianRespawnMaxMs != null) {
        this.pedestrianSystem.setRespawnDurationMs(challenge.pedestrianRespawnMinMs, challenge.pedestrianRespawnMaxMs);
      }
      if (challenge.driverExitsVehicleProbability != null) {
        this.vehicleSystem.setDriverExitsVehicleProbability(challenge.driverExitsVehicleProbability);
      }
    } else {
      this.challengeSystem = null;
    }

    GameSystems.messages.initializePanel();

    if (challenge?.needGenerationProbability != null) {
      this.pedestrianSystem.setNeedGenerationProbability(challenge.needGenerationProbability);
    } else {
      this.pedestrianSystem.setNeedGenerationProbability(0.5);
    }
    if (challenge?.needTypeDistribution != null) {
      this.pedestrianSystem.setNeedTypeDistribution(challenge.needTypeDistribution);
    } else {
      this.pedestrianSystem.setNeedTypeDistribution({ trash: 0.25, thirst: 0.25, toilet: 0.5 });
    }

    this.setupKeyboardControls();
    this.setupColorButtons();
    this.setupDemolishButton();
    this.setupVehicleSpawnerButton();
    this.setupPedestrianSpawnerButton();
    this.setupPermanentButton();
    this.setupRateInputHandler();

    if (this.isDevMode) {
      this.setupExportImportButtons();
      this.setupGridResizeControls();
      this.setupAppealVisualizationButton();
      this.setupSafetyVisualizationButton();
      this.setDevOnlyToolsVisibility(true);
      GameSystems.rating.setDebugLogParkerFinalization(true);
    } else {
      this.setDevOnlyToolsVisibility(false);
    }

    // Load initial grid from URL when challenge defines one (e.g. Learning Lot)
    if (challenge?.initialGridPath) {
      fetch(challenge.initialGridPath)
        .then((r) => r.text())
        .then((content) => {
          try {
            const data = JSON.parse(content) as { vehicleSpawnerPairs?: Array<[number, number, number, number]> };
            const success = this.gridManager.deserializeGrid(content);
            if (success) {
              SpawnerManager.rebuildSpawnerPairsFromGrid(
                this.gridManager,
                this.gridWidth,
                this.gridHeight,
                this.vehicleSystem,
                this.pedestrianSystem,
                data.vehicleSpawnerPairs
              );
            this.redrawGrid();
          }
          if (this.challengeId === 'learning-lot' && !this.isDevMode) {
            this.startLearningLotTutorial();
          }
        } catch {
          console.warn('Failed to parse initial grid from', challenge.initialGridPath);
        }
      })
      .catch(() => {
        console.warn('Failed to load initial grid from', challenge.initialGridPath);
      });
    } else if (this.challengeId === 'learning-lot' && !this.isDevMode) {
      this.time.delayedCall(400, () => this.startLearningLotTutorial());
    }

    this.time.delayedCall(100, () => {
      document.getElementById('back-to-menu-button')?.addEventListener('click', () => {
        this.scene.start('MainMenuScene');
      });
    });
  }

  update(time: number, delta: number): void {
    if (this.tutorialActive) {
      this.tutorialBlinkAccum += delta;
      if (this.tutorialBlinkAccum >= 500) {
        this.tutorialBlinkAccum = 0;
        this.tutorialBlinkVisible = !this.tutorialBlinkVisible;
      }
      const step = LEARNING_LOT_TUTORIAL_STEPS[this.tutorialStepIndex];
      if (step) this.drawTutorialHighlight(step.highlight);
    }
    if (this.gameOverState !== 'playing') {
      super.update(time, delta);
      return;
    }
    if (this.isDevMode || !this.challengeSystem) {
      super.update(time, delta);
      return;
    }
    const money = GameSystems.economy.getMoney();
    if (money < 0) {
      this.gameOverState = 'lost';
      this.showLoseOverlay();
      super.update(time, delta);
      return;
    }
    const metrics = this.gatherChallengeMetrics();
    if (this.challengeSystem.checkWinConditions(metrics)) {
      this.gameOverState = 'won';
      completeChallenge(this.challengeId);
      this.lastWinMetrics = {
        profit: metrics.profit ?? 0,
        rating: metrics.rating ?? 0,
        currentDay: metrics.currentDay ?? 0,
      };
      this.showWinOverlay();
    }
    super.update(time, delta);
  }

  private gatherChallengeMetrics(): { profit?: number; rating?: number; currentDay?: number; parkingSpotCount?: number; ploppableCountByType?: Record<string, number> } {
    const profit = GameSystems.economy.getMoney() - this.initialBudget;
    const components = GameSystems.rating.getComponentRatings(this.gridManager, this.gridWidth, this.gridHeight);
    const rating = Math.floor(components.total);
    const currentDay = GameSystems.time.getCurrentDay();
    const parkingSpots = this.getAllParkingSpots();
    const ploppableCountByType: Record<string, number> = {};
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const cellData = this.gridManager.getCellData(x, y);
        const p = cellData?.ploppable;
        if (p && p.x === x && p.y === y) {
          ploppableCountByType[p.type] = (ploppableCountByType[p.type] ?? 0) + 1;
        }
      }
    }
    return {
      profit,
      rating,
      currentDay,
      parkingSpotCount: parkingSpots.length,
      ploppableCountByType,
    };
  }

  private showWinOverlay(): void {
    const container = document.getElementById('app-container');
    if (!container || document.getElementById('game-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'game-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:sans-serif;';
    overlay.innerHTML = `
      <h2 style="margin-bottom:20px;font-size:28px;">Challenge Complete!</h2>
      <p style="margin-bottom:24px;">You've completed this challenge.</p>
      <div style="display:flex;gap:16px;">
        <button id="overlay-menu-btn" class="action-button" style="width:140px;">Menu</button>
        <button id="overlay-retry-btn" class="action-button" style="width:140px;">Retry</button>
        <button id="overlay-leaderboard-btn" class="action-button" style="width:140px;">Leaderboard</button>
      </div>
    `;
    container.appendChild(overlay);
    document.getElementById('overlay-menu-btn')?.addEventListener('click', () => this.removeOverlayAndGoToMenu());
    document.getElementById('overlay-retry-btn')?.addEventListener('click', () => this.removeOverlayAndRetry());
    document.getElementById('overlay-leaderboard-btn')?.addEventListener('click', () => this.removeOverlayAndGoToLeaderboard());
  }

  private showLoseOverlay(): void {
    const container = document.getElementById('app-container');
    if (!container || document.getElementById('game-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'game-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:sans-serif;';
    overlay.innerHTML = `
      <h2 style="margin-bottom:20px;font-size:28px;">Game Over</h2>
      <p style="margin-bottom:24px;">You ran out of money.</p>
      <div style="display:flex;gap:16px;">
        <button id="overlay-menu-btn" class="action-button" style="width:140px;">Menu</button>
        <button id="overlay-retry-btn" class="action-button" style="width:140px;">Retry</button>
      </div>
    `;
    container.appendChild(overlay);
    document.getElementById('overlay-menu-btn')?.addEventListener('click', () => this.removeOverlayAndGoToMenu());
    document.getElementById('overlay-retry-btn')?.addEventListener('click', () => this.removeOverlayAndRetry());
  }

  private removeOverlayAndGoToMenu(): void {
    document.getElementById('game-overlay')?.remove();
    this.scene.start('MainMenuScene');
  }

  private removeOverlayAndRetry(): void {
    document.getElementById('game-overlay')?.remove();
    const challenge = getChallengeById(this.challengeId);
    const gridWidth = challenge?.lotSize?.width ?? 10;
    const gridHeight = challenge?.lotSize?.height ?? 10;
    this.scene.start('ChallengeScene', { challengeId: this.challengeId, gridWidth, gridHeight });
  }

  private removeOverlayAndGoToLeaderboard(): void {
    document.getElementById('game-overlay')?.remove();
    if (this.lastWinMetrics) {
      const name = window.prompt('Enter your name for the leaderboard:', 'Player')?.trim() || 'Player';
      LeaderboardSystem.getInstance().addEntry({
        playerName: name,
        challengeId: this.challengeId,
        score: this.lastWinMetrics.rating,
        metrics: {
          profit: this.lastWinMetrics.profit,
          rating: this.lastWinMetrics.rating,
          time: this.lastWinMetrics.currentDay,
        },
      });
    }
    this.scene.start('LeaderboardScene');
  }

  private setDevOnlyToolsVisibility(visible: boolean): void {
    const el = document.getElementById('dev-only-tools');
    if (el) (el as HTMLElement).style.display = visible ? '' : 'none';
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

  private screenX(gx: number, gy: number): number {
    return (gx - gy) * (TILE_WIDTH / 2) + this.gridOffsetX;
  }

  private screenY(gx: number, gy: number): number {
    return (gx + gy) * (TILE_HEIGHT / 2) + this.gridOffsetY;
  }

  private startLearningLotTutorial(): void {
    GameSystems.time.setPaused(true);
    this.vehicleSystem.setSpawnPaused(true);
    this.tutorialActive = true;
    this.tutorialStepIndex = 0;
    this.tutorialBlinkVisible = true;
    this.tutorialBlinkAccum = 0;
    if (!this.tutorialHighlightGraphics) {
      this.tutorialHighlightGraphics = this.add.graphics();
      this.tutorialHighlightGraphics.setDepth(5);
    }
    const leftPanel = document.getElementById('left-panel');
    if (leftPanel) {
      this.leftPanelTutorialOverlay = document.createElement('div');
      this.leftPanelTutorialOverlay.style.cssText = 'position:absolute;inset:0;z-index:20;background:transparent;';
      this.leftPanelTutorialOverlay.style.pointerEvents = 'auto';
      leftPanel.appendChild(this.leftPanelTutorialOverlay);
    }
    const step = LEARNING_LOT_TUTORIAL_STEPS[0];
    GameSystems.messages.showTutorialStep(step.text, () => this.advanceTutorial());
  }

  private advanceTutorial(): void {
    this.tutorialStepIndex++;
    if (this.tutorialStepIndex >= LEARNING_LOT_TUTORIAL_STEPS.length) {
      this.tutorialActive = false;
      GameSystems.time.setPaused(false);
      this.vehicleSystem.setSpawnPaused(false);
      this.leftPanelTutorialOverlay?.remove();
      this.leftPanelTutorialOverlay = null;
      const leftPanel = document.getElementById('left-panel');
      if (leftPanel) leftPanel.style.position = '';
      if (this.tutorialHighlightGraphics) {
        this.tutorialHighlightGraphics.clear();
        this.tutorialHighlightGraphics.setVisible(false);
      }
      GameSystems.messages.hideTutorialStep();
      return;
    }
    const step = LEARNING_LOT_TUTORIAL_STEPS[this.tutorialStepIndex];
    GameSystems.messages.showTutorialStep(step.text, () => this.advanceTutorial());
  }

  private drawTutorialHighlight(type: TutorialHighlightType): void {
    const g = this.tutorialHighlightGraphics;
    if (!g) return;
    g.clear();
    if (type === 'none') {
      g.setVisible(false);
      return;
    }
    g.setVisible(this.tutorialBlinkVisible);
    const ox = this.gridOffsetX;
    const oy = this.gridOffsetY;
    g.lineStyle(4, 0x00bfff, 0.9);

    if (type === 'playable') {
      const path: { x: number; y: number }[] = [];
      for (let x = 0; x <= 9; x++) path.push({ x: this.screenX(x, 0) + 0, y: this.screenY(x, 0) - TILE_HEIGHT / 2 });
      for (let y = 0; y <= 9; y++) path.push({ x: this.screenX(9, y) + TILE_WIDTH / 2, y: this.screenY(9, y) + 0 });
      for (let x = 9; x >= 0; x--) path.push({ x: this.screenX(x, 9) + 0, y: this.screenY(x, 9) + TILE_HEIGHT / 2 });
      for (let y = 9; y >= 0; y--) path.push({ x: this.screenX(0, y) - TILE_WIDTH / 2, y: this.screenY(0, y) + 0 });
      g.beginPath();
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.closePath();
      g.strokePath();
    } else if (type === 'road') {
      const path: { x: number; y: number }[] = [];
      for (let x = 0; x <= 9; x++) path.push({ x: this.screenX(x, 10) + 0, y: this.screenY(x, 10) - TILE_HEIGHT / 2 });
      for (let y = 10; y <= 11; y++) path.push({ x: this.screenX(9, y) + TILE_WIDTH / 2, y: this.screenY(9, y) + 0 });
      for (let x = 9; x >= 0; x--) path.push({ x: this.screenX(x, 11) + 0, y: this.screenY(x, 11) + TILE_HEIGHT / 2 });
      for (let y = 11; y >= 10; y--) path.push({ x: this.screenX(0, y) - TILE_WIDTH / 2, y: this.screenY(0, y) + 0 });
      g.beginPath();
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.closePath();
      g.strokePath();
    } else if (type === 'lane_line') {
      // Lane line is edge 2 (bottom→left) of each cell in row y=10, matching GridRenderer border segments
      for (let x = 0; x <= 9; x++) {
        const points = getIsometricTilePoints(x, 10);
        const startX = points[2].x + ox;
        const startY = points[2].y + oy;
        const endX = points[3].x + ox;
        const endY = points[3].y + oy;
        g.lineBetween(startX, startY, endX, endY);
      }
    } else if (type === 'curb') {
      // Curb is edge 2 (bottom→left) of each cell in row y=9, matching GridRenderer border segments
      for (let x = 0; x <= 9; x++) {
        const points = getIsometricTilePoints(x, 9);
        const startX = points[2].x + ox;
        const startY = points[2].y + oy;
        const endX = points[3].x + ox;
        const endY = points[3].y + oy;
        g.lineBetween(startX, startY, endX, endY);
      }
    }
  }

  /**
   * Override render to add appeal/safety visualization (dev mode only)
   */
  protected render(): void {
    super.render();
    if (!this.isDevMode) return;
    const shouldRender = this.showAppealVisualization || this.showSafetyVisualization;
    if (shouldRender) {
      this.renderAppealSafetyVisualization();
    } else {
      if (this.visualizationGraphics) {
        this.visualizationGraphics.clear();
        this.visualizationGraphics.setVisible(false);
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
    
    // Handle permanent mode (toggle permanent status) — dev only
    if (this.isPermanentMode) {
      if (!this.isDevMode) return;
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
    
    // Handle vehicle spawner/despawner placement — dev only
    if (this.isVehicleSpawnerMode) {
      if (!this.isDevMode) return;
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
      if (this.selectedPloppableType === 'Pedestrian Spawner' && !this.isDevMode) return;
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
      } else if (this.selectedPloppableType === 'Parking Meter') {
        // Parking Meter must be placed on a parking spot
        const cellData = this.gridManager.getCellData(gridX, gridY);
        if (!cellData?.ploppable || cellData.ploppable.type !== 'Parking Spot') {
          return; // Cannot place Parking Meter without Parking Spot
        }
        // Parking Meter can be placed even if cell already has a ploppable (Parking Spot)
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
          const cost = getPloppableCost('Security Camera');
          if (!GameSystems.economy.canAfford(cost)) {
            GameSystems.messages.addSystemMessage(`Can't afford Security Camera ($${cost}).`, '💰');
            return;
          }
          GameSystems.economy.spend(cost);
          // Remove Street Light's safety AoE (2 radius)
          SafetySystem.getInstance().applyPloppableAoE(streetLight, this.gridManager, this.gridWidth, this.gridHeight, true);
          
          // Create Security Camera ploppable
          const securityCamera: Ploppable = {
            id: `${this.selectedPloppableType}-${gridX}-${gridY}-${Date.now()}`,
            type: this.selectedPloppableType,
            x: gridX,
            y: gridY,
            cost,
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
      
      // Special handling for Parking Meter: place on parking spot with auto-orientation
      if (this.selectedPloppableType === 'Parking Meter') {
        const cellData = this.gridManager.getCellData(gridX, gridY);
        const parkingSpot = cellData?.ploppable;
        if (parkingSpot && parkingSpot.type === 'Parking Spot') {
          const cost = getPloppableCost('Parking Meter');
          if (!GameSystems.economy.canAfford(cost)) {
            GameSystems.messages.addSystemMessage(`Can't afford Parking Meter ($${cost}).`, '💰');
            return;
          }
          GameSystems.economy.spend(cost);
          // Auto-orient meter to the side OPPOSITE the parking spot's opening
          // Parking spot orientation: 0=missing left (edge 3), 1=missing bottom (edge 2), 2=missing top (edge 0), 3=missing right (edge 1)
          // Meter Type A orientation: 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
          // Correct mapping: spot 0 (opens left) -> meter 2 (bottom-right), spot 1 (opens bottom) -> meter 0 (top-left),
          //                  spot 2 (opens top) -> meter 1 (top-right), spot 3 (opens right) -> meter 3 (bottom-left)
          const spotOrientation = parkingSpot.orientation || 0;
          
          // User's hard mapping: cases 1=top left, 2=top right, 3=bottom right, 4=bottom left
          // Meters should be at: 3, 4, 1, 2 (opposite positions)
          // Mapping: orientation 0(case1) -> Type A 2, orientation 1(case4) -> Type A 1, 
          //          orientation 2(case2) -> Type A 3, orientation 3(case3) -> Type A 0
          const oppositeOrientationMap = [2, 1, 3, 0]; // Maps spot orientation [0,1,2,3] to meter Type A orientation
          const meterOrientation = oppositeOrientationMap[spotOrientation];
          
          // Create Parking Meter ploppable
          // Store the original parking spot orientation so GridRenderer can draw spot lines correctly
          const parkingMeter: Ploppable = {
            id: `${this.selectedPloppableType}-${gridX}-${gridY}-${Date.now()}`,
            type: this.selectedPloppableType,
            x: gridX,
            y: gridY,
            cost,
            orientation: meterOrientation,
            orientationType: 'A', // Type A orientation
            passable: passable,
            parkingSpotOrientation: spotOrientation // Store original spot orientation for drawing spot lines
          };
          
          // Place Parking Meter (can be on same cell as Parking Spot)
          // Note: This will need special handling in PloppableManager or we store both ploppables
          // For now, we'll just store the meter (replacing the spot visually, but keeping spot data)
          // Actually, we need both - the spot for parking logic, meter for fee collection
          // Let's store both by keeping the spot and adding meter metadata
          // Actually, looking at Security Camera pattern, it replaces the ploppable
          // But for Parking Meter, we want both to exist. Let's check if we can store multiple ploppables...
          // Looking at CellData, it only has one ploppable field. So we need a different approach.
          // We'll store the meter as the ploppable, but check for parking spot in VehicleSystem differently.
          // Actually wait - let's just store the meter and the parking spot data separately.
          // Or better: store the meter, and the parking spot functionality can check for both.
          // But for now, let's just store the meter (following Security Camera pattern)
          this.gridManager.setCellData(gridX, gridY, { ploppable: parkingMeter });
          
          // Redraw grid
          this.redrawGrid();
          
          // Remember last painted cell
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

      // Create ploppable
      const ploppable: Ploppable = {
        id: `${this.selectedPloppableType}-${gridX}-${gridY}-${Date.now()}`,
        type: this.selectedPloppableType,
        x: gridX,
        y: gridY,
        cost,
        orientation: this.ploppableOrientation,
        orientationType: orientationType,
        passable: passable
      };
      
      // For Parking Booth, set subType to BOOTH for the primary tile
      if (this.selectedPloppableType === 'Parking Booth') {
        ploppable.subType = 'BOOTH';
      }
      
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
      
      // Store the color and surface type in cell data
      const surfaceType = this.selectedColor !== null ? COLOR_TO_SURFACE[this.selectedColor] : undefined;
      this.gridManager.setCellData(gridX, gridY, { 
        color: this.selectedColor,
        surfaceType: surfaceType
      });
      
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
    } else if (this.selectedPloppableType === 'Parking Meter') {
      // Draw preview for Parking Meter (check if Parking Spot exists)
      const cellData = this.gridManager.getCellData(gridX, gridY);
      const hasParkingSpot = cellData?.ploppable?.type === 'Parking Spot';
      const highlightColor = hasParkingSpot ? 0x00ff00 : 0xff0000; // Green if valid, red if invalid
      
      this.highlightGraphics.lineStyle(1.5, highlightColor, 0.6);
      this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
      this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
      this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
      this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
      
      // Draw Type A position indicator (meter position) - on OPPOSITE side of opening
      const centerX = (offsetPoints[0].x + offsetPoints[2].x) / 2;
      const centerY = (offsetPoints[0].y + offsetPoints[2].y) / 2;
      if (hasParkingSpot && cellData?.ploppable) {
        // Use parking spot's orientation to determine meter position (opposite side)
        const parkingSpotOrientation = cellData.ploppable.orientation || 0;
        
        const oppositeOrientationMap = [2, 1, 3, 0]; // Maps spot orientation to opposite meter orientation (must match placement mapping)
        const meterOrientation = oppositeOrientationMap[parkingSpotOrientation];
        const indicatorPos = PloppableManager.getTypeAPosition(centerX, centerY, meterOrientation);
        
        this.highlightGraphics.fillStyle(0x00ff00, 0.8);
        this.highlightGraphics.fillCircle(indicatorPos.x, indicatorPos.y, 4);
      }
    } else if (this.selectedPloppableType === 'Parking Booth') {
      // Special preview for Parking Booth: booth emoji on primary, target emoji on collection
      const secondCell = PloppableManager.getSecondCellForTwoTile(gridX, gridY, this.ploppableOrientation, this.gridWidth, this.gridHeight);
      
      if (secondCell) {
        // Draw highlight for primary cell (booth)
        this.highlightGraphics.lineStyle(1.5, 0x00ff00, 0.6);
        this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
        this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
        this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
        this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
        
        // Draw highlight for second cell (collection)
        const secondPoints = getIsometricTilePoints(secondCell.x, secondCell.y);
        const secondOffsetPoints = secondPoints.map(p => ({
          x: p.x + this.gridOffsetX,
          y: p.y + this.gridOffsetY
        }));
        this.highlightGraphics.lineBetween(secondOffsetPoints[0].x, secondOffsetPoints[0].y, secondOffsetPoints[1].x, secondOffsetPoints[1].y);
        this.highlightGraphics.lineBetween(secondOffsetPoints[1].x, secondOffsetPoints[1].y, secondOffsetPoints[2].x, secondOffsetPoints[2].y);
        this.highlightGraphics.lineBetween(secondOffsetPoints[2].x, secondOffsetPoints[2].y, secondOffsetPoints[3].x, secondOffsetPoints[3].y);
        this.highlightGraphics.lineBetween(secondOffsetPoints[3].x, secondOffsetPoints[3].y, secondOffsetPoints[0].x, secondOffsetPoints[0].y);
        
        // Draw booth emoji preview on primary cell center (highlight only; emoji drawn when placed)
        // Draw target emoji preview on collection cell center (highlight only)
      } else {
        // Second cell is out of bounds, just draw primary cell in red
        this.highlightGraphics.lineStyle(1.5, 0xff0000, 0.6);
        this.highlightGraphics.lineBetween(offsetPoints[0].x, offsetPoints[0].y, offsetPoints[1].x, offsetPoints[1].y);
        this.highlightGraphics.lineBetween(offsetPoints[1].x, offsetPoints[1].y, offsetPoints[2].x, offsetPoints[2].y);
        this.highlightGraphics.lineBetween(offsetPoints[2].x, offsetPoints[2].y, offsetPoints[3].x, offsetPoints[3].y);
        this.highlightGraphics.lineBetween(offsetPoints[3].x, offsetPoints[3].y, offsetPoints[0].x, offsetPoints[0].y);
      }
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

  private setupRateInputHandler(): void {
    // Wait for DOM to be ready
    this.time.delayedCall(100, () => {
      const rateInput = document.getElementById('parking-rate-input') as HTMLInputElement;
      if (rateInput) {
        rateInput.addEventListener('change', () => {
          const rate = Math.max(1, Math.floor(parseFloat(rateInput.value) || 1));
          rateInput.value = rate.toString();
          ParkingTimerSystem.getInstance().setParkingRate(rate);
        });
      }
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
    const rateInputContainer = document.getElementById('selection-rate-input-container');
    const rateInput = document.getElementById('parking-rate-input') as HTMLInputElement;

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
              this.selectedPloppableType === 'Crosswalk' ||
              this.selectedPloppableType === 'Parking Booth') {
            instructions = 'Use Q and E keys to rotate orientation.';
          }
          if (this.selectedPloppableType === 'Security Camera') {
            instructions = 'Can only be placed on cells that already contain a Street Light.';
          }
          if (this.selectedPloppableType === 'Parking Meter') {
            instructions = 'Can only be placed on cells that already contain a Parking Spot.';
          }
        }
        selectionDescription.textContent = description;
        if (instructions) {
          selectionInstructions.textContent = instructions;
          selectionInstructions.style.display = 'block';
        } else {
          selectionInstructions.style.display = 'none';
        }
        
        // Show rate input for Parking Meter and Parking Booth
        if ((this.selectedPloppableType === 'Parking Meter' || this.selectedPloppableType === 'Parking Booth') && rateInputContainer && rateInput) {
          rateInputContainer.style.display = 'block';
          // Initialize with current rate
          const currentRate = ParkingTimerSystem.getInstance().getParkingRate();
          rateInput.value = currentRate.toString();
        } else if (rateInputContainer) {
          rateInputContainer.style.display = 'none';
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
      } else if (this.selectedPloppableType === 'Trash Can' || this.selectedPloppableType === 'Vending Machine' || this.selectedPloppableType === 'Dumpster' || this.selectedPloppableType === 'Portable Toilet' || this.selectedPloppableType === 'Street Light' || this.selectedPloppableType === 'Bench' || this.selectedPloppableType === 'Speed Bump' || this.selectedPloppableType === 'Crosswalk' || this.selectedPloppableType === 'Parking Booth') {
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
    const obj = JSON.parse(serialized) as Record<string, unknown>;
    obj.vehicleSpawnerPairs = this.vehicleSystem.getSpawnerDespawnerPairs().map(
      p => [p.spawnerX, p.spawnerY, p.despawnerX, p.despawnerY]
    );
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
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
      let pairs: Array<[number, number, number, number]> | undefined;
      try {
        const data = JSON.parse(content) as { vehicleSpawnerPairs?: Array<[number, number, number, number]> };
        pairs = data.vehicleSpawnerPairs;
      } catch {
        // Old or malformed file; rebuild will use nearest-neighbor
      }
      const success = this.gridManager.deserializeGrid(content);
      if (success) {
        SpawnerManager.rebuildSpawnerPairsFromGrid(
          this.gridManager,
          this.gridWidth,
          this.gridHeight,
          this.vehicleSystem,
          this.pedestrianSystem,
          pairs
        );
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
      const removedCost = cellData.ploppable.cost ?? getPloppableCost(ploppableType);
      const refund = Math.floor(removedCost * DEMOLISH_REFUND_FRACTION);
      if (refund > 0) {
        GameSystems.economy.earn(refund);
      }

      // Special handling for Security Camera: restore Street Light when removed
      if (ploppableType === 'Security Camera') {
        // Remove Security Camera's safety AoE (8 radius)
        PloppableManager.removePloppable(gridX, gridY, this.gridManager, this.gridWidth, this.gridHeight);
        
        // Restore Street Light with default orientation (no spend - restoring)
        const streetLight: Ploppable = {
          id: `Street Light-${gridX}-${gridY}-${Date.now()}`,
          type: 'Street Light',
          x: gridX,
          y: gridY,
          cost: getPloppableCost('Street Light'),
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
