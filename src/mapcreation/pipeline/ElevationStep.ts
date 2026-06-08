import { createNoise2D } from "simplex-noise";
import type HexGrid from "../../hex/HexGrid";
import type {
  MapPipelineContext,
  MapPipelineStep,
  MapShape,
  MapTile,
  NoiseConfig,
} from "../MapTypes";
import { clamp01, fbm, mulberry32 } from "../NoiseUtils";

/**
 * Distorts sampling coordinates with a secondary wave so masks avoid
 * perfectly round shapes. `strength` scales the warp amplitude — `1` is the
 * masks' original hand-tuned look, `0` removes the warp entirely (perfectly
 * radial coastlines), values above `1` exaggerate it into more chaotic ones.
 */
function warpCoordinates(dx: number, dy: number, strength: number) {
  return {
    x: dx + Math.sin(dy * Math.PI * 3.2) * 0.12 * strength,
    y: dy + Math.cos(dx * Math.PI * 2.7) * 0.10 * strength,
  };
}

function continentMask(dx: number, dy: number, irregularity: number): number {
  const { x: wx, y: wy } = warpCoordinates(dx, dy, irregularity);

  const continentalCores: Array<[number, number, number]> = [
    [-0.48, 0.0, 1.55],
    [0.48, 0.0, 1.55],
  ];

  const yStretch = 0.55;
  let mask = 0;
  for (const [cx, cy, scale] of continentalCores) {
    const d = Math.hypot(wx - cx, (wy - cy) * yStretch) * scale;
    mask = Math.max(mask, Math.max(0, 1 - d));
  }

  const midOcean = 0.7 + 0.3 * (1 - Math.exp(-Math.pow(dx * 2.1, 4)));
  mask *= midOcean;

  const coastalBays: Array<[number, number, number, number]> = [
    [0.15, -0.55, 3.4, 0.28],
    [-0.05, 0.65, 3.1, 0.24],
    [0.68, 0.4, 4.2, 0.18],
  ];

  const distantContinents: Array<[number, number, number, number]> = [
    [0.78, 0.72, 4.3, 0.20],
  ];

  for (const [cx, cy, scale, peak] of coastalBays) {
    const d = Math.hypot(dx - cx, (dy - cy) * yStretch) * scale;
    mask = Math.max(mask, Math.max(0, peak - d));
  }

  for (const [cx, cy, scale, peak] of distantContinents) {
    const d = Math.hypot(dx - cx, (dy - cy) * yStretch) * scale;
    mask = Math.max(mask, Math.max(0, peak - d));
  }

  const verticalSpread = 1 - Math.abs(dy) * 0.22;
  return Math.min(1, Math.max(0, mask * (0.78 + 0.16 * verticalSpread)));
}

function fractalMask(dx: number, dy: number, irregularity: number): number {
  const { x: wx, y: wy } = warpCoordinates(dx, dy, irregularity);

  const continentalCores: Array<[number, number, number]> = [
    [-0.48, 0.0, 1.55],
    [0.48, 0.0, 1.55],
  ];

  const yStretch = 0.55;
  let mask = 0;
  for (const [cx, cy, scale] of continentalCores) {
    const d = Math.hypot(wx - cx, (wy - cy) * yStretch) * scale;
    mask = Math.max(mask, Math.max(0, 1 - d));
  }

  const midOcean = 0.7 + 0.3 * (1 - Math.exp(-Math.pow(dx * 2.1, 4)));
  mask *= midOcean;

  const subcontinents: Array<[number, number, number, number]> = [
    [0.75, -0.45, 3.4, 0.28],
    [-0.78, 0.55, 3.2, 0.24],
    [0.15, 0.78, 4.0, 0.22],
    [-0.35, -0.75, 4.5, 0.18],
  ];

  const distantContinents: Array<[number, number, number, number]> = [
    [0.78, 0.72, 4.4, 0.17],
  ];

  for (const [cx, cy, scale, peak] of subcontinents) {
    const d = Math.hypot(dx - cx, (dy - cy) * yStretch) * scale;
    mask = Math.max(mask, Math.max(0, peak - d));
  }

  for (const [cx, cy, scale, peak] of distantContinents) {
    const d = Math.hypot(dx - cx, (dy - cy) * yStretch) * scale;
    mask = Math.max(mask, Math.max(0, peak - d));
  }

  const verticalSpread = 1 - Math.abs(dy) * 0.18;
  return Math.min(1, Math.max(0, mask * (0.77 + 0.18 * verticalSpread)));
}

