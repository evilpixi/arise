import Phaser from "phaser";
import HexMath from "./HexMath";
import type { WorldPoint, HexagonConfig } from "./HexTypes";

export default class HexDraws
{
  private math: HexMath;

  public constructor(math: HexMath)
  {
    this.math = math;
  }

  public drawHexagon(scene: Phaser.Scene, x: number, y: number, config: HexagonConfig = {})
  {
    const center = {x: x, y: y};
    const color = config.color ?? 0xffffff;
    const isFlat = this.math.orientation == "flat";
    const filled = config.filled ?? true;
    const size = this.math.size;
    const borderThickness = config.borderThickness ?? 0;
    const points = this.math.getAllCorners({ 
      x: isFlat ? size : Math.sqrt(3) * size / 2, 
      y: isFlat ? Math.sqrt(3) * size / 2 : size, 
    }).map(p => 
      new Phaser.Math.Vector2(p.x, p.y)
    );

    const hexagon = new Phaser.GameObjects.Polygon(
      scene, 
      center.x, 
      center.y, 
      points, 
      color, 
      filled ? 1 : 0
    );

    if (borderThickness > 0) {
      hexagon.setStrokeStyle(borderThickness, 0x000000);
    }

    scene.add.existing(hexagon);

    return hexagon;
  }
}