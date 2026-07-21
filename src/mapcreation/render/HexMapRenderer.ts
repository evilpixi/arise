import Phaser from 'phaser';
import type HexGrid from '../../hex/HexGrid';
import HexDraws from '../../hex/HexDraws';
import type HexMath from '../../hex/HexMath';
import type { TileCoords, WorldPoint } from '../../hex/HexTypes';
import {
  getBiomeColor,
  getElevationColor,
  getMoistureColor,
  getTemperatureColor,
  RIVER_COLOR,
} from '../BiomePalette';
import type { MapData, MapTile, MapViewMode } from '../MapTypes';
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
 * Draws a `MapData` grid as filled hexagons whose fill color is driven by the
 * active `MapViewMode`:
 *
 *  - `'biome'`       — standard biome palette (`BiomePalette`), with terrain
 *                      element overlays (trees, mountains…) on top.
 *  - `'elevation'`   — physical-map gradient (deep ocean → snow peaks).
 *  - `'humidity'`    — moisture gradient (arid tan → saturated dark-blue).
 *  - `'temperature'` — thermal gradient (frozen cyan → scorching red).
 *
 * Terrain element overlays are only drawn in `'biome'` mode; they would
 * obscure data-layer colors in the other modes.  Rivers are always drawn.
 *
 * `hexMath` controls tile size/orientation, so the same renderer instance can
 * back both a full map view and a minimap by using a smaller `size`.
 *
 * Render order (back to front):
 *   1. Tile fill hexagons (color driven by `viewMode`)
 *   2. Terrain element overlays  ← biome mode only
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

  // ---- current view mode (defaults to full biome view)
  private viewMode: MapViewMode = 'biome';

  // ---- cached scene + map so setViewMode() can re-render without args
  private lastScene?: Phaser.Scene;
  private lastMap?: MapData;

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
    // Cache for setViewMode() re-renders triggered without external args.
    this.lastScene = scene;
    this.lastMap   = map;

    this.clear();
    this.drawTiles(scene, map);
    // Biome mode: full terrain overlays. Other modes: mountains only,
    // so the silhouette remains as a geographic reference without
    // obscuring the gradient color data.
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
   * Switch the active data layer and immediately re-render the last map.
   * Has no effect if `render` has never been called.
   *
   * @param mode The view mode to activate.
   */
  public setViewMode(mode: MapViewMode): void {
    this.viewMode = mode;
    if (this.lastScene && this.lastMap) {
      this.render(this.lastScene, this.lastMap);
    }
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

  /**
   * Pick the hex fill color for a tile based on the active view mode.
   *
   * - `'biome'`       → standard biome palette.
   * - `'elevation'`   → two-range physical-map gradient: ocean tiles are
   *                     normalized within [0, seaLevel] (water sub-gradient);
   *                     land tiles within [seaLevel, 1] (land sub-gradient).
   *                     This prevents colour bleed regardless of seaLevel.
   * - `'humidity'`    → moisture gradient on land only; ocean tiles use the
   *                     fixed biome ocean color (humidity data is land-only).
   * - `'temperature'` → thermal gradient on land only; same ocean override.
   */
  private getTileColor(tile: MapTile): number {
    const isOcean = tile.biome === 'ocean';

    switch (this.viewMode) {
      case 'elevation': {
        // lastMap is always set when drawTiles is called (set in render()).
        const seaLevel = this.lastMap!.seaLevel;
        return getElevationColor(tile.elevation, seaLevel, isOcean);
      }

      case 'humidity':
        // Ocean tiles carry no meaningful moisture data — keep them dark blue.
        if (isOcean) return getBiomeColor('ocean');
        return getMoistureColor(tile.moisture);

      case 'temperature':
        // Same ocean override: temperature gradient is for land only.
        if (isOcean) return getBiomeColor('ocean');
        return getTemperatureColor(tile.temperature);

      default:
        return getBiomeColor(tile.biome);
    }
  }

  private drawTiles(scene: Phaser.Scene, map: MapData): void {
    map.grid.forEachTile((tile, coords) => {
      const { x, y } = this.worldPosition(coords);
      const polygon = this.hexDraw.drawHexagon(scene, x, y, {
        filled: true,
        color: this.getTileColor(tile),
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
   * Draw terrain element overlays using a single Graphics object.
   *
   * - Biome mode: full overlay set (mountains, trees, grass, hills, pines).
   * - Data-layer modes: mountain triangles only, so geographic peaks remain
   *   identifiable without obscuring the gradient color underneath.
   *
   * Graphics objects are NOT interactive by default, so they don't block
   * pointer events from reaching the tile polygons below.
   */
  private drawTerrainElements(scene: Phaser.Scene, map: MapData): void {
    const graphics = scene.add.graphics();
    if (this.viewMode === 'biome') {
      this.elementDrawer.draw(graphics, map);
    } else {
      this.elementDrawer.drawMountainsOnly(graphics, map);
    }
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
