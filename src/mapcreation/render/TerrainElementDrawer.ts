import type Phaser from 'phaser';
import type HexMath from '../../hex/HexMath';
import type { TileCoords, WorldPoint } from '../../hex/HexTypes';
import type { MapData, MapTile } from '../MapTypes';

// ---- Element fill/stroke colors (drawn on top of the biome base tile) ------

/** Dark ridge brown, contrasts mountain tile background. */
const MOUNTAIN_COLOR      = 0x3d2510;
/** Dry straw yellow for savanna grass blades. */
const SAVANNA_COLOR       = 0x9c8520;
/** Rolling-hill green for grassland arcs. */
const HILLS_COLOR         = 0x4d7a28;
/** Dark conifer green for tundra pine triangles. */
const TUNDRA_COLOR        = 0x2a5e20;
/** Muted forest green for forest canopies. */
const FOREST_COLOR        = 0x3a6a28;
/** Vivid tropical green for jungle canopies. */
const JUNGLE_COLOR        = 0x06451a;
/** Sky-blue / celeste stripes for swamp tiles. */
const SWAMP_STRIPE_COLOR  = 0x7ecfe8;

// ---- Size constants (multiplied by hexMath.size at draw time) ---------------

const MTN_PEAK_Y     = -0.82; // peak height above tile center
const MTN_BASE_Y     =  0.45; // base height below tile center
const MTN_BASE_HALF  =  0.62; // half-width of triangle base

const SAV_BLADE_H    =  0.45; // blade height (in size units)
const SAV_BASE_Y     =  0.42; // blade bottom offset (below center)
const SAV_OFFSETS    = [-0.38, -0.15, 0.12, 0.38]; // x spread (4 blades)

/**
 * Hills use three arcs: two side arcs slightly below center and one central
 * arc above them.
 *
 * Layout (in units of s, positive Y is down):
 *
 *           *            ← central arc apex  (y + HILL_TOP_Y - HILL_RADIUS)
 *          / \
 *    *    /   \    *     ← side arc apexes   (y + HILL_SIDE_Y - HILL_RADIUS)
 *   / \  /     \  / \
 *  /   \/       \/   \
 *
 * HILL_SPREAD must be ≥ HILL_RADIUS so side arcs never intersect.
 */
const HILL_RADIUS   = 0.26; // arc radius — reduced for finer look
const HILL_SIDE_Y   = 0.36; // side-arc centers below tile center
const HILL_TOP_Y    = -0.18; // central-arc center (higher than side arcs)
const HILL_SPREAD   = 0.4; // ± x offset; > HILL_RADIUS guarantees no overlap

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
const JUNGLE_SPREAD     =  0.48; // ± x offset; three trees (-spread, 0, +spread)
const JUNGLE_MIDOFF_Y   =  0.60;

/**
 * Vertical Y offsets (in units of s) for the four swamp stripes.
 * Two stripes are in the parallel zone (|dy| ≤ 0.5) and two in the
 * tapering zone (|dy| > 0.5) of the pointy-top hexagon.
 */
