import type HexGrid from "../hex/HexGrid";
import type { MapPipelineContext, MapPipelineStep, MapTile } from "./MapTypes";

/**
 * Runs a fixed sequence of `MapPipelineStep`s over a grid, in order.
 *
 * Each step enriches the tiles in place using the data left behind by the
 * previous ones — elevation feeds temperature, temperature and moisture feed
 * biomes, and so on. The order is the contract: steps assume everything
 * before them in the list has already run. See `MapCreation.doc.md` for the
 * full chain and the reasoning behind each stage.
 */
export default class MapPipeline {
  private readonly steps: MapPipelineStep[];

  constructor(steps: MapPipelineStep[]) {
    this.steps = steps;
  }

  public run(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    for (const step of this.steps) {
      step.run(grid, context);
    }
  }
}
