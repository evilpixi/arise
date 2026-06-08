import type { Biome, MapTile } from "./MapTypes";

const RIVER_COLOR = 0x3a7bd5;
const RIVER_BLEND = 0.55;

const BIOME_COLORS: Record<Biome, number> = {
  ocean: 0x1c4f82,
  glacier: 0xeaf6ff,
  mountain: 0x8d6d4d,
  tundra: 0xc9c9b8,
  taiga: 0x5e7a5e,
  grassland: 0x9bc169,
  temperateForest: 0x4f8f4a,
  swamp: 0x5c6e4a,
  desert: 0xe1c699,
  savanna: 0xc9b35b,
  tropicalRainforest: 0x2f8f4f,
};

/** Base fill color associated with a biome. */
export function getBiomeColor(biome: Biome): number {
  return BIOME_COLORS[biome];
}

/**
 * Render color for a tile: its biome color, tinted towards blue when a river
 * runs through it so waterways stay visible regardless of the terrain below.
 */
export function getTileColor(tile: MapTile): number {
  const base = getBiomeColor(tile.biome);
  return tile.isRiver ? blendColors(base, RIVER_COLOR, RIVER_BLEND) : base;
}

/** Linearly interpolates two 0xRRGGBB colors by `amount` in [0, 1]. */
function blendColors(from: number, to: number, amount: number): number {
  const channel = (color: number, shift: number) => (color >> shift) & 0xff;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);

  const r = mix(channel(from, 16), channel(to, 16));
  const g = mix(channel(from, 8), channel(to, 8));
  const b = mix(channel(from, 0), channel(to, 0));

  return (r << 16) | (g << 8) | b;
}
