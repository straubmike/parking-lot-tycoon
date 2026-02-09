import Phaser from 'phaser';

/**
 * DevModeScene - Launcher that starts ChallengeScene with dev-mode data.
 * Keeps the "Dev Mode" menu entry working; actual gameplay runs in ChallengeScene.
 */
export class DevModeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DevModeScene' });
  }

  create(): void {
    this.scene.start('ChallengeScene', {
      challengeId: 'dev-mode',
      isDevMode: true,
      gridWidth: 10,
      gridHeight: 10,
    });
  }
}
