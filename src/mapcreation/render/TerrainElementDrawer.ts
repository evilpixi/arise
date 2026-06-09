import type Phaser from 'phaser';
import type HexMath from '../../hex/HexMath';
import type { TileCoords, WorldPoint } from '../../hex/HexTypes';
import type { MapData, MapTile } from '../MapTypes';

// ---- Element fill/stroke colors (drawn on top of the biome base tile) ------

/** Dark ridge brown, contrasts mountain tile background. */
const MOUNTAIN_COLOR = 0x3d2510;
/** Dry straw yellow for savanna grass blades. */
const SAVANNA_COLOR  = 0x9c8520;
/** Rolling-hill green for grassland arcs. */
const HILLS_COLOR    = 0x4d7a28;
/** Dark conifer green for tundra pine triangles. */
const TUNDRA_COLOR   = 0x2a5e20;
/** Muted forest green for forest canopies. */
const FOREST_COLOR   = 0x3a6a28;
/** Vivid tropical green for jungle canopies. */
const JUNGLE_COLOR   = 0x1a9040;

// ---- Size constants (multiplied by hexMath.size at draw time) ---------------

const MTN_PEAK_Y     = -0.82; // peak height above tile center
const MTN_BASE_Y     =  0.45; // base height below tile center
const MTN_BASE_HALF  =  0.62; // half-width of triangle base

const SAV_BLADE_H    =  0.45; // blade height (in size units)
const SAV_BASE_Y     =  0.42; // blade bottom offset (below center)
const SAV_OFFSETS    = [-0.38, -0.15, 0.12, 0.38]; // x spread (4 blades)

const HILL_RADIUS    =  0.38; // arc radius
const HILL_CENTER_Y  =  0.30; // arc center below tile center
const HILL_SPREAD    =  0.28; // ± x offset between the two arcs

const PINE_PEAK_Y    = -0.65; // pine peak above tile center
const PINE_BASE_Y    =  0.42; // pine base below tile center
const PINE_HALF_W    =  0.20; // half-width of pine triangle
const PINE_SPREAD    =  0.30; // ± x offset between the two pines

const TREE_TRUNK_TOP  =  0.08; // trunk top offset below center
const TREE_TRUNK_BASE =  0.45; // trunk base offset below center
const TREE_CANOPY_Y   = -0.12; // canopy center above tile center
const TREE_CANOPY_R   =  0.26; // canopy radius
const TREE_SPREAD     =  0.28; // ± x offset between forest trees

const JUNGLE_TRUNK_TOP  =  0.05;
const JUNGLE_TRUNK_BASE =  0.45;
const JUNGLE_CANOPY_Y   = -0.18;
const JUNGLE_CANOPY_R   =  0.30;
const JUNGLE_SPREAD     =  0.38; // ± x offset; three trees (-spread, 0, +spread)

/**
 * Draws biome-specific decorative elements on top of hex tile base colors.
 *
 * Uses a **single shared** `Phaser.GameObjects.Graphics` object for all
 * elements; the caller creates it, passes it to `draw`, and is responsible
 * for its lifecycle (destroying it during a map refresh).
 *
 * All dimensions are proportional to `hexMath.size`, so elements scale
 * automatically when the tile size changes (e.g., from 8 px to 32 px).
 *
 * Biome coverage:
 * - `mountain`  → one large brown triangle (peak silhouette)
 * - `savanna`   → four short vertical grass blades
 * - `grassland` → two arcs suggesting rolling hills
 * - `tundra`    → two thin tall triangles (pine silhouettes)
 * - `forest`    → two trees: trunk line + filled circle canopy (muted green)
 * - `jungle`    → three denser trees: trunk line + canopy (vivid green)
 *
 * All other biomes (ocean, glacier, plains, swamp, desert) show only the
 * base tile fill color with no overlay.
 */
export default class TerrainElementDrawer {
  private readonly hexMath: HexMath;
  private readonly origin: WorldPoint;

