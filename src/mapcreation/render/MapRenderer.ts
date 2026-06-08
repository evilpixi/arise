import type Phaser from "phaser";
import type { MapData } from "../MapTypes";

/**
 * Strategy for turning generated map data into on-screen visuals.
 *
 * `MapData` carries no rendering knowledge of its own — any `MapRenderer`
 * can draw it however it needs to (full-size hex tiles, a simplified
 * minimap, a debug overlay...), and a scene can swap renderers without
 * touching map generation at all. This is what keeps map creation and
 * rendering independent: generation only ever produces `MapData`.
 */
export interface MapRenderer {
  /** Draw `map` into `scene`, replacing whatever this renderer drew before. */
  render(scene: Phaser.Scene, map: MapData): void;

  /** Remove every game object this renderer created, if any remain. */
  clear(): void;
}
