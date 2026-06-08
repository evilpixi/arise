import HexGrid from "../hex/HexGrid";
import HexMath from "../hex/HexMath";
import type { TileCoords } from "../hex/HexTypes";
import MapPipeline from "./MapPipeline";
import { mulberry32 } from "./NoiseUtils";
import ElevationStep, { defaultSeaLevelForShape } from "./pipeline/ElevationStep";
import TemperatureStep from "./pipeline/TemperatureStep";
import MoistureStep from "./pipeline/MoistureStep";
import RiverStep from "./pipeline/RiverStep";
import MoistureModifierStep from "./pipeline/MoistureModifierStep";
import BiomeAssignmentStep from "./pipeline/BiomeAssignmentStep";
import type {
  IMapGenerator,
  MapConfig,
  MapData,
  MapPipelineContext,
  MapTile,
} from "./MapTypes";

// Arbitrary odd constants used to derive independent sub-seeds from the map
// seed, so elevation noise, moisture noise and the river RNG never line up.
const MOISTURE_SEED_OFFSET = 0x9e3779b9;
const RIVER_SEED_OFFSET = 0x85ebca6b;

// `heightLevel`/`temperatureLevel`/`moistureLevel` are normalized [0, 1]
// knobs with `0.5` as neutral; these ranges turn that into the flat bias
// added to elevation/temperature/moisture, so the full slider range nudges
// the map without overwhelming the underlying noise and formulas.
const HEIGHT_BIAS_RANGE = 0.6;
const TEMPERATURE_BIAS_RANGE = 0.6;
const MOISTURE_BIAS_RANGE = 0.6;

// `irregularity` is also a normalized [0, 1] knob, but it scales a warp
// *amplitude* rather than offsetting a field — `0.5` (neutral) must map to
// `1` (the masks' original hand-tuned strength), not `0`, so it goes through
// `levelToScale` instead of `levelToBias`.
const IRREGULARITY_SCALE_RANGE = 2;

/** Maps a normalized [0, 1] level (0.5 = neutral) to a signed bias of the given range. */
function levelToBias(level: number | undefined, range: number): number {
  return ((level ?? 0.5) - 0.5) * range;
}

/** Maps a normalized [0, 1] level (0.5 = neutral -> `range / 2`) to a positive scale factor. */
function levelToScale(level: number | undefined, range: number): number {
  return (level ?? 0.5) * range;
}

// Neighbor lookups only need axial<->offset conversion, which depends on
// orientation/offset parity, not on tile size — a fixed instance is enough.
// "pointy" + "odd" matches the offset-odd-r storage convention used across
// the project (see docs/como-funciona-el-mapa.md).
const GRID_HEX_MATH = new HexMath({ orientation: "pointy", offset: "odd" });

function createEmptyTile(col: number, row: number): MapTile {
  return {
    col,
    row,
    elevation: 0,
    temperature: 0,
    moisture: 0,
    isRiver: false,
    biome: "ocean",
  };
}

function createPipelineContext(config: MapConfig, seaLevel: number): MapPipelineContext {
  const { width, height, seed } = config;

  return {
    width,
    height,
    seaLevel,
    random: mulberry32(seed ^ RIVER_SEED_OFFSET),

    neighborsOf(coords: TileCoords): TileCoords[] {
      return GRID_HEX_MATH.getNeighbors(coords)
        .map((axial) => GRID_HEX_MATH.axialToOffset(axial))
        .filter((neighbor) => neighbor.col >= 0 && neighbor.col < width
          && neighbor.row >= 0 && neighbor.row < height);
    },

    normalize(coords: TileCoords) {
      return {
        dx: (coords.col / (width - 1)) * 2 - 1,
        dy: (coords.row / (height - 1)) * 2 - 1,
      };
    },
  };
}

/**
 * Builds full world maps through a sequential pipeline.
 *
 * Generation runs as a chain of focused steps — elevation, temperature, base
 * moisture, rivers, moisture reshaping and finally biome classification —
 * where each step reads the tiles left behind by the ones before it. This is
 * the `WorldMapGenerator` referenced throughout `MapCreation.doc.md`, which
 * documents the full chain, the formulas used and how to tune them.
 */