const SWAMP_STRIPE_DYS = [-0.32, -0.10, 0.12, 0.34];

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
 * - `grassland` → three arcs suggesting rolling hills
 *                 (two low side arcs + one higher central arc)
 * - `tundra`    → two thin tall triangles (pine silhouettes)
 * - `forest`    → two trees: trunk line + filled circle canopy (muted green)
 * - `jungle`    → three denser trees: trunk line + canopy (vivid green)
 * - `swamp`     → four horizontal sky-blue stripes (water shimmer)
 *
 * All other biomes (ocean, glacier, plains, desert) show only the
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

  /**
   * Draw only the mountain triangle symbol for every `mountain` biome tile.
   * Used in data-layer view modes (elevation, humidity, temperature) where
   * the full terrain overlay would obscure the gradient color information,
   * but the mountain silhouette is still useful as a geographical reference.
   *
   * @param graphics The single shared graphics object to draw into.
   * @param map The map data to draw elements for.
   */
  public drawMountainsOnly(
    graphics: Phaser.GameObjects.Graphics,
    map: MapData
  ): void {
    map.grid.forEachTile((tile, coords) => {
      if (tile.biome !== 'mountain') return;
      const { x, y } = this.worldPos(coords);
      this.drawMountain(graphics, x, y, this.hexMath.size);
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
      case 'swamp':     this.drawSwamp(g, x, y, s);    break;
      // ocean, glacier, plains, desert → no overlay element
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
      x,                     y + MTN_PEAK_Y  * s,
      x - MTN_BASE_HALF * s, y + MTN_BASE_Y  * s,
      x + MTN_BASE_HALF * s, y + MTN_BASE_Y  * s
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
   * Three upper arcs suggesting layered rolling hills on the horizon.
   *
   * Two side arcs sit lower on the tile; a narrower central arc rises above
   * them to create a sense of depth.  All three arcs go from angle π (left)
   * to 0 (right) in the clockwise direction so the arc bulges upward
   * (hill silhouette).
   *
   * Arc geometry (anticlockwise=false in canvas/Y-down space):
   *   π → 3π/2 → 2π=0  ≡  left → top → right  (upper half circle)
   *
   * Side arc centers: (x ± HILL_SPREAD·s, y + HILL_SIDE_Y·s)
   * Central arc center: (x, y + HILL_TOP_Y·s) — higher than side arcs.
   *
   * HILL_SPREAD > HILL_RADIUS ensures the two side arcs never touch.
   */
  private drawHills(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    const r      = HILL_RADIUS * s;
    const lineW  = Math.max(1, s * 0.07); // thinner than before

    g.lineStyle(lineW, HILLS_COLOR, 0.85);

    // Two side arcs (lower)
    const sideY = y + HILL_SIDE_Y * s;
    for (const dx of [-HILL_SPREAD, HILL_SPREAD]) {
      g.beginPath();
      // anticlockwise=false → clockwise in Y-down screen → upper arc (hill)
      g.arc(x + dx * s, sideY, r, Math.PI, 0, false);
      g.strokePath();
    }

    // Central arc (higher)
    const topY = y + HILL_TOP_Y * s;
    g.beginPath();
    g.arc(x, topY, r, Math.PI, 0, false);
    g.strokePath();
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
      const baseOff = dx == 0 ? JUNGLE_MIDOFF_Y * (trunkTop - trunkBase): 0;
      const cx = x + dx * s;
      g.lineBetween(cx, trunkBase + baseOff, cx, trunkTop + baseOff);
      g.fillCircle(cx, canopyY + baseOff, canopyR);
    }
  }

  /**
   * Four horizontal sky-blue stripes across the hex tile to evoke standing
   * water / marsh shimmer typical of swampland.
   *
   * The pointy-top hexagon has:
   *   - A **parallel zone** for |dy| ≤ 0.5·s (constant half-width = √3/2·s)
   *   - A **tapering zone** for 0.5·s < |dy| ≤ s (linearly shrinking width)
   *
   * Each stripe is clipped to ≈88 % of the theoretical hex width at that
   * y-level so it stays visually inside the tile border.
   */
  private drawSwamp(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, s: number
  ): void {
    const lineW  = Math.max(1, s * 0.08);
    const margin = 0.88; // stay inside hex border
    // sqrt(3)/2 ≈ 0.866 — half-width at the equator of a pointy-top hex
    const maxHW  = 0.866 * s;

    g.lineStyle(lineW, SWAMP_STRIPE_COLOR, 0.55);

    for (const dy of SWAMP_STRIPE_DYS) {
      const py  = y + dy * s;
      const ady = Math.abs(dy);
      // Parallel zone: constant full width.
      // Tapering zone: width scales linearly from full to 0 as dy → 1.
      const hw = ady <= 0.5
        ? maxHW * margin
        : maxHW * 2 * (1 - ady) * margin;
      g.lineBetween(x - hw, py, x + hw, py);
    }
  }
}
