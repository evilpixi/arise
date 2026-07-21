import type { Biome } from "./MapTypes";

/** Render color used for river overlays (lines drawn over `isRiver` tiles). */
export const RIVER_COLOR = 0x3a7bd5;

// ---------------------------------------------------------------------------
// Biome palette
// ---------------------------------------------------------------------------

const BIOME_COLORS: Record<Biome, number> = {
  ocean:     0x1c4f82,
  glacier:   0xeaf6ff,
  mountain:  0x8d6d4d,
  tundra:    0xc9c9b8,
  plains:    0xc8cf8a,
  grassland: 0x9bc169,
  forest:    0x4f8f4a,
  swamp:     0x5c6e4a,
  desert:    0xe1c699,
  savanna:   0xc9b35b,
  jungle:    0x1a7020,
};

/** Base fill color associated with a biome. */
export function getBiomeColor(biome: Biome): number {
  return BIOME_COLORS[biome];
}

// ---------------------------------------------------------------------------
// Data-layer gradient palettes
// ---------------------------------------------------------------------------

/**
 * A color stop: [normalized position in 0..1, 24-bit hex color].
 * Stops must be sorted in ascending order by position.
 */
type ColorStop = [number, number];

/** Linear interpolation between two 24-bit hex RGB colors. */
function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >>  8) & 0xff) * (1 - t) + ((b >>  8) & 0xff) * t);
  const v = Math.round(( a        & 0xff) * (1 - t) + ( b        & 0xff) * t);
  return (r << 16) | (g << 8) | v;
}

/**
 * Sample a multi-stop gradient at position `t` in [0, 1].
 * Clamps `t` to the defined range and linearly interpolates between
 * the two surrounding stops.
 */
function sampleGradient(stops: ColorStop[], t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1];
    const [t1, c1] = stops[i];
    if (clamped <= t1) {
      const local = (clamped - t0) / (t1 - t0);
      return lerpColor(c0, c1, local);
    }
  }
  return stops[stops.length - 1][1];
}

// ---------------------------------------------------------------------------
// Elevation — standard physical-map palette (deep ocean → snow peaks)
//
// Two separate sub-gradients, each normalized to [0, 1]:
//   WATER — parameterized by depth within [0, seaLevel]  (0 = abyss, 1 = coast)
//   LAND  — parameterized by height within [seaLevel, 1] (0 = coast, 1 = peak)
//
// Normalizing by the actual seaLevel avoids colour bleed: no land tile ever
// gets a blue water colour, even when seaLevel differs from 0.5.
// ---------------------------------------------------------------------------

/** Water depth: 0 = abyss, 1 = just below the coast. */
const ELEVATION_WATER_STOPS: ColorStop[] = [
  [0.0, 0x000d1f], // deep abyss — near-black
  [0.5, 0x001a3d], // mid ocean  — very dark navy
  [1.0, 0x003070], // near coast — dark blue
];

/** Land height: 0 = just above coast, 1 = peak. */
const ELEVATION_LAND_STOPS: ColorStop[] = [
  [0.00, 0xd4c06a], // coast / sand
  [0.20, 0x90c060], // lowlands
  [0.45, 0xc8a040], // hills
  [0.65, 0x8b6030], // highlands
  [0.85, 0x808080], // high mountains
  [1.00, 0xffffff], // peaks / snow
];

/**
 * Physical-map fill color for a tile.
 *
 * Ocean tiles are normalized within `[0, seaLevel]` and sampled from the
 * water sub-gradient (near-black → dark blue).
 * Land tiles are normalized within `[seaLevel, 1]` and sampled from the
 * land sub-gradient (sand → green → brown → white).
 *
 * This two-range approach prevents colour bleed regardless of the actual
 * `seaLevel` value used during generation.
 *
 * @param elevation Tile elevation in [0, 1].
 * @param seaLevel  The map's water threshold in [0, 1] (from `MapData`).
 * @param isOcean   Whether this tile's biome is `'ocean'`.
 */
export function getElevationColor(
  elevation: number,
  seaLevel: number,
  isOcean: boolean
): number {
  if (isOcean) {
    // Normalize depth within the water range; avoid division by zero.
    const t = seaLevel > 0 ? elevation / seaLevel : 0;
    return sampleGradient(ELEVATION_WATER_STOPS, t);
  } else {
    // Normalize height within the land range; avoid division by zero.
    const range = 1 - seaLevel;
    const t = range > 0 ? (elevation - seaLevel) / range : 1;
    return sampleGradient(ELEVATION_LAND_STOPS, t);
  }
}

// ---------------------------------------------------------------------------
// Humidity / moisture — arid (tan) → saturated (dark blue)
// ---------------------------------------------------------------------------

const MOISTURE_STOPS: ColorStop[] = [
  [0.0, 0xe8c878], // arid
  [0.3, 0xc8d890], // semi-arid
  [0.5, 0x78b850], // moderate
  [0.7, 0x3888a0], // humid
  [1.0, 0x104878], // saturated
];

/**
 * Humidity fill color driven by moisture in [0, 1].
 * Arid tiles are tan/yellow; saturated tiles are dark blue.
 *
 * @param moisture Tile moisture value in [0, 1].
 */
export function getMoistureColor(moisture: number): number {
  return sampleGradient(MOISTURE_STOPS, moisture);
}

// ---------------------------------------------------------------------------
// Temperature — frozen (light cyan) → scorching (deep red)
// ---------------------------------------------------------------------------

const TEMPERATURE_STOPS: ColorStop[] = [
  [0.0, 0xaadeff], // frozen
  [0.2, 0x5599cc], // cold
  [0.4, 0x88bb66], // cool / temperate
  [0.6, 0xddbb44], // warm
  [0.8, 0xff7722], // hot
  [1.0, 0xcc2200], // scorching
];

/**
 * Temperature fill color driven by temperature in [0, 1].
 * Cold tiles are cyan/blue; hot tiles shift through green, yellow, orange
 * and red — matching the intuitive cold-to-hot thermal palette.
 *
 * @param temperature Tile temperature value in [0, 1].
 */
export function getTemperatureColor(temperature: number): number {
  return sampleGradient(TEMPERATURE_STOPS, temperature);
}