export default class WorldMapGenerator implements IMapGenerator {
  /**
   * Generate a full world map (elevation, climate and biomes) from the given
   * configuration.
   *
   * Config options:
   * - noise: FBM settings for the elevation field (frequency, octaves,
   *   persistence, lacunarity). See `NoiseConfig` for what each one does.
   * - island.shape: landmass preset (`pangea`, `continents`, `fractal`,
   *   `islands`, `mediterranean`). Adjusts noise frequency and applies a
   *   landmass mask so coastlines look organic instead of random static.
   * - island.seaLevel: explicit water/land threshold override in [0, 1].
   *   Falls back to the shape preset's default, then to `0.33`.
   * - heightLevel/temperatureLevel/moistureLevel: normalized [0, 1] knobs
   *   (`0.5` = neutral) resolved into flat biases that shift the whole
   *   elevation/temperature/moisture fields up or down uniformly.
   * - irregularity: normalized [0, 1] knob (`0.5` = neutral) resolved into a
   *   scale factor for the domain-warp amplitude `continents`/`fractal`
   *   masks use, making coastlines smoother or more chaotic.
   *
   * @param config Map generation settings.
   * @returns Generated map data with grid, seed, and resolved sea level.
   */
  public generate(config: MapConfig): MapData {
    const {
      width, height, seed,
      noise: noiseCfg, island: islandCfg,
      heightLevel, temperatureLevel, moistureLevel, irregularity,
    } = config;

    const elevationNoise = {
      frequency: noiseCfg?.frequency ?? 0.05,
      octaves: noiseCfg?.octaves ?? 1,
      persistence: noiseCfg?.persistence ?? 0.5,
      lacunarity: noiseCfg?.lacunarity ?? 2.0,
    };

    const shape = islandCfg?.shape;
    const seaLevel = islandCfg?.seaLevel ?? defaultSeaLevelForShape(shape) ?? 0.33;

    const heightBias = levelToBias(heightLevel, HEIGHT_BIAS_RANGE);
    const temperatureBias = levelToBias(temperatureLevel, TEMPERATURE_BIAS_RANGE);
    const moistureBias = levelToBias(moistureLevel, MOISTURE_BIAS_RANGE);
    const irregularityScale = levelToScale(irregularity, IRREGULARITY_SCALE_RANGE);

    const grid = new HexGrid<MapTile>(width, height, createEmptyTile);
    const context = createPipelineContext(config, seaLevel);

    const pipeline = new MapPipeline([
      new ElevationStep({ seed, noise: elevationNoise, shape, heightBias, irregularityScale }),

      new TemperatureStep({
        altitudeFactor: 0.7,
        temperatureBias,
      }),

      new MoistureStep({
        seed: seed ^ MOISTURE_SEED_OFFSET,
        noise: {
          frequency: elevationNoise.frequency * 0.8,
          octaves: 3,
          persistence: 0.5,
          lacunarity: 2.0,
        },
        moistureBias,
      }),

      new RiverStep({
        sourceElevation: 0.62,
        sourceMoisture: 0.55,
        sourceChance: 0.05,
        maxLength: Math.max(width, height) * 2,
      }),

      new MoistureModifierStep({
        riverMoistureBonus: 0.35,
        coastalMoistureBonus: 0.15,
        windDirection: "east",
        windInfluence: 0.35,
        mountainElevation: 0.62,
        windDepletion: 0.55,
        windRecovery: 0.12,
      }),

      new BiomeAssignmentStep({
        highMountainElevation: 0.72,
        coldTemperature: 0.28,
        warmTemperature: 0.62,
        plainsMoisture: 0.18,
        dryMoisture: 0.34,
        wetMoisture: 0.62,
      }),
    ]);

    pipeline.run(grid, context);

    return { grid, seed, seaLevel };
  }
}
