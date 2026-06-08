import Phaser from "phaser";
import type HexGrid from "../../hex/HexGrid";
import HexDraws from "../../hex/HexDraws";
import type HexMath from "../../hex/HexMath";
import type { TileCoords, WorldPoint } from "../../hex/HexTypes";
import { getBiomeColor, RIVER_COLOR } from "../BiomePalette";
import type { MapData, MapTile } from "../MapTypes";
import type { MapRenderer } from "./MapRenderer";

/**
 * Half a tile in each axis — the default world-space offset so the grid
 * isn't anchored flush against its origin corner (matches the padding the
 * map drawing loop used before it was extracted here).
 */
function defaultOrigin(hexMath: HexMath): WorldPoint {
  return { x: hexMath.width / 2, y: hexMath.height / 2 };
}

/**
 * Draws a `MapData` grid as filled hexagons colored by biome (`BiomePalette`),
 * with rivers overlaid as a connected line through every river tile.
 *
 * `hexMath` controls tile size/orientation, so the same renderer shape can
 * back both a full map view and a smaller minimap by handing it a `HexMath`
 * configured with a smaller `size`.
 */
export default class HexMapRenderer implements MapRenderer {
  private readonly hexMath: HexMath;
  private readonly hexDraw: HexDraws;
  private readonly origin: WorldPoint;
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(hexMath: HexMath, origin?: WorldPoint) {
    this.hexMath = hexMath;
    this.hexDraw = new HexDraws(hexMath);
    this.origin = origin ?? defaultOrigin(hexMath);
  }

  public render(scene: Phaser.Scene, map: MapData): void {
    this.clear();
    this.drawTiles(scene, map);
    this.drawRivers(scene, map);
  }

  public clear(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects = [];
  }

  private worldPosition(coords: TileCoords): WorldPoint {
    const world = this.hexMath.tileToWorld(coords);
    return { x: this.origin.x + world.x, y: this.origin.y + world.y };
  }

  private drawTiles(scene: Phaser.Scene, map: MapData): void {
    map.grid.forEachTile((tile, coords) => {
      const { x, y } = this.worldPosition(coords);
      this.objects.push(this.hexDraw.drawHexagon(scene, x, y, {
        filled: true,
        color: getBiomeColor(tile.biome),
        borderThickness: 0.2,
      }));
    });
  }

  /**
   * Rivers are drawn as a single connected line rather than a tinted tile:
   * every river tile is linked to its river-flagged neighbors with a stroke
   * half a tile wide (`hexMath.width / 2`), so waterways read as flowing
   * lines that cut across the terrain underneath them.
   */
  private drawRivers(scene: Phaser.Scene, map: MapData): void {
    const graphics = scene.add.graphics();
    graphics.lineStyle(this.hexMath.width / 2, RIVER_COLOR, 1);

    map.grid.forEachTile((tile, coords) => {
      if (!tile.isRiver) return;

      const from = this.worldPosition(coords);
      for (const neighbor of this.riverNeighborsOf(map.grid, coords)) {
        const to = this.worldPosition(neighbor);
        graphics.lineBetween(from.x, from.y, to.x, to.y);
      }
    });

    this.objects.push(graphics);
  }

  /** In-bounds neighbors of `coords` that are themselves river tiles. */
  private riverNeighborsOf(grid: HexGrid<MapTile>, coords: TileCoords): TileCoords[] {
    return this.hexMath.getNeighbors(coords)
      .map((axial) => this.hexMath.axialToOffset(axial))
      .filter((neighbor) => grid.getTile(neighbor)?.isRiver === true);
  }
}
