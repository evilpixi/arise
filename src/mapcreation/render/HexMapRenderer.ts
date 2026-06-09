import Phaser from 'phaser';
import type HexGrid from '../../hex/HexGrid';
import HexDraws from '../../hex/HexDraws';
import type HexMath from '../../hex/HexMath';
import type { TileCoords, WorldPoint } from '../../hex/HexTypes';
import { getBiomeColor, RIVER_COLOR } from '../BiomePalette';
import type { MapData, MapTile } from '../MapTypes';
import type { MapRenderer } from './MapRenderer';
import TerrainElementDrawer from './TerrainElementDrawer';

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
 * with biome-specific terrain elements drawn on top (see `TerrainElementDrawer`)
 * and rivers overlaid as a connected line through every river tile.
 *
 * `hexMath` controls tile size/orientation, so the same renderer shape can
 * back both a full map view and a smaller minimap by handing it a `HexMath`
 * configured with a smaller `size`.
 *
 * Render order (back to front):
 *   1. Biome fill hexagons
 *   2. Terrain element overlays (mountains, trees, grass, hills…)
 *   3. River line strokes
 *
 * Tile hover events are opt-in: call `setTileHoverCallbacks` before (or after)
 * the first `render` call.  If callbacks are registered, every tile hexagon
 * is made interactive and fires `onEnter` / `onLeave` on pointer entry/exit.
 * If no callbacks are registered, tiles are not interactive and Phaser skips
 * all hit-testing for them — zero overhead.
 */
export default class HexMapRenderer implements MapRenderer {
  private readonly hexMath: HexMath;
  private readonly hexDraw: HexDraws;
  private readonly origin: WorldPoint;
  private readonly elementDrawer: TerrainElementDrawer;
  private objects: Phaser.GameObjects.GameObject[] = [];

  // ---- optional tile-hover callbacks (undefined = no interactivity)
  private tileEnterCb?: (tile: MapTile) => void;
  private tileLeaveCb?: () => void;

  constructor(hexMath: HexMath, origin?: WorldPoint) {
    this.hexMath = hexMath;
    this.hexDraw = new HexDraws(hexMath);
    this.origin = origin ?? defaultOrigin(hexMath);
    this.elementDrawer = new TerrainElementDrawer(hexMath, this.origin);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  public render(scene: Phaser.Scene, map: MapData): void {
    this.clear();
    this.drawTiles(scene, map);
    this.drawTerrainElements(scene, map);
    this.drawRivers(scene, map);
  }

  public clear(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects = [];
  }

  /**
   * Register callbacks for tile pointer events.
   * Must be called before `render` (or the next `render` call) for the tiles
   * created during that render to be interactive.
   *
   * Phaser.GameObjects.Shape subclasses (which Polygon is) automatically use
   * their own geometry for hit testing when `setInteractive()` is called
   * without arguments — no manual hit-area setup required.
   *
   * Non-interactive objects (Graphics layers above the tiles) are transparent
   * to input, so pointer events always reach the tile polygon below.
   *
   * @param onEnter Called with the tile when the pointer enters a tile hexagon.
   * @param onLeave Called when the pointer leaves a tile hexagon.
   */
  public setTileHoverCallbacks(
    onEnter: (tile: MapTile) => void,
    onLeave: () => void
  ): void {
    this.tileEnterCb = onEnter;
    this.tileLeaveCb = onLeave;
  }

  // --------------------------------------------------------------------------
  // Private draw steps
  // --------------------------------------------------------------------------

  private worldPosition(coords: TileCoords): WorldPoint {
    const world = this.hexMath.tileToWorld(coords);
    return { x: this.origin.x + world.x, y: this.origin.y + world.y };
  }

  private drawTiles(scene: Phaser.Scene, map: MapData): void {
    map.grid.forEachTile((tile, coords) => {
      const { x, y } = this.worldPosition(coords);
      const polygon = this.hexDraw.drawHexagon(scene, x, y, {
        filled: true,
        color: getBiomeColor(tile.biome),
        borderThickness: 0.2,
      });

      if (this.tileEnterCb) {
        // GameObjects.Shape.setInteractive() — no args — uses the shape's own
        // geometry (Phaser.Geom.Polygon) for precise hex hit testing.
        polygon.setInteractive();
        polygon.on('pointerover', () => this.tileEnterCb!(tile));
        polygon.on('pointerout',  () => this.tileLeaveCb?.());
      }

      this.objects.push(polygon);
    });
  }

  /**
   * Draw biome-specific decorative elements (mountains, trees, grass blades,
   * hills, pines) over the base tile colors using a single Graphics object.
   * Graphics objects are NOT interactive by default, so they don't block
   * pointer events from reaching the tile polygons below.
   */
  private drawTerrainElements(scene: Phaser.Scene, map: MapData): void {
    const graphics = scene.add.graphics();
    this.elementDrawer.draw(graphics, map);
    this.objects.push(graphics);
  }

  /**
   * Rivers are drawn as a single connected line rather than a tinted tile:
   * every river tile is linked to its river-flagged neighbors with a stroke
   * a quarter of a tile wide (`hexMath.width / 4`), so waterways read as
   * flowing lines that cut across the terrain underneath them.
   */
  private drawRivers(scene: Phaser.Scene, map: MapData): void {
    const graphics = scene.add.graphics();
    graphics.lineStyle(this.hexMath.width / 4, RIVER_COLOR, 1);

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
  private riverNeighborsOf(
    grid: HexGrid<MapTile>,
    coords: TileCoords
  ): TileCoords[] {
    return this.hexMath.getNeighbors(coords)
      .map((axial) => this.hexMath.axialToOffset(axial))
      .filter((neighbor) => grid.getTile(neighbor)?.isRiver === true);
  }
}
