# MapRender

Turns `MapData` into Phaser game objects: hexagons colored by the active data
layer, optional biome-specific terrain element overlays, and river lines.

## Purpose

The render module sits between the map-generation pipeline and the screen.
It only ever reads a `MapData` value (a `HexGrid<MapTile>` plus seed and sea
level); it knows nothing about *how* that map was produced, so the same
renderer works for procedurally generated worlds and hand-authored static maps
alike.

## Architecture

```
MapRenderer.ts           Strategy interface — any class that consumes MapData
                         and a Phaser.Scene and knows how to draw + clear itself.

HexMapRenderer.ts        Concrete implementation used by TestScene.
                         Draws in three ordered layers (see below).
                         Supports four view modes via setViewMode().
                         Optional tile hover callbacks via setTileHoverCallbacks.

TerrainElementDrawer.ts  Draws biome-specific decorative shapes on top of tile
                         fills using a single shared Phaser.GameObjects.Graphics.
```

### View modes (`MapViewMode`)

`HexMapRenderer` supports four data-layer visualizations, switchable at runtime
via `setViewMode(mode)` without regenerating the map:

| Mode          | Tile color driven by    | Notes |
|---------------|-------------------------|-------|
| `'biome'`     | Biome type              | Full terrain overlays (trees, hills, pines, mountains) |
| `'elevation'` | Raw elevation [0, 1]    | Physical map gradient; water stops are very dark for contrast |
| `'humidity'`  | Raw moisture [0, 1]     | Ocean tiles always use the fixed biome ocean color (data only meaningful on land) |
| `'temperature'` | Raw temperature [0, 1] | Same ocean override as humidity |

Terrain element overlays behave differently per mode:

- **Biome mode** — full overlay set (mountains, trees, grass blades, hill arcs, pines, swamp stripes).
- **Data-layer modes** — **mountain triangles only** via `TerrainElementDrawer.drawMountainsOnly()`.
  This keeps geographic peaks identifiable as a reference without obscuring gradient colors.

Rivers are rendered in every mode.

Switching modes re-renders the last drawn map immediately (the renderer caches
the last `scene` and `MapData` passed to `render()`).

### Render layers (back to front)

```
1. Tile fill hexagons       HexDraws.drawHexagon() per tile — color from active mode.
2. Terrain element overlays TerrainElementDrawer.draw()     — biome mode only.
3. River lines              lineBetween() per river pair    — one Graphics object.
```

All game objects created in a render pass are tracked in `HexMapRenderer.objects[]`
so that a subsequent `render()` or `clear()` call destroys them before drawing
again. This is what makes "regenerate the map" instant without leaking objects.

## TerrainElementDrawer

Draws biome-specific decorative shapes at every tile center.

### Algorithm overview

For every tile the drawer is called with `(graphics, tile, worldPos)`.  A
`switch` on `tile.biome` routes to a private drawing method. All coordinates
are expressed as multiples of `hexMath.size` (the tile radius), so every shape
scales proportionally when the tile size changes.

### Element catalogue

| Biome       | Shape                                             | Colors              |
|-------------|---------------------------------------------------|---------------------|
| `mountain`  | One large filled triangle (peak up)               | `0x3d2510` (dark brown) |
| `savanna`   | Four short vertical lines (grass blades)          | `0x9c8520` (straw)  |
| `grassland` | Three upper arcs: two side (lower) + one central (higher) | `0x4d7a28` (hill green) |
| `tundra`    | Two thin tall triangles (pine silhouettes)        | `0x2a5e20` (dark conifer) |
| `forest`    | Two trees: trunk line + circle canopy             | `0x3a6a28` (muted green) |
| `jungle`    | Three denser trees: trunk + canopy                | `0x1a9040` (vivid green) |
| `swamp`     | Four horizontal sky-blue stripes (water shimmer)  | `0x7ecfe8` (sky blue, α 0.55) |
| others      | *(no overlay — base fill only)*                   | —                   |

### Hill arc direction

