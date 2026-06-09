import type { IMapGenerator, MapConfig, MapData } from './MapTypes';

/**
 * A map source that returns a fixed, hand-authored `MapData` regardless of
 * any generation config.
 *
 * Implements `IMapGenerator` so it is a drop-in replacement for
 * `WorldMapGenerator` anywhere a map source is expected (e.g. `GameSession`).
 * The `config` argument passed to `generate` is intentionally ignored — this
 * loader's sole job is to serve its pre-built map.
 *
 * Typical use cases:
 * - Hand-crafted design/test maps (see `maps/SampleMap.ts`).
 * - Saved worlds loaded from disk/storage.
 * - Deterministic scenario maps for game scripting.
 *
 * Because the renderer (`HexMapRenderer`) only depends on `MapData`, switching
 * between a noise-generated world and a static one requires no renderer
 * changes at all.
 */
export default class StaticMapLoader implements IMapGenerator {
  private readonly mapData: MapData;

  /**
   * @param mapData The pre-built map to serve on every `generate()` call.
   */
  constructor(mapData: MapData) {
    this.mapData = mapData;
  }

  /**
   * Returns the pre-built map data.  The `config` parameter is ignored.
   * @param _config Unused — present only to satisfy the `IMapGenerator` interface.
   */
  public generate(_config: MapConfig): MapData {
    return this.mapData;
  }
}
