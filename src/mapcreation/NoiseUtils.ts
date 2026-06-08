/**
 * Small deterministic PRNG (mulberry32). Used to seed `simplex-noise`
 * instances and any other random choice in the pipeline (e.g. river sources)
 * so that the same seed always produces the exact same map.
 */
export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fractal Brownian Motion: sums several octaves of noise at increasing
 * frequency and decreasing amplitude. The first octave sets the broad shape,
 * later ones add progressively finer detail on top of it.
 */
export function fbm(
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

/** Clamp a value to the [0, 1] range used by every normalized map field. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
