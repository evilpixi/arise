import { createNoise2D } from "simplex-noise";
import type HexGrid from "../../hex/HexGrid";
import type { MapPipelineContext, MapPipelineStep, MapTile, NoiseConfig } from "../MapTypes";
import { clamp01, fbm, mulberry32 } from "../NoiseUtils";

export type MoistureStepConfig = {
  /** Seed for this step's own noise field — kept independent from elevation's. */
  seed: number;
  /** Resolved FBM settings (frequency, octaves, persistence, lacunarity). */
  noise: Required<NoiseConfig>;
  /**
   * Flat offset added to the noise-based humidity before clamping. Resolved
   * from `MapConfig.moistureLevel` by `WorldMapGenerator`; positive values
   * make the whole map wetter, negative values drier — mirrors `heightBias`/
   * `temperatureBias`.
   */
  moistureBias: number;
};

/**
 * Third pipeline stage — lays down a base humidity field.
 *
 * Sampled from its own noise source (a different seed than elevation) so wet
 * and dry regions don't simply trace the coastline. This is intentionally a
 * rough first pass: `RiverStep` and `MoistureModifierStep` reshape it later
 * with geography-aware detail (rivers, coasts, prevailing winds).
 */
export default class MoistureStep implements MapPipelineStep {
  public readonly name = "moisture";

  constructor(private readonly config: MoistureStepConfig) {}

  public run(grid: HexGrid<MapTile>, _context: MapPipelineContext): void {
    const { seed, noise, moistureBias } = this.config;
    const noise2D = createNoise2D(mulberry32(seed));

    grid.forEachTile((tile, coords) => {
      const raw = noise.octaves > 1
        ? fbm(
          noise2D,
          coords.col * noise.frequency,
          coords.row * noise.frequency,
          noise.octaves,
          noise.persistence,
          noise.lacunarity,
        )
        : noise2D(coords.col * noise.frequency, coords.row * noise.frequency);

      tile.moisture = clamp01(raw * 0.5 + 0.5 + moistureBias);
    });
  }
}
