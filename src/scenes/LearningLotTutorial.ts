import Phaser from 'phaser';
import { getIsometricTilePoints } from '@/utils/isometric';
import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';
import { GameSystems } from '@/core/GameSystems';
import type { ChallengeBehavior, ChallengeBehaviorContext } from '@/scenes/challengeBehaviors';

export type TutorialHighlightType = 'none' | 'playable' | 'road' | 'lane_line' | 'curb';

const LEARNING_LOT_TUTORIAL_STEPS: { text: string; highlight: TutorialHighlightType }[] = [
  { text: 'Welcome to Parking Lot Tycoon! Your goal is to design a parking lot that meets each challenge\'s win conditions.', highlight: 'none' },
  { text: 'This is the playable area. You can edit these tiles to design the lot.', highlight: 'playable' },
  { text: 'This is the road access. You cannot edit these tiles (or the sidewalks on the grid border).', highlight: 'road' },
  { text: 'This is a lane line. Cars prefer to stay on the right and avoid crossing lane lines when possible.', highlight: 'lane_line' },
  { text: 'This is a curb. Cars cannot pass over them, so remember to delete them where necessary.', highlight: 'curb' },
  { text: 'Try designing a lot with a rating of 50 and at least three parking spots before the end of day 3. You have $5000 to play with. Once achieved, you\'ll unlock the Pizza Parking Problem!', highlight: 'none' },
];

export class LearningLotTutorial implements ChallengeBehavior {
  private active = false;
  private stepIndex = 0;
  private blinkVisible = true;
  private blinkAccum = 0;
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private leftPanelOverlay: HTMLElement | null = null;
  private context: ChallengeBehaviorContext | null = null;

  start(context: ChallengeBehaviorContext): void {
    this.context = context;
    context.getTimeSystem().setPaused(true);
    context.getVehicleSystem().setSpawnPaused(true);
    this.active = true;
    this.stepIndex = 0;
    this.blinkVisible = true;
    this.blinkAccum = 0;
    this.highlightGraphics = context.add.graphics();
    this.highlightGraphics.setDepth(5);

    const leftPanel = document.getElementById('left-panel');
    if (leftPanel) {
      this.leftPanelOverlay = document.createElement('div');
      this.leftPanelOverlay.style.cssText = 'position:absolute;inset:0;z-index:20;background:transparent;';
      this.leftPanelOverlay.style.pointerEvents = 'auto';
      leftPanel.appendChild(this.leftPanelOverlay);
    }

    this.setSpeedButtonsEnabled(false);

    const step = LEARNING_LOT_TUTORIAL_STEPS[0];
    GameSystems.messages.showTutorialStep(step.text, () => this.advance());
  }

  update(delta: number): void {
    if (!this.active || !this.context) return;
    this.blinkAccum += delta;
    if (this.blinkAccum >= 500) {
      this.blinkAccum = 0;
      this.blinkVisible = !this.blinkVisible;
    }
    const step = LEARNING_LOT_TUTORIAL_STEPS[this.stepIndex];
    if (step) this.drawTutorialHighlight(step.highlight);
  }

  isActive(): boolean {
    return this.active;
  }

  private advance(): void {
    this.stepIndex++;
    if (this.stepIndex >= LEARNING_LOT_TUTORIAL_STEPS.length) {
      this.active = false;
      this.setSpeedButtonsEnabled(true);
      if (this.context) {
        this.context.getTimeSystem().setPaused(false);
        this.context.getVehicleSystem().setSpawnPaused(false);
      }
      this.leftPanelOverlay?.remove();
      this.leftPanelOverlay = null;
      const leftPanel = document.getElementById('left-panel');
      if (leftPanel) leftPanel.style.position = '';
      if (this.highlightGraphics) {
        this.highlightGraphics.clear();
        this.highlightGraphics.setVisible(false);
      }
      GameSystems.messages.hideTutorialStep();
      this.context = null;
      return;
    }
    const step = LEARNING_LOT_TUTORIAL_STEPS[this.stepIndex];
    GameSystems.messages.showTutorialStep(step.text, () => this.advance());
  }

  private setSpeedButtonsEnabled(enabled: boolean): void {
    const ids = ['speed-pause', 'speed-1x', 'speed-2x', 'speed-4x'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el instanceof HTMLButtonElement) {
        el.disabled = !enabled;
      }
    });
  }

  private drawTutorialHighlight(type: TutorialHighlightType): void {
    const g = this.highlightGraphics;
    const ctx = this.context;
    if (!g || !ctx) return;
    g.clear();
    if (type === 'none') {
      g.setVisible(false);
      return;
    }
    g.setVisible(this.blinkVisible);
    const ox = ctx.getGridOffsetX();
    const oy = ctx.getGridOffsetY();
    g.lineStyle(4, 0x00bfff, 0.9);

    if (type === 'playable') {
      const path: { x: number; y: number }[] = [];
      for (let x = 0; x <= 9; x++) path.push({ x: ctx.screenX(x, 0) + 0, y: ctx.screenY(x, 0) - TILE_HEIGHT / 2 });
      for (let y = 0; y <= 9; y++) path.push({ x: ctx.screenX(9, y) + TILE_WIDTH / 2, y: ctx.screenY(9, y) + 0 });
      for (let x = 9; x >= 0; x--) path.push({ x: ctx.screenX(x, 9) + 0, y: ctx.screenY(x, 9) + TILE_HEIGHT / 2 });
      for (let y = 9; y >= 0; y--) path.push({ x: ctx.screenX(0, y) - TILE_WIDTH / 2, y: ctx.screenY(0, y) + 0 });
      g.beginPath();
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.closePath();
      g.strokePath();
    } else if (type === 'road') {
      const path: { x: number; y: number }[] = [];
      for (let x = 0; x <= 9; x++) path.push({ x: ctx.screenX(x, 10) + 0, y: ctx.screenY(x, 10) - TILE_HEIGHT / 2 });
      for (let y = 10; y <= 11; y++) path.push({ x: ctx.screenX(9, y) + TILE_WIDTH / 2, y: ctx.screenY(9, y) + 0 });
      for (let x = 9; x >= 0; x--) path.push({ x: ctx.screenX(x, 11) + 0, y: ctx.screenY(x, 11) + TILE_HEIGHT / 2 });
      for (let y = 11; y >= 10; y--) path.push({ x: ctx.screenX(0, y) - TILE_WIDTH / 2, y: ctx.screenY(0, y) + 0 });
      g.beginPath();
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.closePath();
      g.strokePath();
    } else if (type === 'lane_line') {
      for (let x = 0; x <= 9; x++) {
        const points = getIsometricTilePoints(x, 10);
        const startX = points[2].x + ox;
        const startY = points[2].y + oy;
        const endX = points[3].x + ox;
        const endY = points[3].y + oy;
        g.lineBetween(startX, startY, endX, endY);
      }
    } else if (type === 'curb') {
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
}
