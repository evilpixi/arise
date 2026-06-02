import Phaser from 'phaser';
import HexGrid from './HexGrid';
import HexMath from './HexMath';
import type { TileCoords } from './HexTypes';

export default class HexRenderer {
  public static drawHexGrid(
    graphics: Phaser.GameObjects.Graphics,
    grid: HexGrid<number>,
    math: HexMath,
    getColor: (value: number) => number,
  ) {
    graphics.clear();

    grid.forEachTile((value, coords) => {
      HexRenderer.drawHexTile(graphics, coords, value, math, getColor);
    });
  }

  public static drawHexTile(
    graphics: Phaser.GameObjects.Graphics,
    coords: TileCoords,
    value: number,
    math: HexMath,
    getColor: (value: number) => number,
  ) {
    const center = math.tileToWorld(coords);
    const points = math.getAllCorners(center).map((point) => new Phaser.Math.Vector2(point.x, point.y));

    graphics.fillStyle(getColor(value), 1);
    graphics.fillPoints(points, true);

    graphics.lineStyle(1, 0x000000, 0.35);
    graphics.strokePoints(points, true);
  }

  public static getColorForValue(value: number, seaLevel = 0.33): number {
    if (value < seaLevel) {
      // Deep and shallow water
      return (value / seaLevel) < 0.5 ? 0x002a55 : 0x0c3e70;
    }

    // Remap land: [seaLevel, 1] → [0, 1]
    const t = (value - seaLevel) / (1 - seaLevel);
    const landPalette = [
      0x7fbf74, // lowland green
      0xb7d472, // plains
      0xe2c96d, // hills
      0xc28e59, // high hills / foothills
      0x8d6d4d, // low mountain
      0xd6d6d6, // mountain peak / snow
    ];

    const index = Math.min(landPalette.length - 1, Math.floor(t * landPalette.length));
    return landPalette[index];
  }
}
