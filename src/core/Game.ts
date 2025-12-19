import Phaser from 'phaser';
import { GAME_CONFIG } from '@/config/game.config';

export class Game {
  private phaserGame: Phaser.Game;

  constructor() {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: GAME_CONFIG.backgroundColor,
      parent: 'game-container',
      scene: [], // Scenes will be added here
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };

    this.phaserGame = new Phaser.Game(config);
    
    // Handle window resize
    window.addEventListener('resize', () => {
      this.phaserGame.scale.resize(window.innerWidth, window.innerHeight);
    });
  }

  public getPhaserGame(): Phaser.Game {
    return this.phaserGame;
  }
}