Phaser Graphics follows the HTML Canvas angle convention: 0 = right (3 o'clock),
angles increase **clockwise** in screen space (Y axis is down).

To draw a hill silhouette (arc that appears *above* the center point):

```
g.arc(cx, cy, r, Math.PI, 0, false);  // anticlockwise = false → upper arc
```

- `Math.PI` → left (9 o'clock) as start
- `0` → right (3 o'clock) as end
- `anticlockwise = false` → clockwise direction in Y-down space →
  goes left → **top** → right (upper half = hill silhouette ✓)

Setting `anticlockwise = true` traces the *lower* half (a valley / bowl shape),
which is the wrong direction.

### Hill arc layout (three arcs)

Grassland uses three arcs to suggest layered hills with depth:

```
          *            ← central arc apex  (HILL_TOP_Y − HILL_RADIUS)
         / \
   *    /   \    *     ← side arc apexes   (HILL_SIDE_Y − HILL_RADIUS)
  / \  /     \  / \
```

- **Side arcs**: centers at `x ± HILL_SPREAD·s`, `y + HILL_SIDE_Y·s`
- **Central arc**: center at `x`, `y + HILL_TOP_Y·s` — visually above the sides
- `HILL_SPREAD > HILL_RADIUS` guarantees the two side arcs never intersect
- Line width is `s * 0.07` (thinner than previous `s * 0.12`) for a cleaner look

### Swamp stripes

Swamp tiles show four horizontal sky-blue lines (`0x7ecfe8`, α 0.55) evenly
spread across the tile to suggest standing water / marsh shimmer.

Width of each stripe respects the pointy-top hex geometry:
- **Parallel zone** (`|dy| ≤ 0.5·s`): constant half-width `√3/2·s`
- **Tapering zone** (`|dy| > 0.5·s`): half-width `= √3/2·s · 2·(1 − |dy|/s)`

An 88 % margin factor keeps all stripes visually inside the tile border.

### Single Graphics object

The drawer receives a `Phaser.GameObjects.Graphics` created by `HexMapRenderer`
rather than creating one itself.  This keeps lifecycle management in one place:
the renderer creates, tracks and destroys the object; the drawer only writes to
it.  The same single object handles all biomes — color changes between shapes
are just `fillStyle()`/`lineStyle()` state calls, which is perfectly valid on a
shared Graphics instance.

## River rendering

Rivers are drawn as connected line strokes:

- Line width: `hexMath.width / 4` (a quarter-tile wide — half of the previous width).
- Color: `RIVER_COLOR` from `BiomePalette`.
- Each `isRiver` tile is connected to every `isRiver` neighbor with
  `lineBetween(center_A, center_B)`.

Halving the line width relative to the original value makes rivers clearly
visible without competing visually with the terrain element overlays drawn in
the layer below.

## Tile hover interactivity

`HexMapRenderer` supports optional tile hover events via:

```typescript
renderer.setTileHoverCallbacks(
  (tile: MapTile) => infoPanel.showTile(tile),
  ()              => infoPanel.hide()
);
```

When callbacks are registered:
- Every tile hexagon Polygon is made interactive with `setInteractive()`.
  `GameObjects.Shape` subclasses (Polygon included) automatically use their
  own geometry for precise hit testing — no manual hit-area setup needed.
- `pointerover` fires `onEnter(tile)` when the pointer enters the hexagon.
- `pointerout`  fires `onLeave()` when it exits.

When **no** callbacks are registered (default), tiles are not interactive and
Phaser skips all hit-testing — zero overhead.

Graphics objects (terrain elements, rivers) drawn above the tiles are never
interactive, so they don't block pointer events from reaching the polygons below.

See `src/scenes/TileInfoPanel.ts` for the HTML overlay that consumes these
callbacks in `TestScene`.

## Color gradients (`BiomePalette`)

The three data-layer color functions use a **multi-stop linear gradient**
algorithm (`sampleGradient`):

1. The value `t ∈ [0, 1]` is clamped and then located between two adjacent
   `ColorStop` entries `[t0, c0]` and `[t1, c1]`.
2. A local `t_local = (t - t0) / (t1 - t0)` is computed and fed into
   `lerpColor`, which linearly interpolates each RGB channel independently.
3. The result is reassembled into a 24-bit hex integer (Phaser's color format).

### Elevation palette stops (physical map convention)

Water stops are intentionally near-black to maximise contrast with the bright
land colors (greens, yellows, browns).

| Position | Color     | Terrain              |
|----------|-----------|----------------------|
| 0.00     | `#000d1f` | Deep ocean (near-black) |
| 0.30     | `#001a3d` | Ocean (very dark navy)  |
| 0.48     | `#003070` | Shallow water (dark blue) |
| 0.52     | `#d4c06a` | Coast / sand         |
| 0.62     | `#90c060` | Lowlands             |
| 0.72     | `#c8a040` | Hills                |
| 0.82     | `#8b6030` | Highlands            |
| 0.92     | `#808080` | High mountains       |
| 1.00     | `#ffffff` | Peaks / snow         |

## Swapping the renderer

Because `HexMapRenderer` only depends on `MapData` and a `HexMath`, a minimap
renderer can be built by handing a `HexMath` configured with a smaller `size`
to a new instance — no generation code needs to change.  Alternatively, a
fully different `MapRenderer` implementation (e.g. a sprite-based one) can
replace it without touching the generation pipeline.
