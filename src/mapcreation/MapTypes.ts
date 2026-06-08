import type HexGrid from "../hex/HexGrid";
import type { TileCoords } from "../hex/HexTypes";

export type MapShape = "pangea" | "continents" | "fractal" | "islands" | "mediterranean";

/**
 * Noise generation settings for the map.
 */
export type NoiseConfig = {
  /**
   * Base sampling frequency for the noise field.
   * lower values produce larger, smoother terrain features.
   * higher values produce smaller, more detailed terrain.
   */
  frequency?: number;

  /**
   * Number of FBM layers to combine.
   * 1 = single noise layer.
   * greater values add fractal detail and finer terrain features.
   */
  octaves?: number;

  /**
   * Amplitude multiplier for each additional octave.
   * lower values make higher-frequency detail weaker and the map smoother.
   * higher values make fine detail more pronounced.
   */
  persistence?: number;

  /**
   * Frequency multiplier for each additional octave.
   * values greater than 1 make later octaves sample at higher frequency.
   * larger values increase small-scale variation.
   */
  lacunarity?: number;
};

/**
 * Island shape and water threshold options.
 */
export type IslandConfig = {
  /**
   * Map shape preset to apply.
   */
  shape?: MapShape;

  /**
   * Explicit override for the water / land threshold in [0, 1].
   * higher values create more water and smaller landmasses.
   * lower values create more land and less ocean.
   */
  seaLevel?: number;
};

/**
 * Climate biome assigned to a tile from its elevation, temperature and
 * moisture. Mirrors the biome matrix described in `MapCreation.doc.md`.
 */
export type Biome =
  | "ocean"
  | "glacier"
  | "mountain"
  | "tundra"
  | "taiga"
  | "grassland"
  | "temperateForest"
  | "swamp"
  | "desert"
  | "savanna"
  | "tropicalRainforest";

/**
 * A single map tile, progressively enriched as the generation pipeline runs.
 * Every field starts at a neutral default and is filled in by the step that
 * owns it; by the time `WorldMapGenerator.generate` returns, all fields hold
 * their final value.
 */
export type MapTile = {
  col: number;
  row: number;
  /** Height field in [0, 1]. Tiles below `seaLevel` are ocean. */
  elevation: number;
  /** Climate temperature in [0, 1]. 0 = frozen, 1 = scorching. */
  temperature: number;
  /** Humidity in [0, 1]. 0 = arid, 1 = saturated. */
  moisture: number;
  /** True when a river flows through this tile. */
  isRiver: boolean;
  /** Final biome classification produced by the last pipeline step. */
  biome: Biome;
};

/**
 * Resources shared by every pipeline step: grid-shape info, a deterministic
 * RNG, neighbor lookups in storage (offset) coordinates, and normalized tile
 * positions for masks and latitude calculations.
 */
export type MapPipelineContext = {
  readonly width: number;
  readonly height: number;
  /** Resolved water / land threshold in [0, 1], shared by every step. */
  readonly seaLevel: number;
  /** Deterministic RNG seeded from the map seed; shared so runs stay reproducible. */
  readonly random: () => number;
  /** In-bounds neighbor coordinates of a tile, in offset (col, row) form. */
  neighborsOf(coords: TileCoords): TileCoords[];
  /** Tile position normalized to [-1, 1] on both axes. */
  normalize(coords: TileCoords): { dx: number; dy: number };
};

/**
 * A single stage of the sequential map generation pipeline.
 * Each step reads what previous steps left on the tiles and mutates the grid
 * in place to add its own contribution (elevation, climate, biome...).
 * See `MapCreation.doc.md` for the full chain and the reasoning behind it.
 */
export interface MapPipelineStep {
  /** Human-readable identifier, useful when logging/debugging the pipeline. */
  readonly name: string;
  /** Enrich every tile in the grid with this step's contribution. */
  run(grid: HexGrid<MapTile>, context: MapPipelineContext): void;
}

/**
 * Full map generation configuration.
 */
export type MapConfig = {
  /** Map width in tiles. */
  width: number;
  /** Map height in tiles. */
  height: number;
  /** Seed used for deterministic noise generation. */
  seed: number;
  /** Optional noise generation settings. */
  noise?: NoiseConfig;
  /** Optional island shape and sea level settings. */
  island?: IslandConfig;
};

export type MapData = {
  grid: HexGrid<MapTile>;
  seed: number;
  seaLevel: number;
};

export interface IMapGenerator {
  /**
   * Generate map data from the provided configuration.
   * @param config Map generation settings.
   */
  generate(config: MapConfig): MapData;
}
