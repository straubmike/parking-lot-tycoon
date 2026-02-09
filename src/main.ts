import { Game } from './core/Game';
import { MainMenuScene } from './scenes/MainMenuScene';
import { DevModeScene } from './scenes/DevModeScene';
import { ChallengeScene } from './scenes/ChallengeScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';

// Initialize the game
const game = new Game();

// Add scenes to Phaser (they're registered but will be started manually)
const phaserGame = game.getPhaserGame();
phaserGame.scene.add('MainMenuScene', MainMenuScene);
phaserGame.scene.add('DevModeScene', DevModeScene);
phaserGame.scene.add('ChallengeScene', ChallengeScene);
phaserGame.scene.add('LeaderboardScene', LeaderboardScene);

// Start with the main menu
phaserGame.scene.start('MainMenuScene');

