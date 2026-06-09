# Maps (Static Map Sources)

Hand-authored `MapData` values and the loader that serves them through the
standard `IMapGenerator` interface.

## Purpose

The procedural pipeline (`WorldMapGenerator`) is great for large, varied worlds,
but some use cases require **fixed, repeatable map data**:

- Design/QA maps that guarantee every biome appears exactly once.
- Scenario maps tied to story beats or gameplay scripts.
- Test fixtures for unit tests that need a known grid state.

`StaticMapLoader` fulfills these needs without requiring any renderer or scene
changes — it implements `IMapGenerator`, so it slots directly into the existing
`GameSession` constructor.

## Architecture

```
StaticMapLoader.ts      IMapGenerator wrapper around a pre-built MapData.
                        generate() ignores its MapConfig argument and returns
                        the fixed data it was constructed with.

maps/
  SampleMap.ts          Hand-authored 5 × 3 grid covering all 11 biomes.
                        Exported as getSampleMap() → MapData.
  Maps.doc.md           (this file)
```

## StaticMapLoader

```typescript
const loader = new StaticMapLoader(someMapData);
const session = new GameSession(loader, { mapWidth: 5, mapHeight: 3, seed: 0 });
renderer.render(scene, session.map); // renders the static map
```

Because `StaticMapLoader` implements `IMapGenerator`, passing it to
`GameSession` follows exactly the same code path as `WorldMapGenerator`.
The renderer never knows the difference.

## SampleMap

A compact 5 × 3 tile grid that contains every biome at least once, intended
for visual review of terrain element rendering.

### Layout

```
col →   0          1         2          3           4
row 0:  ocean    glacier   mountain  tundra ★    plains ★
row 1:  grassland forest    swamp     desert ★   savanna
row 2:  jungle    ocean    mountain   tundra      desert
```

★ = `isRiver: true`

### River connectivity

The three river tiles form a small **Y-junction**:

```
(3,0) tundra ──┬── (4,0) plains
               │
           (3,1) desert
```

All three tiles are mutually adjacent in the pointy odd-offset hex grid, so
the river renderer draws edges between every connected pair.

### Climate values

Each tile carries physically consistent `elevation`, `temperature` and
`moisture` values (matching the thresholds in `BiomeAssignmentStep`) even
though the pipeline never ran.  These values are not used by the renderer
but are available to any gameplay system that queries tile climate data.

### Adding more maps

1. Create a new file in `maps/` (e.g. `ScenarioAlpha.ts`).
2. Export a `get<Name>Map(): MapData` function that builds and returns a
   `HexGrid<MapTile>` with the desired layout.
3. Pass it to `StaticMapLoader` when needed.

No changes to the renderer, pipeline or scene logic are required.
