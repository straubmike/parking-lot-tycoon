import { Game } from './core/Game';
import { DevModeScene } from './scenes/DevModeScene';
import { ChallengeScene } from './scenes/ChallengeScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';

// Initialize the game
const game = new Game();

// Add scenes to Phaser (they're registered but will be started manually)
const phaserGame = game.getPhaserGame();
phaserGame.scene.add('DevModeScene', DevModeScene);
phaserGame.scene.add('ChallengeScene', ChallengeScene);
phaserGame.scene.add('LeaderboardScene', LeaderboardScene);

// Start with the dev mode scene
phaserGame.scene.start('DevModeScene');

