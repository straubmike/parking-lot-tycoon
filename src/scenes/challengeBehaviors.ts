/**
 * Challenge-specific behavior hook. Only some challenges supply a behavior (e.g. Learning Lot tutorial).
 * Others (Pizza Parking, Rush Hour, Dev Mode, etc.) return null.
 */

import Phaser from 'phaser';
import { LearningLotTutorial } from './LearningLotTutorial';

export interface ChallengeBehavior {
  start(context: ChallengeBehaviorContext): void;
  update(delta: number): void;
  isActive(): boolean;
}

/** Context passed to behaviors; implemented by ChallengeScene. */
export interface ChallengeBehaviorContext {
  getGridOffsetX(): number;
  getGridOffsetY(): number;
  getGridWidth(): number;
  getGridHeight(): number;
  screenX(gx: number, gy: number): number;
  screenY(gx: number, gy: number): number;
  add: { graphics(): Phaser.GameObjects.Graphics };
  getTimeSystem(): { setPaused(paused: boolean): void };
  getVehicleSystem(): { setSpawnPaused(paused: boolean): void };
}

/**
 * Return the challenge-specific behavior for the given challenge id, or null.
 * Only 'learning-lot' currently has a registered behavior.
 */
export function getChallengeBehavior(
  challengeId: string,
  context: ChallengeBehaviorContext
): ChallengeBehavior | null {
  if (challengeId === 'learning-lot') {
    return new LearningLotTutorial();
  }
  return null;
}
