# MapRender

Turns `MapData` into Phaser game objects: biome-colored hexagons, biome-specific
terrain element overlays, and river lines.

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
                         Optional tile hover callbacks via setTileHoverCallbacks.

TerrainElementDrawer.ts  Draws biome-specific decorative shapes on top of tile
                         fills using a single shared Phaser.GameObjects.Graphics.
```

### Render layers (back to front)

```
1. Biome fill hexagons      HexDraws.drawHexagon() per tile — BiomePalette color.
2. Terrain element overlays TerrainElementDrawer.draw()     — one Graphics object.
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

| Biome       | Shape                                    | Colors              |
|-------------|------------------------------------------|---------------------|
| `mountain`  | One large filled triangle (peak up)      | `0x3d2510` (dark brown) |
| `savanna`   | Four short vertical lines (grass blades) | `0x9c8520` (straw)  |
| `grassland` | Two upper-half arcs (rolling hills)      | `0x4d7a28` (hill green) |
| `tundra`    | Two thin tall triangles (pine silhouettes)| `0x2a5e20` (dark conifer) |
| `forest`    | Two trees: trunk line + circle canopy    | `0x3a6a28` (muted green) |
| `jungle`    | Three denser trees: trunk + canopy       | `0x1a9040` (vivid green) |
| others      | *(no overlay — base fill only)*          | —                   |

### Hill arc direction

Phaser Graphics follows the HTML Canvas angle convention: 0 = right (3 o'clock),
angles increase **clockwise** in screen space (Y axis is down).

To draw a hill silhouette (arc that appears *above* the center point):

```
g.arc(cx, cy, r, Math.PI, 0, true);  // anticlockwise = true → upper arc
```

- `Math.PI` → left (9 o'clock) as start
- `0` → right (3 o'clock) as end
- `anticlockwise = true` → goes left → top → right (upper half = hill shape)

Setting `anticlockwise = false` would trace the *lower* half (a valley), which
is the wrong direction.

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

## Swapping the renderer

Because `HexMapRenderer` only depends on `MapData` and a `HexMath`, a minimap
renderer can be built by handing a `HexMath` configured with a smaller `size`
to a new instance — no generation code needs to change.  Alternatively, a
fully different `MapRenderer` implementation (e.g. a sprite-based one) can
replace it without touching the generation pipeline.