  constructor(hexMath: HexMath, origin: WorldPoint) {
    this.hexMath = hexMath;
    this.origin = origin;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Draw all terrain elements for every tile in `map` onto `graphics`.
   * Call this after the base tile hexagons have been drawn so the elements
   * appear on top of them.
   *
   * @param graphics The single shared graphics object to draw into.
   * @param map The map data to draw elements for.
   */
  public draw(
    graphics: Phaser.GameObjects.Graphics,
    map: MapData
  ): void {
    map.grid.forEachTile((tile, coords) => {
      const pos = this.worldPos(coords);
      this.drawElement(graphics, tile, pos);
    });
  }

  // --------------------------------------------------------------------------
  // Routing
  // --------------------------------------------------------------------------

  private worldPos(coords: TileCoords): WorldPoint {
    const w = this.hexMath.tileToWorld(coords);
    return { x: this.origin.x + w.x, y: this.origin.y + w.y };
  }

  private drawElement(
    g: Phaser.GameObjects.Graphics,
    tile: MapTile,
    pos: WorldPoint
  ): void {
    const { x, y } = pos;
    const s = this.hexMath.size; // base unit — all sizes scale with this

    switch (tile.biome) {
      case 'mountain':  this.drawMountain(g, x, y, s); break;
      case 'savanna':   this.drawSavanna(g, x, y, s);  break;
      case 'grassland': this.drawHills(g, x, y, s);    break;
      case 'tundra':    this.drawTundra(g, x, y, s);   break;
      case 'forest':    this.drawForest(g, x, y, s);   break;
      case 'jungle':    this.drawJungle(g, x, y, s);   break;
      // ocean, glacier, plains, swamp, desert → no overlay element
    }
  }

  // --------------------------------------------------------------------------
  // Element drawers
  // --------------------------------------------------------------------------

  /**
   * One large filled triangle with a sharp mountain-ridge profile.
   *
   *        *         ← peak at (x, y + MTN_PEAK_Y * s)
   *       / \
   *      /   \
   *     /     \
   *    *-------*     ← base at y + MTN_BASE_Y * s
   */
  private drawMountain(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    g.fillStyle(MOUNTAIN_COLOR, 0.85);
    g.fillTriangle(
      x,                   y + MTN_PEAK_Y  * s,
      x - MTN_BASE_HALF * s, y + MTN_BASE_Y * s,
      x + MTN_BASE_HALF * s, y + MTN_BASE_Y * s
    );
  }

  /**
   * Four short vertical lines simulating dry grass blades spread across the
   * tile.  Blade height and spacing are proportional to `s`.
   */
  private drawSavanna(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    const bladeH  = SAV_BLADE_H * s;
    const bottomY = y + SAV_BASE_Y * s;
    const lineW   = Math.max(1, s * 0.1);

    g.lineStyle(lineW, SAVANNA_COLOR, 0.9);

    for (const dx of SAV_OFFSETS) {
      const cx = x + dx * s;
      g.lineBetween(cx, bottomY, cx, bottomY - bladeH);
    }
  }

  /**
   * Two upper-half arcs placed side by side to suggest rolling hills on the
   * horizon.
   *
   * Arc direction: from angle π (left) to 0 (right), going anticlockwise in
   * canvas space — this traces the TOP half of the circle, which appears as
   * a hill silhouette above the arc center.
   */
  private drawHills(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    const r       = HILL_RADIUS   * s;
    const centerY = y + HILL_CENTER_Y * s;
    const lineW   = Math.max(1, s * 0.12);

    g.lineStyle(lineW, HILLS_COLOR, 0.85);

    for (const dx of [-HILL_SPREAD, HILL_SPREAD]) {
      g.beginPath();
      // anticlockwise = true → upper arc (hill silhouette)
      g.arc(x + dx * s, centerY, r, Math.PI, 0, true);
      g.strokePath();
    }
  }

  /**
   * Two thin tall filled triangles evoking conifer/pine silhouettes, typical
   * of cold tundra tree-lines.
   */
  private drawTundra(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    g.fillStyle(TUNDRA_COLOR, 0.9);

    for (const dx of [-PINE_SPREAD, PINE_SPREAD]) {
      const cx = x + dx * s;
      g.fillTriangle(
        cx,                    y + PINE_PEAK_Y  * s,
        cx - PINE_HALF_W * s,  y + PINE_BASE_Y  * s,
        cx + PINE_HALF_W * s,  y + PINE_BASE_Y  * s
      );
    }
  }

  /**
   * Two trees made of a thin trunk (vertical line) topped by a filled circle
   * canopy.  Muted green palette suggests a temperate, shaded woodland.
   */
  private drawForest(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    const trunkBase = y + TREE_TRUNK_BASE * s;
    const trunkTop  = y + TREE_TRUNK_TOP  * s;
    const canopyY   = y + TREE_CANOPY_Y   * s;
    const canopyR   = TREE_CANOPY_R * s;
    const lineW     = Math.max(1, s * 0.1);

    g.lineStyle(lineW, FOREST_COLOR, 1);
    g.fillStyle(FOREST_COLOR, 0.9);

    for (const dx of [-TREE_SPREAD, TREE_SPREAD]) {
      const cx = x + dx * s;
      g.lineBetween(cx, trunkBase, cx, trunkTop);
      g.fillCircle(cx, canopyY, canopyR);
    }
  }

  /**
   * Three denser trees with the same trunk+circle shape as forest but with a
   * vivid tropical green and a tighter horizontal spread to evoke a thick
   * jungle canopy.
   */
  private drawJungle(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    const trunkBase = y + JUNGLE_TRUNK_BASE * s;
    const trunkTop  = y + JUNGLE_TRUNK_TOP  * s;
    const canopyY   = y + JUNGLE_CANOPY_Y   * s;
    const canopyR   = JUNGLE_CANOPY_R * s;
    const lineW     = Math.max(1, s * 0.1);

    g.lineStyle(lineW, JUNGLE_COLOR, 1);
    g.fillStyle(JUNGLE_COLOR, 0.9);

    for (const dx of [-JUNGLE_SPREAD, 0, JUNGLE_SPREAD]) {
      const cx = x + dx * s;
      g.lineBetween(cx, trunkBase, cx, trunkTop);
      g.fillCircle(cx, canopyY, canopyR);
    }
  }
}
