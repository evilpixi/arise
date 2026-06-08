# MapCreation

Procedural world-map generation: turns a seed and a few config knobs into a
grid of `MapTile`s carrying elevation, climate (temperature/moisture), rivers
and a final biome classification, ready to be rendered or queried by gameplay
systems.

## Purpose

`GameSession` asks an `IMapGenerator` for a `MapData` (a `HexGrid<MapTile>`
plus its seed and resolved sea level). `WorldMapGenerator` is the concrete
implementation used by the game: it builds a **sequential pipeline** of small,
focused steps and runs it once over an empty grid. Each step reads what
previous steps left on the tiles and adds exactly one more piece of
information — by the time the pipeline finishes, every tile has its final
elevation, temperature, moisture, river flag and biome.

```
[Elevation] -> [Temperature] -> [Base Moisture] -> [Rivers] -> [Moisture Modifiers] -> [Biomes]
```

This mirrors the design described in `plan.md`'s "Arquitectura del Servidor y
Pipeline de Mapas" / "Lógica de Clima, Altitud e Hidrografía" sections.

## Architecture

```
MapTypes.ts             Shared types: MapTile, Biome, MapPipelineStep,
                        MapPipelineContext, MapConfig/MapData, IMapGenerator
NoiseUtils.ts           mulberry32 (seeded PRNG), fbm (fractal noise), clamp01
MapPipeline.ts          Runs an ordered list of MapPipelineStep over the grid
WorldMapGenerator.ts    Builds the context + the concrete step list (the
                        IMapGenerator the game actually uses)
BiomePalette.ts         Biome -> render color mapping + river line color
pipeline/
  ElevationStep.ts          1. height field (noise + shape mask + height bias)
  TemperatureStep.ts        2. latitude + altitude + temperature bias
  MoistureStep.ts           3. base humidity (noise)
  RiverStep.ts              4. river tracing (downhill from highlands to sea)
  MoistureModifierStep.ts   5. river/coast bonuses + prevailing-wind rain shadow
  BiomeAssignmentStep.ts    6. final biome classification (Whittaker matrix)
render/
  MapRenderer.ts            Rendering strategy interface — consumes MapData only
  HexMapRenderer.ts         Hex-tile implementation (biome fill + river lines)
```

Map *generation* and map *rendering* are intentionally independent: every
step above only ever produces a `MapData` (a `HexGrid<MapTile>` plus seed and
sea level), with no rendering knowledge whatsoever. Anything that turns that
data into pixels lives behind the `MapRenderer` interface in `render/`, so a
scene can swap in a different drawing technique (e.g. a simplified minimap)
without touching generation at all — see "Rendering" below.

`MapPipelineStep` is the `Strategy` that makes each stage swappable —
replacing, removing or reordering a step only means editing the list inside
`WorldMapGenerator.generate`. `MapPipelineContext` is the small bag of shared
resources every step may need (grid size, sea level, a deterministic RNG,
neighbor lookups and normalized tile coordinates), so steps don't each
reimplement hex-neighbor math or coordinate normalization.

Tiles are mutated **in place**: `HexGrid.getTile`/`forEachTile` return direct
references into the backing array, so a step can read a field written by an
earlier step and write its own without copying the whole tile.

## The pipeline, step by step

### 1. Elevation — `ElevationStep`

