import type HexGrid from "../../hex/HexGrid";
import type { MapPipelineContext, MapPipelineStep, MapTile } from "../MapTypes";
import { clamp01 } from "../NoiseUtils";

export type WindDirection = "east" | "west";

export type MoistureModifierStepConfig = {
  /** Extra moisture granted to land tiles on or next to a river (fertile valleys). */
  riverMoistureBonus: number;
  /** Extra moisture granted to land tiles next to the ocean (sea breeze). */
  coastalMoistureBonus: number;
  /** Direction the prevailing wind blows towards. */
  windDirection: WindDirection;
  /** How strongly wind-carried moisture overrides each tile's base value, in [0, 1]. */
  windInfluence: number;
  /** Elevation considered "mountain" — tall enough to block the prevailing wind. */
  mountainElevation: number;
  /** Fraction of carried moisture that survives crossing one mountain tile. */
  windDepletion: number;
  /** How much carried moisture regenerates per lowland tile crossed. */
  windRecovery: number;
};

/**
 * Fifth pipeline stage — reshapes the base humidity using geography.
 *
 * Two effects are layered on top of the noise-based moisture from `MoistureStep`:
 *
 * 1. **Local bonuses** — land next to a river or the ocean gets wetter
 *    (river valleys and coastlines are naturally more humid).
 * 2. **Rain shadow** — the prevailing wind "carries" moisture across each row.
 *    Crossing a mountain depletes it (rain falls on the windward slope), so the
 *    leeward side receives a drier wind and tends towards desert/steppe, while
 *    lowlands and oceans let the carried moisture recover.
 */
export default class MoistureModifierStep implements MapPipelineStep {
  public readonly name = "moisture-modifier";

  constructor(private readonly config: MoistureModifierStepConfig) {}

  public run(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    this.applyLocalBonuses(grid, context);
    this.applyRainShadow(grid, context);
  }

  private applyLocalBonuses(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    grid.forEachTile((tile, coords) => {
      if (tile.elevation < context.seaLevel) return; // oceans don't need a humidity boost

      const neighbors = context.neighborsOf(coords)
        .map((neighbor) => grid.getTile(neighbor))
        .filter((neighbor): neighbor is MapTile => neighbor !== undefined);

      const nearRiver = tile.isRiver || neighbors.some((neighbor) => neighbor.isRiver);
      const nearOcean = neighbors.some((neighbor) => neighbor.elevation < context.seaLevel);

      let bonus = 0;
      if (nearRiver) bonus += this.config.riverMoistureBonus;
      if (nearOcean) bonus += this.config.coastalMoistureBonus;

      tile.moisture = clamp01(tile.moisture + bonus);
    });
  }

  /** Sweeps each row in the wind's direction, carrying and depleting moisture as it goes. */
  private applyRainShadow(grid: HexGrid<MapTile>, context: MapPipelineContext): void {
    const blowsWestward = this.config.windDirection === "west";
    const { windInfluence, mountainElevation, windDepletion, windRecovery } = this.config;

    for (let row = 0; row < context.height; row += 1) {
      let carriedMoisture = 1; // wind starts saturated, as if coming off the ocean

      for (let step = 0; step < context.width; step += 1) {
        const col = blowsWestward ? context.width - 1 - step : step;
        const tile = grid.getTile({ col, row });
        if (!tile) continue;

        tile.moisture = clamp01(tile.moisture * (1 - windInfluence) + carriedMoisture * windInfluence);

        carriedMoisture = tile.elevation >= mountainElevation
          ? carriedMoisture * windDepletion
          : Math.min(1, carriedMoisture + windRecovery);
      }
    }
  }
}
