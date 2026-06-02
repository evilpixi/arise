import type HexGrid from "../hex/HexGrid";

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

export type MapTile = {
  col: number;
  row: number;
  value: number;
};

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
