import Phaser from 'phaser';
import HexMath from '../hex/HexMath';
import GameSession from '../game/GameSession';
import WorldMapGenerator from '../mapcreation/WorldMapGenerator';
import StaticMapLoader from '../mapcreation/StaticMapLoader';
import { getSampleMap } from '../mapcreation/maps/SampleMap';
import HexMapRenderer from '../mapcreation/render/HexMapRenderer';
import MapGenerationPanel from './MapGenerationPanel';
import TileInfoPanel from './TileInfoPanel';
import type { MapGenerationParams } from './MapGenerationPanel';

const TILE_SIZE = 16;
const MAP_WIDTH = 16 * 4;
const MAP_HEIGHT = 16 * 4;

// Initial values for the elevation-noise sliders in `MapGenerationPanel`;
// the panel owns them from here on, `regenerateMap` just relays its values.
const DEFAULT_NOISE = {
  frequency: 0.06,
  octaves: 5,
  persistence: 0.15,
  lacunarity: 4.8,
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

function defaultGenerationParams(): MapGenerationParams {
  return {
    seed: randomSeed(),
    islandShape: 'continents',
    heightLevel: 0.5,
    temperatureLevel: 0.5,
    moistureLevel: 0.5,
    irregularity: 0.5,
    noiseFrequency: DEFAULT_NOISE.frequency,
    noiseOctaves: DEFAULT_NOISE.octaves,
    noisePersistence: DEFAULT_NOISE.persistence,
    noiseLacunarity: DEFAULT_NOISE.lacunarity,
  };
}

export class TestScene extends Phaser.Scene {
  private readonly hexMath = new HexMath({ size: TILE_SIZE, orientation: 'pointy', offset: 'odd' });
  private readonly generator = new WorldMapGenerator();

  private mapRenderer?: HexMapRenderer;
  private panel?: MapGenerationPanel;
  private tileInfoPanel?: TileInfoPanel;

  constructor() {
    super({ key: 'TestScene' });
  }

  create(): void {
    //this.drawDebugGrid();
    // move the renderer a bit to the right so we can see the UI
    this.mapRenderer = new HexMapRenderer(this.hexMath, { x: 80, y: 14});

    // Wire tile hover → info panel before the first render so the first set
    // of tile polygons is already made interactive.
    this.tileInfoPanel = new TileInfoPanel(document.body);
    this.mapRenderer.setTileHoverCallbacks(
      (tile) => this.tileInfoPanel!.showTile(tile),
      ()     => this.tileInfoPanel!.hide()
    );

    const initialParams = defaultGenerationParams();
    this.regenerateMap(initialParams);

    // generation UI
    this.panel = new MapGenerationPanel(document.body, {
      initial: initialParams,
      onParamsChange: (params) => this.regenerateMap(params),
      onLoadSample: () => this.loadSampleMap(),
      onViewModeChange: (mode) => this.mapRenderer?.setViewMode(mode),
    });
    this.events.once('shutdown', () => {
      this.panel?.destroy();
      this.tileInfoPanel?.destroy();
    });

    this.setupCameraControls();
  }

  /** Build a fresh `GameSession` from the panel's parameters and draw it. */
  private regenerateMap(params: MapGenerationParams): void {
    const session = new GameSession(this.generator, {
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      seed: params.seed,
      noise: {
        frequency: params.noiseFrequency,
        octaves: params.noiseOctaves,
        persistence: params.noisePersistence,
        lacunarity: params.noiseLacunarity,
      },
      island: { shape: params.islandShape },
      heightLevel: params.heightLevel,
      temperatureLevel: params.temperatureLevel,
      moistureLevel: params.moistureLevel,
      irregularity: params.irregularity,
    });

    this.mapRenderer?.render(this, session.map);
  }

  /**
   * Load and render the hand-authored sample map.
   * Uses `StaticMapLoader` so the same `IMapGenerator` → `GameSession` →
   * renderer pipeline is exercised, proving the renderer is agnostic to
   * whether the map was generated procedurally or loaded from static data.
   */
  private loadSampleMap(): void {
    const session = new GameSession(
      new StaticMapLoader(getSampleMap()),
      { mapWidth: 5, mapHeight: 3, seed: 0 }
    );
    this.mapRenderer?.render(this, session.map);
  }

  /** Wire up click-and-drag panning and mouse-wheel zoom on the main camera. */
  private setupCameraControls(): void {
    let isPanoramicMoving = false;
    const panStart = { x: 0, y: 0 };

    this.input.on('pointerdown', () => {
      isPanoramicMoving = true;
      panStart.x = this.cameras.main.scrollX;
      panStart.y = this.cameras.main.scrollY;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!isPanoramicMoving) return;
      this.cameras.main.scrollX = panStart.x - (pointer.x - pointer.downX);
      this.cameras.main.scrollY = panStart.y - (pointer.y - pointer.downY);
    });
    this.input.on('pointerup', () => {
      isPanoramicMoving = false;
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _deltaX: number, deltaY: number) => {
      const camera = this.cameras.main;
      const zoomDirection = deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      camera.zoom = Phaser.Math.Clamp(camera.zoom + zoomDirection, MIN_ZOOM, MAX_ZOOM);
    });
  }

  private drawDebugGrid(): void {
    const graphics = this.add.graphics();

    // Grid configuration
    const width = Number(this.sys.game.config.width);
    const height = Number(this.sys.game.config.height);
    const size = 128;
    const subdivision = size / 2; // Secondary lines every 64px

    // 1. Draw subdivisions (thinner or more transparent lines)
    graphics.lineStyle(1, 0x444444, 0.5);

    for (let x = 0; x < width; x += subdivision) {
      graphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += subdivision) {
      graphics.lineBetween(0, y, width, y);
    }

    // 2. Draw primary guide lines (every 128px)
    graphics.lineStyle(2, 0x00ff00, 0.8); // Green color for emphasis

    for (let x = 0; x < width; x += size) {
      graphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += size) {
      graphics.lineBetween(0, y, width, y);
    }

    graphics.setAlpha(0.4);
  }
}