Samples [Fractal Brownian Motion](https://en.wikipedia.org/wiki/Fractional_Brownian_motion)
(layered simplex noise — `fbm` in `NoiseUtils.ts`) to get a smooth height
field in `[0, 1]`. If the config picks a `MapShape` preset (`pangea`,
`continents`, `fractal`, `islands`, `mediterranean`), the raw noise is
multiplied by that preset's **mask**: a function of the tile's normalized
position that fades towards `0` over open ocean and stays near `1` over
continental cores. Multiplying (instead of thresholding) is what gives
coastlines their organic, irregular look instead of perfect circles — the
mask blends with the noise rather than cutting it off sharply. `continents`
and `fractal` additionally **domain-warp** the sampling coordinates
(`warpCoordinates`) so the landmass cores themselves look hand-drawn rather
than perfectly radial.

`seaLevel` (the water/land threshold) is resolved once, here, from
`island.seaLevel` → the shape preset's default → `0.33`, and then shared via
`MapPipelineContext.seaLevel` with every later step.

Finally, `MapConfig.heightLevel` (a normalized `[0, 1]` knob, `0.5` = neutral)
is resolved by `WorldMapGenerator` into a flat `heightBias` in `[-0.3, 0.3]`
and added to the masked field before clamping — raising or lowering the whole
map at once (more/less land and mountains) without changing its shape.

`MapConfig.irregularity` (also normalized `[0, 1]`, `0.5` = neutral) is
resolved into an `irregularityScale` in `[0, 2]` — `1` at the neutral
midpoint — that multiplies the amplitude of `warpCoordinates`, the secondary
wave `continentMask`/`fractalMask` use to distort their sampling coordinates
(see "domain-warp" above). `0` removes the warp entirely, producing perfectly
radial coastlines; values above `1` exaggerate it into more chaotic, jagged
ones. `pangea`, `islands` and `mediterranean` don't warp their masks, so they
ignore this knob.

### 2. Temperature — `TemperatureStep`

```
temperature = latitude - max(0, elevation - seaLevel) * altitudeFactor + temperatureBias
```

The vertical center of the map is treated as the equator
(`latitude = 1 - |dy|`, where `dy` is the row normalized to `[-1, 1]`):
warmest at the center, coldest at the top/bottom edges. Height *above sea
level* then subtracts further warmth — this is what produces snow-capped
peaks even on landmasses that sit at warm latitudes (e.g. equatorial
mountains), matching the "zonación vertical" described in `plan.md`.

`temperatureBias` mirrors `heightBias`: `WorldMapGenerator` resolves
`MapConfig.temperatureLevel` (`[0, 1]`, `0.5` = neutral) into a flat offset in
`[-0.3, 0.3]` that shifts the whole climate warmer or colder uniformly.

### 3. Base moisture — `MoistureStep`

A second, independent FBM noise field (different seed, so it doesn't simply
trace elevation) gives every tile a starting humidity in `[0, 1]`. This is
intentionally a rough first pass — `RiverStep` and `MoistureModifierStep`
reshape it with geography-aware detail afterwards.

`moistureBias` mirrors `heightBias`/`temperatureBias`: `WorldMapGenerator`
resolves `MapConfig.moistureLevel` (`[0, 1]`, `0.5` = neutral) into a flat
offset in `[-0.3, 0.3]` added to the raw noise before clamping — shifting the
whole map's starting humidity wetter or drier uniformly, before rivers and
modifiers reshape it further downstream.

### 4. Rivers — `RiverStep`

Rivers are born on **high, humid** tiles (`elevation`/`moisture` above
configurable thresholds, picked with a seeded chance roll so not every
qualifying tile spawns one) and then repeatedly step to their **lowest
neighbor** — water always flows downhill. A trace stops when it reaches a
tile below `seaLevel` (the sea), or when none of its neighbors are lower (a
basin/lake — the river simply ends there). `maxLength` is a safety cap so a
pathological seed can't produce an infinite walk.

This step only marks `tile.isRiver = true` along the path; the humidity it
grants to surrounding land is applied next, once every river already exists.

### 5. Moisture modifiers — `MoistureModifierStep`

Two effects reshape the base humidity using the geography built so far:

- **Local bonuses**: land tiles next to a river or the ocean get a flat
  moisture bump (river valleys and coastlines are naturally more humid).
- **Rain shadow**: for each row, a "wind" sweeps tiles in the configured
  `windDirection` carrying moisture (`carriedMoisture`, starting saturated as
  if coming off the ocean). Every tile blends its own moisture towards the
  wind's carried value (`windInfluence` controls how strongly). Crossing a
  tile at/above `mountainElevation` depletes the carried moisture
  (`windDepletion` — rain falls on the windward slope), while lowlands let it
  recover (`windRecovery`). The net effect: **humid windward coasts and dry
  leeward deserts/steppes** behind mountain ranges — the "Sombra de Lluvia"
  from `plan.md`.

### 6. Biomes — `BiomeAssignmentStep`

The final classification crosses **temperature** and **moisture** in a
Whittaker-style matrix (see `plan.md`'s biome section), with elevation
carving out oceans (`elevation < seaLevel`) and bare peaks
(`elevation >= highMountainElevation`, split into `mountain`/`glacier` purely
by temperature) regardless of climate. The temperate+dry cell is further
split by `plainsMoisture` into `plains` (very arid) and `grassland`
(moderately dry), and every cold tile collapses to a single `tundra` biome
regardless of moisture:

```
               very dry     dry        moderate     wet
  warm        desert                  savanna      jungle
  temperate   plains       grassland  forest       swamp
  cold        tundra       tundra     tundra       tundra
```

## Tuning

All thresholds live as plain numbers in the step configs assembled by
`WorldMapGenerator.generate` — there's no hidden global state. To change the
overall feel of generated worlds:

| Want to...                                   | Touch...                                                         |
|-----------------------------------------------|------------------------------------------------------------------|
| Bigger/smaller continents, more/less terrain detail | `MapConfig.noise` (frequency/octaves/persistence/lacunarity), `island.shape` |
| More/less ocean                               | `island.seaLevel`                                                |
| Smoother/more chaotic coastlines (continents/fractal only) | `MapConfig.irregularity` (`[0, 1]`, `0.5` = neutral) |
| Globally raise/lower the terrain (more/less land & mountains) | `MapConfig.heightLevel` (`[0, 1]`, `0.5` = neutral) |
| Colder/warmer worlds, more/less alpine snow    | `TemperatureStep`'s `altitudeFactor`, `MapConfig.temperatureLevel` (`[0, 1]`, `0.5` = neutral) |
| Globally wetter/drier climate                  | `MapConfig.moistureLevel` (`[0, 1]`, `0.5` = neutral)           |
| Bigger/smaller humidity patches, more/less detail | `MoistureStep`'s noise frequency/octaves (shares `MapConfig.noise`'s frequency, scaled) |
| More/fewer/longer rivers                      | `RiverStep`'s `sourceElevation`/`sourceMoisture`/`sourceChance`/`maxLength` |
| Stronger coasts/valleys, harsher rain shadows  | `MoistureModifierStep`'s bonuses, `windDirection`, `windInfluence`, `windDepletion` |
| Where biome boundaries fall                   | `BiomeAssignmentStep`'s temperature/moisture/elevation thresholds (incl. `plainsMoisture`) |

`MapConfig.seed`, `island.shape`, `heightLevel`, `temperatureLevel`,
`moistureLevel`, `irregularity` and `noise` (frequency/octaves/persistence/
lacunarity) are exactly the knobs `TestScene`'s `MapGenerationPanel` exposes,
alongside a button that rolls a fresh random seed — see "Rendering" below for
how the test scene wires them up.

## Rendering

Generation never draws anything — it only produces `MapData`. Drawing lives
behind the `MapRenderer` interface (`render/MapRenderer.ts`):

```typescript
interface MapRenderer {
  render(scene: Phaser.Scene, map: MapData): void;
  clear(): void;
}
```

`HexMapRenderer` (`render/HexMapRenderer.ts`) is the concrete implementation
`TestScene` uses. Given a `HexMath` (which carries tile size/orientation/
offset), it:

- Fills every tile's hexagon with `BiomePalette.getBiomeColor(tile.biome)`.
- Draws rivers as a **connected line** rather than tinting tiles: every
  `isRiver` tile is linked to its river-flagged neighbors with a stroke
  `hexMath.width / 2` wide (`BiomePalette.RIVER_COLOR`), so waterways read as
  flowing lines cutting across whatever terrain is underneath.
- Tracks every game object it creates so a later `render()`/`clear()` call
  can destroy the previous draw before drawing again — this is what makes
  "regenerate the map" a matter of calling `render` again.

Because `HexMapRenderer` only depends on `MapData` and a `HexMath`, the same
shape of class — or a different one entirely implementing `MapRenderer` —
can back a minimap by handing it a `HexMath` configured with a smaller
`size` (or a coarser drawing technique altogether), without touching map
generation.

`TestScene` wires generation and rendering together: it builds a
`GameSession` from the current `MapGenerationParams`, hands the resulting
`session.map` to its `HexMapRenderer`, and re-renders whenever
`MapGenerationPanel` (`scenes/MapGenerationPanel.ts`) — a small floating HTML
panel with a seed field (plus a 🎲 button that rolls a fresh random seed),
island-shape select, height/temperature/moisture/irregularity sliders, an
elevation-noise section (frequency/octaves/persistence/lacunarity) and a
"Regenerar mapa" button — calls back with new parameters. See `TestScene`'s
`create`/`regenerateMap` for the full wiring, including pan/zoom controls.

## Replacing or extending the pipeline

- To add a stage (e.g. resource/spawn placement from `plan.md`'s
  "Spawns y Recursos"), write a class implementing `MapPipelineStep` and
  insert it into the array passed to `new MapPipeline([...])` in
  `WorldMapGenerator.generate`, in the position where its inputs become
  available.
- To swap an algorithm (e.g. a different elevation noise), only that step's
  file needs to change — every other step keeps working off `tile.elevation`
  without knowing how it was produced.
- `MapPipelineContext.neighborsOf` is the only sanctioned way to walk the hex
  grid from inside a step; it already filters out-of-bounds neighbors and
  hides the axial<->offset conversion (`HexMath`) needed for "odd-r" grids.
