import { createNoise2D } from "simplex-noise";
import HexGrid from "../hex/HexGrid";
import type { IMapGenerator, MapConfig, MapData, MapShape, MapTile } from "./MapTypes";

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fbm(
  noise2D: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let value = 0;
  let amplitude = 1;
  let freq = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * freq, y * freq) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    freq *= lacunarity;
  }

  return value / maxValue;
}

function warpCoordinates(dx: number, dy: number) {
  return {
    x: dx + Math.sin(dy * Math.PI * 3.2) * 0.12,
    y: dy + Math.cos(dx * Math.PI * 2.7) * 0.10,
  };
}

function continentMask(dx: number, dy: number): number {
  const { x: wx, y: wy } = warpCoordinates(dx, dy);

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

function fractalMask(dx: number, dy: number): number {
  const { x: wx, y: wy } = warpCoordinates(dx, dy);

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
  // dx, dy in normalized [-1, 1] space; returns a multiplier in [0, 1]
  mask: (dx: number, dy: number) => number;
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

export default class NoiseMapGenerator implements IMapGenerator {
  /**
   * Generate a map grid using noise configuration.
   *
   * Config options:
   * - frequency: base sampling frequency for the noise field.
   *     lower values → larger, smoother terrain features and broader continents.
   *     higher values → smaller, more detailed islands and sharper variation.
   * - octaves: number of FBM layers to combine.
   *     1 = single noise layer.
   *     >1 adds fractal detail by summing multiple noise frequencies.
   *     more octaves make the map more complex and noisy.
   * - persistence: amplitude multiplier for each additional octave.
   *     lower values reduce the contribution of finer octaves, producing smoother maps.
   *     higher values make small-scale details stronger and more pronounced.
   * - lacunarity: frequency multiplier for each additional octave.
   *     values >1 increase the frequency of later octaves.
   *     larger lacunarity gives faster-growing detail at smaller scales.
   * - seaLevel: threshold that controls how much of the map is water vs land.
   *     higher seaLevel means more water and less land.
   *     lower seaLevel means more land and fewer oceans.
   *
   * @param config Map generation settings.
   * @returns Generated map data with grid, seed, and rendered sea level.
   */
  generate(config: MapConfig): MapData {
    const { width, height, seed, noise: noiseCfg, island: islandCfg } = config;

    const shape = islandCfg?.shape;
    const preset = shape ? SHAPE_PRESETS[shape] : undefined;

    const frequency  = noiseCfg?.frequency  ?? 0.05; // base noise frequency
    const octaves    = noiseCfg?.octaves    ?? 1;    // number of FBM layers
    const persistence = noiseCfg?.persistence ?? 0.5; // amplitude decay per octave
    const lacunarity = noiseCfg?.lacunarity  ?? 2.0; // frequency growth per octave
    const seaLevel   = islandCfg?.seaLevel  ?? preset?.seaLevel ?? 0.33;
    const effectiveFreq = frequency * (preset?.freqMultiplier ?? 1);

    const noise2D = createNoise2D(mulberry32(seed));

    const grid = new HexGrid<MapTile>(width, height, (col, row) => {
      // Normalized position in [-1, 1] for the mask
      const dx = (col / (width  - 1)) * 2 - 1;
      const dy = (row / (height - 1)) * 2 - 1;

      const raw = octaves > 1
        ? fbm(noise2D, col * effectiveFreq, row * effectiveFreq, octaves, persistence, lacunarity)
        : noise2D(col * effectiveFreq, row * effectiveFreq);

      let value = raw * 0.5 + 0.5; // [-1,1] → [0,1]

      if (preset) {
        value *= preset.mask(dx, dy);
      }

      value = Number(Math.min(1, Math.max(0, value)).toFixed(3));
      return { col, row, value };
    });

    return { grid, seed, seaLevel };
  }
}
