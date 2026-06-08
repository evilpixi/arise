import type HexGrid from "../../hex/HexGrid";
import type { MapPipelineContext, MapPipelineStep, MapTile } from "../MapTypes";
import { clamp01 } from "../NoiseUtils";

export type TemperatureStepConfig = {
  /**
   * How strongly elevation above sea level cools a tile down.
   * Higher values push mountain peaks towards freezing even near the equator.
   */
  altitudeFactor: number;
};

/**
 * Second pipeline stage — derives temperature from latitude and elevation.
 *
 * The vertical center of the map acts as the equator: tiles get colder the
 * further they are from it (`latitudeTemperature`). Height above sea level
 * then subtracts further warmth, so mountain ranges read as cold zones even
 * when they sit at warm latitudes — this is what produces snow-capped peaks
 * surrounded by jungle.
 *
 * Formula (see plan.md): `temperature = latitude - elevationAboveSea * factor`.
 */
export default class TemperatureStep implements MapPipelineStep {
  public readonly name = "temperature";

  constructor(private readonly config: TemperatureStepConfig) {}

  public run(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    grid.forEachTile((tile, coords) => {
      const { dy } = context.normalize(coords);

      const latitudeTemperature = 1 - Math.abs(dy);
      const heightAboveSea = Math.max(0, tile.elevation - context.seaLevel);
      const altitudeCooling = heightAboveSea * this.config.altitudeFactor;

      tile.temperature = clamp01(latitudeTemperature - altitudeCooling);
    });
  }
}
