import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { PreloadScene } from './scenes/PreloadScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { TestScene } from './scenes/TestScene.ts';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1920,
  height: 1080,
  backgroundColor: '#1a1a2e',
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, GameScene, TestScene],
};

new Phaser.Game(config);

// Full page reload on save so Phaser restarts cleanly (Vite HMR alone can leave stale state).
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    globalThis.location?.reload();
  });
}
