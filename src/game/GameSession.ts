import type { IMapGenerator, IslandConfig, MapConfig, MapData, NoiseConfig } from "../mapcreation/MapTypes";

export type GameSessionConfig = {
  mapWidth: number;
  mapHeight: number;
  seed?: number;
  noise?: NoiseConfig;
  island?: IslandConfig;
  heightLevel?: number;
  temperatureLevel?: number;
  moistureLevel?: number;
  irregularity?: number;
};

export default class GameSession {
  public readonly seed: number;
  public readonly map: MapData;
  public readonly mapWidth: number;
  public readonly mapHeight: number;

  constructor(mapGenerator: IMapGenerator, config: GameSessionConfig) {
    this.seed = config.seed ?? Math.floor(Math.random() * 2 ** 32);
    const mapConfig: MapConfig = {
      width: config.mapWidth,
      height: config.mapHeight,
      seed: this.seed,
      noise: config.noise,
      island: config.island,
      heightLevel: config.heightLevel,
      temperatureLevel: config.temperatureLevel,
      moistureLevel: config.moistureLevel,
      irregularity: config.irregularity,
    };
    this.map = mapGenerator.generate(mapConfig);

    this.mapWidth = mapConfig.width;
    this.mapHeight = mapConfig.height;
  }
}
