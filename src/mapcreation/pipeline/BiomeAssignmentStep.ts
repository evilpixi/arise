import type HexGrid from "../../hex/HexGrid";
import type { Biome, MapPipelineContext, MapPipelineStep, MapTile } from "../MapTypes";

export type BiomeAssignmentStepConfig = {
  /** Elevation at which land becomes bare peaks — split into mountain/glacier by temperature. */
  highMountainElevation: number;
  /** Temperature below this value is considered cold. */
  coldTemperature: number;
  /** Temperature above this value is considered warm. */
  warmTemperature: number;
  /** Moisture below this value is considered dry. */
  dryMoisture: number;
  /** Moisture above this value is considered wet. */
  wetMoisture: number;
};

/**
 * Final pipeline stage — classifies each tile into a concrete biome.
 *
 * Crosses temperature and moisture in a Whittaker-style matrix (the same
 * three-by-three split described in plan.md's biome section), with elevation
 * carving out oceans below sea level and bare peaks above the high-mountain
 * threshold regardless of climate:
 *
 * ```
 *               dry              moderate           wet
 *   warm     desert            savanna         tropicalRainforest
 *   temperate grassland        temperateForest swamp
 *   cold     tundra            taiga           taiga
 * ```
 */
export default class BiomeAssignmentStep implements MapPipelineStep {
  public readonly name = "biomes";

  constructor(private readonly config: BiomeAssignmentStepConfig) {}

  public run(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    grid.forEachTile((tile) => {
      tile.biome = this.classify(tile, context);
    });
  }

  private classify(tile: MapTile, context: MapPipelineContext): Biome {
    const { elevation, temperature, moisture } = tile;
    const {
      highMountainElevation,
      coldTemperature,
      warmTemperature,
      dryMoisture,
      wetMoisture,
    } = this.config;

    if (elevation < context.seaLevel) return "ocean";

    if (elevation >= highMountainElevation) {
      return temperature < coldTemperature ? "glacier" : "mountain";
    }

    if (temperature < coldTemperature) {
      return moisture < dryMoisture ? "tundra" : "taiga";
    }

    if (temperature < warmTemperature) {
      if (moisture < dryMoisture) return "grassland";
      if (moisture < wetMoisture) return "temperateForest";
      return "swamp";
    }

    if (moisture < dryMoisture) return "desert";
    if (moisture < wetMoisture) return "savanna";
    return "tropicalRainforest";
  }
}
