import type HexGrid from "../../hex/HexGrid";
import type { TileCoords } from "../../hex/HexTypes";
import type { MapPipelineContext, MapPipelineStep, MapTile } from "../MapTypes";

export type RiverStepConfig = {
  /** Minimum elevation a tile needs to be eligible as a river source. */
  sourceElevation: number;
  /** Minimum moisture a tile needs to be eligible as a river source. */
  sourceMoisture: number;
  /** Probability [0, 1] that an eligible tile actually spawns a river. */
  sourceChance: number;
  /** Safety cap on how many tiles a single river can cross before stopping. */
  maxLength: number;
};

/**
 * Fourth pipeline stage — traces rivers from rain-fed highlands down to the sea.
 *
 * Each river is born on a high, humid tile (mountains catch the rain) and then
 * repeatedly steps to its lowest neighbor — water always flows downhill. The
 * trace stops when it reaches the sea, or when it can't find a lower neighbor
 * (a basin/lake, which we simply leave as the river's end for now).
 *
 * This step only marks `isRiver`; the actual humidity boost rivers grant to
 * the land around them is applied later, in `MoistureModifierStep`, so every
 * river already exists by the time that pass runs.
 */
export default class RiverStep implements MapPipelineStep {
  public readonly name = "rivers";

  constructor(private readonly config: RiverStepConfig) {}

  public run(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    grid.forEachTile((tile, coords) => {
      if (this.isSource(tile, context)) {
        this.trace(grid, context, coords);
      }
    });
  }

  private isSource(tile: MapTile, context: MapPipelineContext): boolean {
    return tile.elevation >= this.config.sourceElevation
      && tile.moisture >= this.config.sourceMoisture
      && context.random() < this.config.sourceChance;
  }

  private trace(grid: HexGrid<MapTile>, context: MapPipelineContext, start: TileCoords): void {
    let current: TileCoords | undefined = start;

    for (let step = 0; step < this.config.maxLength && current; step += 1) {
      const tile = grid.getTile(current);
      if (!tile) return;

      tile.isRiver = true;
      if (tile.elevation < context.seaLevel) return; // reached the sea

      current = this.lowestNeighbor(grid, context, current, tile.elevation);
    }
  }

  /** Find the in-bounds neighbor with the lowest elevation, if any is lower than `from`. */
  private lowestNeighbor(
    grid: HexGrid<MapTile>,
    context: MapPipelineContext,
    coords: TileCoords,
    fromElevation: number,
  ): TileCoords | undefined {
    let lowest: TileCoords | undefined;
    let lowestElevation = fromElevation;

    for (const neighbor of context.neighborsOf(coords)) {
      const elevation = grid.getTile(neighbor)?.elevation;
      if (elevation !== undefined && elevation < lowestElevation) {
        lowestElevation = elevation;
        lowest = neighbor;
      }
    }

    return lowest;
  }
}
