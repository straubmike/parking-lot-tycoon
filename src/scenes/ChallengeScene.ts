import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { BaseGameplayScene } from '@/core/BaseGameplayScene';
import { GameSystems } from '@/core/GameSystems';
import { SpawnerManager } from '@/managers/SpawnerManager';
import { GridManager } from '@/core/GridManager';
import { ParkingTimerSystem } from '@/systems/ParkingTimerSystem';
import { getChallengeById, getSpawnIntervalMsForSchedule } from '@/config/challenges.config';
import { setParkingRateConfig } from '@/config/parkingRateConfig';
import { ChallengeSystem } from '@/systems/ChallengeSystem';
import { completeChallenge } from '@/managers/ProgressManager';
import { LeaderboardSystem } from '@/systems/LeaderboardSystem';
import { TimeSystem } from '@/systems/TimeSystem';
import * as ChallengeOverlays from '@/scenes/ChallengeOverlays';
import { getChallengeBehavior } from '@/scenes/challengeBehaviors';
import type { ChallengeBehavior, ChallengeBehaviorContext } from '@/scenes/challengeBehaviors';
import { GridEditorController, type GridEditorContext } from '@/scenes/ChallengeSceneTools';

export class ChallengeScene extends BaseGameplayScene implements ChallengeBehaviorContext, GridEditorContext {
  protected challengeId!: string;
  protected isDevMode!: boolean;

  private initialBudget: number = 0;
  private challengeSystem: ChallengeSystem | null = null;
  private gameOverState: 'playing' | 'won' | 'lost' = 'playing';
  private lastWinMetrics: { profit: number; rating: number; currentDay: number } | null = null;
  private challengeBehavior: ChallengeBehavior | null = null;
  private tools!: GridEditorController;

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

    const parkingTimer = ParkingTimerSystem.getInstance();
    const meterThreshold = challenge?.meterHighParkingRateThreshold ?? challenge?.highParkingRateThreshold ?? 5;
    const meterPenalty = challenge?.meterHighParkingRatePenaltyPerDollar ?? challenge?.highParkingRatePenaltyPerDollar ?? 10;
    const boothThreshold = challenge?.boothHighParkingRateThreshold ?? challenge?.highParkingRateThreshold ?? 5;
    const boothPenalty = challenge?.boothHighParkingRatePenaltyPerDollar ?? challenge?.highParkingRatePenaltyPerDollar ?? 10;
    const meterRefusal = challenge?.meterRefusalToParkThreshold ?? 10;
    const boothRefusal = challenge?.boothRefusalToParkThreshold ?? 10;
    if (challenge) {
      parkingTimer.setMeterHighRatePenalty(meterThreshold, meterPenalty);
      parkingTimer.setBoothHighRatePenalty(boothThreshold, boothPenalty);
      setParkingRateConfig({
        meterThreshold,
        boothThreshold,
        meterPenalty,
        boothPenalty,
        meterRefusalThreshold: meterRefusal,
        boothRefusalThreshold: boothRefusal,
        penaltyMessage: challenge.highParkingRatePenaltyMessage ?? "I can't believe they're charging this much to park! 😤",
        refusalMessage: challenge.refusalToParkMessage ?? "There's no way I'm paying that much to park. 😤",
        meterRefusalMessage: challenge.meterRefusalToParkMessage ?? null,
        boothRefusalMessage: challenge.boothRefusalToParkMessage ?? null,
      });
    }

    this.tools = new GridEditorController(this);
    this.tools.init();

