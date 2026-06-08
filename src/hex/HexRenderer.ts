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
}
