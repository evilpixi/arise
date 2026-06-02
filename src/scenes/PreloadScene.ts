import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    
  }

  create(): void {
    this.scene.start('GameScene');
  }
}