    if (this.isDevMode) {
      this.tools.setDevOnlyToolsVisibility(true);
      GameSystems.rating.setDebugLogParkerFinalization(true);
    } else {
      this.tools.setDevOnlyToolsVisibility(false);
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
            this.challengeBehavior = getChallengeBehavior(this.challengeId, this);
            if (this.challengeBehavior) this.challengeBehavior.start(this);
          }
        } catch {
          console.warn('Failed to parse initial grid from', challenge.initialGridPath);
        }
      })
      .catch(() => {
        console.warn('Failed to load initial grid from', challenge.initialGridPath);
      });
    } else if (this.challengeId === 'learning-lot' && !this.isDevMode) {
      this.time.delayedCall(400, () => {
        this.challengeBehavior = getChallengeBehavior(this.challengeId, this);
        if (this.challengeBehavior) this.challengeBehavior.start(this);
      });
    }

    this.time.delayedCall(100, () => {
      document.getElementById('back-to-menu-button')?.addEventListener('click', () => {
        this.scene.start('MainMenuScene');
      });
    });
  }

  update(time: number, delta: number): void {
    const scaledDelta = GameSystems.time.getScaledDelta(delta);
    if (this.challengeBehavior?.isActive()) {
      this.challengeBehavior.update(scaledDelta);
    }
    this.tools.updatePointer(this.input.activePointer);
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
    super.update(time, delta);
    // After clock update: consume rating-finalized flag (set at 11:59 PM) and show win/lose overlay
    if (GameSystems.time.consumeRatingFinalized()) {
      const metrics = this.gatherChallengeMetrics();
      const maxDay = getChallengeById(this.challengeId)?.maxDay ?? 5;
      const displayedDay = (GameSystems.time.getCurrentDay() ?? 0) + 1;
      if (this.challengeSystem.checkWinConditions(metrics)) {
        this.gameOverState = 'won';
        completeChallenge(this.challengeId);
        this.lastWinMetrics = {
          profit: metrics.profit ?? 0,
          rating: metrics.rating ?? 0,
          currentDay: metrics.currentDay ?? 0,
        };
        this.showWinOverlay();
      } else if (displayedDay >= maxDay) {
        this.gameOverState = 'lost';
        this.showTimeUpOverlay();
      }
    }
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
    if (!container) return;
    ChallengeOverlays.showWinOverlay(
      container,
      () => this.goToMenu(),
      () => this.retry(),
      () => this.submitAndGoToLeaderboard()
    );
  }

  private showLoseOverlay(): void {
    const container = document.getElementById('app-container');
    if (!container) return;
    ChallengeOverlays.showLoseOverlay(container, () => this.goToMenu(), () => this.retry());
  }

  private showTimeUpOverlay(): void {
    const container = document.getElementById('app-container');
    if (!container) return;
    const maxDay = getChallengeById(this.challengeId)?.maxDay ?? 5;
    ChallengeOverlays.showTimeUpOverlay(container, maxDay, () => this.goToMenu(), () => this.retry());
  }

  private goToMenu(): void {
    this.scene.start('MainMenuScene');
  }

  private retry(): void {
    const challenge = getChallengeById(this.challengeId);
    const gridWidth = challenge?.lotSize?.width ?? 10;
    const gridHeight = challenge?.lotSize?.height ?? 10;
    this.scene.start('ChallengeScene', { challengeId: this.challengeId, gridWidth, gridHeight });
  }

  private submitAndGoToLeaderboard(): void {
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

  redrawGrid(): void {
    this.render();
  }

  /** Exposed for ChallengeBehaviorContext (Learning Lot tutorial). */
  screenX(gx: number, gy: number): number {
    return (gx - gy) * (TILE_WIDTH / 2) + this.gridOffsetX;
  }

  /** Exposed for ChallengeBehaviorContext (Learning Lot tutorial). */
  screenY(gx: number, gy: number): number {
    return (gx + gy) * (TILE_HEIGHT / 2) + this.gridOffsetY;
  }

  getGridOffsetX(): number {
    return this.gridOffsetX;
  }

  getGridOffsetY(): number {
    return this.gridOffsetY;
  }

  getGridWidth(): number {
    return this.gridWidth;
  }

  getGridHeight(): number {
    return this.gridHeight;
  }

  getTimeSystem(): { setPaused(paused: boolean): void } {
    return GameSystems.time;
  }

  getVehicleSystem(): import('@/systems/VehicleSystem').VehicleSystem {
    return this.vehicleSystem;
  }

  getGridManager(): GridManager {
    return this.gridManager;
  }

  getHighlightGraphics(): Phaser.GameObjects.Graphics {
    return this.highlightGraphics;
  }

  getPedestrianSystem(): import('@/systems/PedestrianSystem').PedestrianSystem {
    return this.pedestrianSystem;
  }

  getIsDevMode(): boolean {
    return this.isDevMode;
  }

  getCamera(): Phaser.Cameras.Scene2D.Camera {
    return this.cameras.main;
  }

  getInput(): Phaser.Input.InputPlugin {
    return this.input;
  }

  getTime(): Phaser.Time.Clock {
    return this.time;
  }

  getAdd(): { graphics(): Phaser.GameObjects.Graphics } {
    return this.add;
  }

  /**
   * Override render to add appeal/safety visualization overlay
   */
  protected render(): void {
    super.render();
    if (this.tools && (this.tools.getShowAppealVisualization() || this.tools.getShowSafetyVisualization())) {
      this.tools.renderVisualization();
    }
  }

  resizeGrid(newWidth: number, newHeight: number): void {
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
