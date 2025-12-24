import Phaser from 'phaser';
import { GAME_CONFIG } from '@/config/game.config';

export class Game {
  private phaserGame: Phaser.Game;

  constructor() {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: GAME_CONFIG.width,
      height: GAME_CONFIG.height,
      backgroundColor: GAME_CONFIG.backgroundColor,
      parent: 'game-container',
      scene: [], // Scenes will be added here
      scale: {
        mode: Phaser.Scale.NONE,
        width: GAME_CONFIG.width,
        height: GAME_CONFIG.height,
      },
    };

    this.phaserGame = new Phaser.Game(config);
    
    // Canvas size is now fixed and won't resize with window
  }

  public getPhaserGame(): Phaser.Game {
    return this.phaserGame;
  }
}

