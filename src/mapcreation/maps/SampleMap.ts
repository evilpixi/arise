import HexGrid from '../../hex/HexGrid';
import type { MapData, MapTile, Biome } from '../MapTypes';

// ---- Approximate climate values for each biome ------------------------------
// These satisfy the biome-assignment thresholds defined in BiomeAssignmentStep,
// so the tiles read as physically consistent even though the pipeline never ran.
// The renderer only uses `biome` and `isRiver`; the other values are present
// for completeness and potential future use (e.g. gameplay queries).

type BiomeClimate = {
  elevation: number;
  temperature: number;
  moisture: number;
};

const SEA_LEVEL = 0.33;

const BIOME_CLIMATE: Record<Biome, BiomeClimate> = {
  ocean:     { elevation: 0.20, temperature: 0.50, moisture: 0.80 },
  glacier:   { elevation: 0.78, temperature: 0.10, moisture: 0.50 },
  mountain:  { elevation: 0.75, temperature: 0.35, moisture: 0.40 },
  tundra:    { elevation: 0.38, temperature: 0.20, moisture: 0.50 },
  plains:    { elevation: 0.45, temperature: 0.50, moisture: 0.12 },
  grassland: { elevation: 0.48, temperature: 0.50, moisture: 0.26 },
  forest:    { elevation: 0.52, temperature: 0.50, moisture: 0.50 },
  swamp:     { elevation: 0.40, temperature: 0.50, moisture: 0.75 },
  desert:    { elevation: 0.50, temperature: 0.80, moisture: 0.25 },
  savanna:   { elevation: 0.45, temperature: 0.70, moisture: 0.45 },
  jungle:    { elevation: 0.48, temperature: 0.80, moisture: 0.80 },
};

// ---- Tile layout ------------------------------------------------------------
//
// 5 × 3 grid (col × row).  Every Biome appears at least once.
// Tiles marked with ★ have isRiver = true; they form a connected Y-junction
// so the river overlay can be seen:
//
//   (3,0)tundra ──── (4,0)plains
//        │
//   (3,1)desert
//
//   Row 0: ocean   | glacier  | mountain | tundra ★ | plains ★
//   Row 1: grassland| forest  | swamp    | desert ★ | savanna
//   Row 2: jungle  | ocean    | mountain | tundra   | desert

type TileSpec = {
  biome: Biome;
  isRiver?: true;
};

// Indexed as LAYOUT[row][col]
const LAYOUT: TileSpec[][] = [
  [
    { biome: 'ocean' },
    { biome: 'glacier' },
    { biome: 'mountain' },
    { biome: 'tundra',  isRiver: true },
    { biome: 'plains',  isRiver: true },
  ],
  [
    { biome: 'grassland' },
    { biome: 'forest' },
    { biome: 'swamp' },
    { biome: 'desert',  isRiver: true },
    { biome: 'savanna' },
  ],
  [
    { biome: 'jungle' },
    { biome: 'ocean' },
    { biome: 'mountain' },
    { biome: 'tundra' },
    { biome: 'desert' },
  ],
];

const SAMPLE_WIDTH  = LAYOUT[0].length; // 5
const SAMPLE_HEIGHT = LAYOUT.length;    // 3

// ---- Factory -----------------------------------------------------------------

/**
 * Build and return the sample `MapData`.
 *
 * The grid is created fresh on every call (no shared mutable state), so it
 * is safe to hand to a renderer and re-render multiple times.
 */
export function getSampleMap(): MapData {
  const grid = new HexGrid<MapTile>(
    SAMPLE_WIDTH,
    SAMPLE_HEIGHT,
    (col, row) => {
      const spec    = LAYOUT[row][col];
      const climate = BIOME_CLIMATE[spec.biome];

      return {
        col,
        row,
        biome:       spec.biome,
        isRiver:     spec.isRiver ?? false,
        elevation:   climate.elevation,
        temperature: climate.temperature,
        moisture:    climate.moisture,
      };
    }
  );

  return { grid, seed: 0, seaLevel: SEA_LEVEL };
}
