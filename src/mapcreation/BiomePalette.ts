import type { Biome } from "./MapTypes";

/** Render color used for river overlays (lines drawn over `isRiver` tiles). */
export const RIVER_COLOR = 0x3a7bd5;

const BIOME_COLORS: Record<Biome, number> = {
  ocean: 0x1c4f82,
  glacier: 0xeaf6ff,
  mountain: 0x8d6d4d,
  tundra: 0xc9c9b8,
  plains: 0xc8cf8a,
  grassland: 0x9bc169,
  forest: 0x4f8f4a,
  swamp: 0x5c6e4a,
  desert: 0xe1c699,
  savanna: 0xc9b35b,
  jungle: 0x2f8f4f,
};

/** Base fill color associated with a biome. */
export function getBiomeColor(biome: Biome): number {
  return BIOME_COLORS[biome];
}