type ShapePreset = {
  freqMultiplier: number;
  seaLevel: number;
  // dx, dy in normalized [-1, 1] space; irregularity scales domain-warp
  // amplitude for masks that use it (continents/fractal); returns a
  // multiplier in [0, 1]
  mask: (dx: number, dy: number, irregularity: number) => number;
};

const SHAPE_PRESETS: Record<MapShape, ShapePreset> = {
  pangea: {
    freqMultiplier: 1.0,
    seaLevel: 0.38,
    mask: (dx, dy) => {
      const dist = Math.sqrt(dx * dx + dy * dy);
      return Math.max(0, 1 - dist * 1.15);
    },
  },

  continents: {
    freqMultiplier: 1.0,
    seaLevel: 0.40,
    mask: continentMask,
  },

  fractal: {
    freqMultiplier: 1.0,
    seaLevel: 0.38,
    mask: fractalMask,
  },

  islands: {
    // Higher base frequency for smaller features; higher seaLevel so only peaks become land
    freqMultiplier: 1.5,
    seaLevel: 0.58,
    mask: (_dx, _dy) => 1,
  },

  mediterranean: {
    freqMultiplier: 1.0,
    seaLevel: 0.42,
    mask: (dx, dy) => {
      // Water in the center, land at the edges (inverse of pangea)
      const dist = Math.sqrt(dx * dx + dy * dy);
      return Math.min(1, Math.max(0, (dist - 0.25) * 2.2));
    },
  },
};

/** Default sea level associated with a shape preset, if any. */
export function defaultSeaLevelForShape(shape?: MapShape): number | undefined {
  return shape ? SHAPE_PRESETS[shape].seaLevel : undefined;
}

export type ElevationStepConfig = {
  /** Seed used to build this step's own noise field. */
  seed: number;
  /** Resolved FBM settings (frequency, octaves, persistence, lacunarity). */
  noise: Required<NoiseConfig>;
  /** Optional shape preset; adjusts frequency and applies a landmass mask. */
  shape?: MapShape;
  /**
   * Flat offset added to the masked height field before clamping. Resolved
   * from `MapConfig.heightLevel` by `WorldMapGenerator`; positive values
   * raise the whole map (more mountains and land), negative values lower it
   * (flatter, more ocean).
   */
  heightBias: number;
  /**
   * Multiplier applied to the domain-warp amplitude used by masks that warp
   * their sampling coordinates (`continents`, `fractal`). Resolved from
   * `MapConfig.irregularity` by `WorldMapGenerator`; `1` matches the masks'
   * original hand-tuned warp strength, `0` yields perfectly smooth radial
   * coastlines, values above `1` make them more chaotic. Masks that don't
   * warp their coordinates ignore it.
   */
  irregularityScale: number;
};

/**
 * First pipeline stage — builds the height field every later step relies on.
 *
 * Combines fractal (FBM) simplex noise with an optional shape mask so land
 * forms continents/islands instead of uniform static. The mask multiplies the
 * raw noise by a value in [0, 1] that fades towards open ocean, producing
 * organic coastlines instead of a hard-edged threshold.
 */
export default class ElevationStep implements MapPipelineStep {
  public readonly name = "elevation";

  constructor(private readonly config: ElevationStepConfig) {}

  public run(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    const { seed, noise, shape, heightBias, irregularityScale } = this.config;
    const preset = shape ? SHAPE_PRESETS[shape] : undefined;
    const effectiveFrequency = noise.frequency * (preset?.freqMultiplier ?? 1);

    const noise2D = createNoise2D(mulberry32(seed));

    grid.forEachTile((tile, coords) => {
      const { dx, dy } = context.normalize(coords);

      const raw = noise.octaves > 1
        ? fbm(
          noise2D,
          coords.col * effectiveFrequency,
          coords.row * effectiveFrequency,
          noise.octaves,
          noise.persistence,
          noise.lacunarity,
        )
        : noise2D(coords.col * effectiveFrequency, coords.row * effectiveFrequency);

      let elevation = raw * 0.5 + 0.5; // [-1, 1] -> [0, 1]

      if (preset) {
        elevation *= preset.mask(dx, dy, irregularityScale);
      }

      tile.elevation = clamp01(elevation + heightBias);
    });
  }
}
