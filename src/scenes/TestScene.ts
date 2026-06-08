import Phaser from 'phaser';
import HexMath from '../hex/HexMath';
import HexDraws from '../hex/HexDraws';
import GameSession from '../game/GameSession';
import WorldMapGenerator from '../mapcreation/WorldMapGenerator';
import { getTileColor } from '../mapcreation/BiomePalette';

const size = 16;

export class TestScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TestScene' });
  }

  create(): void {
    this.drawDebugGrid();
    const hexMath = new HexMath({ size: size, orientation: "pointy", offset: "odd" });
    const hexDraw = new HexDraws(hexMath);

    const session = new GameSession(
      new WorldMapGenerator(),
      {
        mapWidth: 16 * 4,
        mapHeight: 10 * 4,
        noise: {
          frequency: 0.06,
          octaves: 5,
          persistence: 0.15,
          lacunarity: 4.8,
        },
        island: {
          shape: "continents",
          seaLevel: 0.2,
        },
      }
    );

    console.log(session)

    const offsetX = size * Math.sqrt(3) / 2;
    const offsetY = size;

    session.map.grid.forEachTile((tile, coords) => {
      const world = hexMath.tileToWorld(coords);
      const x = offsetX + world.x;
      const y = offsetY + world.y;

      hexDraw.drawHexagon(this,
        x,
        y,
        {
          filled: true,
          color: getTileColor(tile),
          borderThickness: 0.2,
        });
    });

    // panoramic
    let isPanoramicMoving = false
    let panStart = {x: 0, y: 0}

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer)=> {
      isPanoramicMoving = true;
      panStart.x = this.cameras.main.scrollX;
      panStart.y = this.cameras.main.scrollY;
    })
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer)=> {
      if (!isPanoramicMoving) return;
      const zoomFactor = 1// / this.cameras.main.zoom;
      this.cameras.main.scrollX = panStart.x - (pointer.x - pointer.downX) * zoomFactor;
      this.cameras.main.scrollY = panStart.y - (pointer.y - pointer.downY) * zoomFactor;
    })
    this.input.on("pointerup", () => {
      isPanoramicMoving = false;
    })

    this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any, deltaX: number, deltaY: number, deltaZ: number) => {
      const camera = this.cameras.main;
      const minZoom = 0.5;
      const maxZoom = 2.5;
      const zoomStep = 0.1;

      const zoomDirection = deltaY < 0 ? zoomStep : -zoomStep;
      camera.zoom = Phaser.Math.Clamp(camera.zoom + zoomDirection, minZoom, maxZoom);
      camera.zoom = Phaser.Math.Clamp(camera.zoom + zoomDirection, minZoom, maxZoom);
    });
    
  }

  drawDebugGrid()
  {
    const graphics = this.add.graphics();

    // Grid configuration
    const width = Number(this.sys.game.config.width);
    const height = Number(this.sys.game.config.height);
    const size = 128;
    const subdivision = size / 2; // Secondary lines every 64px

    // 1. Draw subdivisions (thinner or more transparent lines)
    graphics.lineStyle(1, 0x444444, 0.5); 
    
    for (let x = 0; x < width; x += subdivision) {
        graphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += subdivision) {
        graphics.lineBetween(0, y, width, y);
    }

    // 2. Draw primary guide lines (every 128px)
    graphics.lineStyle(2, 0x00ff00, 0.8); // Green color for emphasis
    
    for (let x = 0; x < width; x += size) {
        graphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += size) {
        graphics.lineBetween(0, y, width, y);
    }

    graphics.setAlpha(0.4)
  }
}
