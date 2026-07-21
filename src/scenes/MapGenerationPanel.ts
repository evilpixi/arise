import type { MapShape, MapViewMode } from '../mapcreation/MapTypes';

/** Generation knobs surfaced by the panel — mirror `WorldMapGenerator`'s tunable inputs. */
export type MapGenerationParams = {
  seed: number;
  islandShape: MapShape;
  heightLevel: number;
  temperatureLevel: number;
  moistureLevel: number;
  irregularity: number;
  noiseFrequency: number;
  noiseOctaves: number;
  noisePersistence: number;
  noiseLacunarity: number;
};

export type MapGenerationPanelOptions = {
  /** Values the controls start with. */
  initial: MapGenerationParams;
  /** Called whenever a control value changes (debounced for sliders). */
  onParamsChange: (params: MapGenerationParams) => void;
  /**
   * Called when "Mapa de muestra" is pressed.
   * Loads the hand-authored design/test map that contains every biome type.
   */
  onLoadSample: () => void;
  /** Called when the user switches the map view mode. */
  onViewModeChange: (mode: MapViewMode) => void;
};

/** Range/step for a non-normalized numeric slider (normalized ones default to [0, 1] step 0.05). */
type SliderRange = { min: number; max: number; step: number };

const ISLAND_SHAPES: MapShape[] = [
  'pangea', 'continents', 'fractal', 'islands', 'mediterranean',
];

const NOISE_FREQUENCY_RANGE: SliderRange  = { min: 0.01, max: 0.2,  step: 0.005 };
const NOISE_OCTAVES_RANGE: SliderRange    = { min: 1,    max: 8,    step: 1     };
const NOISE_PERSISTENCE_RANGE: SliderRange = { min: 0,   max: 1,    step: 0.05  };
const NOISE_LACUNARITY_RANGE: SliderRange  = { min: 1,   max: 6,    step: 0.1   };

/** Delay before regenerating while a slider is being dragged. */
const SLIDER_DEBOUNCE_MS = 100;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Outer container — position, background, border, typography only. */
const PANEL_STYLE = `
  position: absolute;
  top: 16px;
  left: 16px;
  width: 200px;
  background: rgba(13, 17, 23, 0.85);
  border: 1px solid #30363d;
  border-radius: 8px;
  font-family: sans-serif;
  font-size: 13px;
  color: #e6edf3;
  z-index: 10;
  overflow: hidden;
`;

/**
 * Always-visible header row: panel title on the left,
 * collapse/expand button on the right.
 */
const HEADER_STYLE = `
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 7px 14px;
  cursor: default;
  user-select: none;
`;

const HEADER_TITLE_STYLE = `
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8b949e;
`;

const TOGGLE_BTN_STYLE = `
  background: transparent;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #8b949e;
  font-size: 12px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
`;

/** Collapsible body — contains all fields. */
const BODY_STYLE = `
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 16px 14px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  border-top: 1px solid #30363d;
`;

const FIELD_STYLE = `
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const CAPTION_STYLE = `
  color: #8b949e;
`;

const SECTION_STYLE = `
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid #30363d;
  color: #8b949e;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const INPUT_STYLE = `
  background: #161b22;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 4px 6px;
  font: inherit;
`;

const SEED_ROW_STYLE = `
  display: flex;
  gap: 6px;
`;

const RANDOM_SEED_BUTTON_STYLE = `
  padding: 4px 8px;
  background: #21262d;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 4px;
  cursor: pointer;
`;

const SLIDER_STYLE = `
  width: 100%;
`;

const SAMPLE_BUTTON_STYLE = `
  padding: 6px 12px;
  background: #1f6feb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
`;

/** 2×2 grid that holds the four view-mode toggle buttons. */
const VIEW_GRID_STYLE = `
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
`;

/** Base style shared by all view-mode toggle buttons. */
const VIEW_BTN_BASE = `
  padding: 5px 4px;
  font-size: 11px;
  font-family: sans-serif;
  border: 1px solid #30363d;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
`;

/** Inactive view-mode button. */
const VIEW_BTN_IDLE = `${VIEW_BTN_BASE}
  background: #21262d;
  color: #8b949e;
`;

/** Active (selected) view-mode button. */
const VIEW_BTN_ACTIVE = `${VIEW_BTN_BASE}
  background: #1f6feb;
  color: #ffffff;
  border-color: #388bfd;
  font-weight: 600;
`;

// ---------------------------------------------------------------------------
// View-mode button metadata
// ---------------------------------------------------------------------------

type ViewModeEntry = { mode: MapViewMode; label: string; title: string };

const VIEW_MODES: ViewModeEntry[] = [
  { mode: 'biome',       label: 'Bioma',   title: 'Vista de biomas con elementos de terreno' },
  { mode: 'elevation',   label: 'Altitud', title: 'Mapa físico de elevación (océano → cumbres)' },
  { mode: 'humidity',    label: 'Humedad', title: 'Mapa de humedad (árido → saturado)' },
  { mode: 'temperature', label: 'Temp.',   title: 'Mapa de temperatura (helado → ardiente)' },
];

// ---------------------------------------------------------------------------
// Panel class
// ---------------------------------------------------------------------------

/**
 * Small floating HTML panel exposing the parameters `WorldMapGenerator`
 * accepts — seed, island shape, height/temperature/moisture/irregularity
 * levels and elevation-noise settings.  Changing any control regenerates
 * the map automatically.
 *
 * The panel has a **always-visible header** with a collapse/expand button
 * so the map can be examined without UI clutter.  The collapsible body
 * holds all the controls.
 *
 * A "Vista" section lets the user switch between four data-layer
 * visualizations: biome, elevation, humidity and temperature.
 *
 * Lives outside Phaser's canvas as plain DOM — the simplest way to get
 * sliders, selects and number inputs without `dom.createContainer`.
 */
export default class MapGenerationPanel {
  private readonly root: HTMLDivElement;

  /** Collapsible content wrapper. Hidden when panel is collapsed. */
  private readonly body: HTMLDivElement;

  private readonly seedInput: HTMLInputElement;
  private readonly shapeSelect: HTMLSelectElement;
  private readonly heightSlider: HTMLInputElement;
  private readonly temperatureSlider: HTMLInputElement;
  private readonly moistureSlider: HTMLInputElement;
  private readonly irregularitySlider: HTMLInputElement;
  private readonly noiseFrequencySlider: HTMLInputElement;
  private readonly noiseOctavesSlider: HTMLInputElement;
  private readonly noisePersistenceSlider: HTMLInputElement;
  private readonly noiseLacunaritySlider: HTMLInputElement;

  /** Maps each view mode key to its toggle button for active-state updates. */
  private readonly viewButtons: Map<MapViewMode, HTMLButtonElement> = new Map();

  private sliderDebounceTimer?: ReturnType<typeof setTimeout>;

  /** Whether the body is currently hidden. */
  private collapsed = false;

  /**
   * Build the panel and attach it to `parent`.
   * @param parent DOM element the panel is appended to (e.g. `document.body`).
   * @param options Initial control values and the params-change callback.
   */
  constructor(parent: HTMLElement, options: MapGenerationPanelOptions) {
    const { initial, onParamsChange, onLoadSample, onViewModeChange } = options;

    // ---- Outer container --------------------------------------------------
    this.root = document.createElement('div');
    this.root.style.cssText = PANEL_STYLE;

    // ---- Always-visible header row ----------------------------------------
    this.root.appendChild(this.buildHeader());

    // ---- Collapsible body -------------------------------------------------
    this.body = document.createElement('div');
    this.body.style.cssText = BODY_STYLE;
    this.root.appendChild(this.body);

    // ---- View mode toggle (top of body) -----------------------------------
    this.addSectionHeader('Vista');
    this.buildViewModeButtons(onViewModeChange);

    // ---- Generation parameters --------------------------------------------
    this.addSectionHeader('Generación');
    this.seedInput         = this.addSeedField('Seed', initial.seed);
    this.shapeSelect       = this.addSelectField('Tipo de isla', ISLAND_SHAPES, initial.islandShape);
    this.heightSlider      = this.addSliderField('Nivel de altura',       initial.heightLevel);
    this.temperatureSlider = this.addSliderField('Temperatura',           initial.temperatureLevel);
    this.moistureSlider    = this.addSliderField('Humedad',               initial.moistureLevel);
    this.irregularitySlider = this.addSliderField('Irregularidad de costas', initial.irregularity);

    this.addSectionHeader('Ruido del terreno');
    this.noiseFrequencySlider  = this.addSliderField('Frecuencia',   initial.noiseFrequency,  NOISE_FREQUENCY_RANGE);
    this.noiseOctavesSlider    = this.addSliderField('Octavas',      initial.noiseOctaves,    NOISE_OCTAVES_RANGE);
    this.noisePersistenceSlider = this.addSliderField('Persistencia', initial.noisePersistence, NOISE_PERSISTENCE_RANGE);
    this.noiseLacunaritySlider  = this.addSliderField('Lacunaridad',  initial.noiseLacunarity, NOISE_LACUNARITY_RANGE);

    this.body.appendChild(this.buildSampleButton(onLoadSample));
    this.bindAutoRegenerate(onParamsChange);

    parent.appendChild(this.root);
  }

  /** Detach the panel from the DOM; the owning scene controls its lifetime. */
  public destroy(): void {
    if (this.sliderDebounceTimer !== undefined) {
      clearTimeout(this.sliderDebounceTimer);
    }
    this.root.remove();
  }

  /** Read the current value of every control into a `MapGenerationParams`. */
  private readParams(): MapGenerationParams {
    return {
      seed:             Math.trunc(Number(this.seedInput.value)) || 0,
      islandShape:      this.shapeSelect.value as MapShape,
      heightLevel:      Number(this.heightSlider.value),
      temperatureLevel: Number(this.temperatureSlider.value),
      moistureLevel:    Number(this.moistureSlider.value),
      irregularity:     Number(this.irregularitySlider.value),
      noiseFrequency:   Number(this.noiseFrequencySlider.value),
      noiseOctaves:     Math.trunc(Number(this.noiseOctavesSlider.value)),
      noisePersistence: Number(this.noisePersistenceSlider.value),
      noiseLacunarity:  Number(this.noiseLacunaritySlider.value),
    };
  }

  // --------------------------------------------------------------------------
  // Header / collapse toggle
  // --------------------------------------------------------------------------

  /**
   * Build the always-visible header row.
   * Contains a title label and a button that collapses / expands the body.
   */
  private buildHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.style.cssText = HEADER_STYLE;

    const title = document.createElement('span');
    title.textContent = 'Mapa';
    title.style.cssText = HEADER_TITLE_STYLE;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '−';
    btn.title = 'Ocultar panel';
    btn.style.cssText = TOGGLE_BTN_STYLE;
    btn.addEventListener('click', () => this.toggleCollapse(btn));

    header.appendChild(title);
    header.appendChild(btn);
    return header;
  }

  /**
   * Toggle the body visibility and update the button label/tooltip.
   * @param btn The collapse/expand button element.
   */
  private toggleCollapse(btn: HTMLButtonElement): void {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.body.style.display = 'none';
      btn.textContent = '+';
      btn.title = 'Mostrar panel';
    } else {
      this.body.style.display = 'flex';
      btn.textContent = '−';
      btn.title = 'Ocultar panel';
    }
  }

  // --------------------------------------------------------------------------
  // View mode buttons
  // --------------------------------------------------------------------------

  /**
   * Build a 2×2 grid of toggle buttons for the four view modes.
   * Clicking a button updates the active style and calls `onViewModeChange`.
   */
  private buildViewModeButtons(
    onViewModeChange: (mode: MapViewMode) => void
  ): void {
    const grid = document.createElement('div');
    grid.style.cssText = VIEW_GRID_STYLE;

    for (const { mode, label, title } of VIEW_MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.title = title;
      // 'biome' is the default active mode on load.
      btn.style.cssText = mode === 'biome' ? VIEW_BTN_ACTIVE : VIEW_BTN_IDLE;

      btn.addEventListener('click', () => {
        this.setActiveViewButton(mode);
        onViewModeChange(mode);
      });

      this.viewButtons.set(mode, btn);
      grid.appendChild(btn);
    }

    this.body.appendChild(grid);
  }

  /**
   * Visually mark `activeMode`'s button as selected and reset the rest.
   * Called internally on click; can also be called externally to sync state.
   */
  private setActiveViewButton(activeMode: MapViewMode): void {
    for (const [mode, btn] of this.viewButtons) {
      btn.style.cssText = mode === activeMode ? VIEW_BTN_ACTIVE : VIEW_BTN_IDLE;
    }
  }

  // --------------------------------------------------------------------------
  // Field builders
  // --------------------------------------------------------------------------

  /** Wire every control to notify `onParamsChange` when its value changes. */
  private bindAutoRegenerate(
    onParamsChange: (params: MapGenerationParams) => void
  ): void {
    const notify = () => onParamsChange(this.readParams());
    const notifyDebounced = () => {
      if (this.sliderDebounceTimer !== undefined) {
        clearTimeout(this.sliderDebounceTimer);
      }
      this.sliderDebounceTimer = setTimeout(notify, SLIDER_DEBOUNCE_MS);
    };

    this.seedInput.addEventListener('change', notify);
    this.shapeSelect.addEventListener('change', notify);

    const sliders = [
      this.heightSlider,
      this.temperatureSlider,
      this.moistureSlider,
      this.irregularitySlider,
      this.noiseFrequencySlider,
      this.noiseOctavesSlider,
      this.noisePersistenceSlider,
      this.noiseLacunaritySlider,
    ];
    for (const slider of sliders) {
      slider.addEventListener('input', notifyDebounced);
    }
  }

  /** Secondary button that loads the hand-authored sample map for design review. */
  private buildSampleButton(onLoadSample: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Mapa de muestra';
    button.title = 'Carga un mapa pequeño con todos los biomas';
    button.style.cssText = SAMPLE_BUTTON_STYLE;
    button.addEventListener('click', () => onLoadSample());
    return button;
  }

  /** Number input plus a button that rolls a fresh random seed into it. */
  private addSeedField(label: string, value: number): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.value = String(value);
    input.style.cssText = `${INPUT_STYLE} flex: 1; min-width: 0;`;

    const rollButton = document.createElement('button');
    rollButton.type = 'button';
    rollButton.textContent = '🎲';
    rollButton.title = 'Sortear seed aleatoria';
    rollButton.style.cssText = RANDOM_SEED_BUTTON_STYLE;
    rollButton.addEventListener('click', () => {
      input.value = String(randomSeed());
      input.dispatchEvent(new Event('change'));
    });

    const row = document.createElement('div');
    row.style.cssText = SEED_ROW_STYLE;
    row.appendChild(input);
    row.appendChild(rollButton);

    this.body.appendChild(this.wrapField(label, row));
    return input;
  }

  private addSelectField(
    label: string,
    options: readonly string[],
    value: string
  ): HTMLSelectElement {
    const select = document.createElement('select');
    select.style.cssText = INPUT_STYLE;

    for (const option of options) {
      const entry = document.createElement('option');
      entry.value = option;
      entry.textContent = option;
      select.appendChild(entry);
    }
    select.value = value;

    this.body.appendChild(this.wrapField(label, select));
    return select;
  }

  /**
   * Range input. `range` defaults to a normalized `[0, 1]` slider (the shape
   * of the generation-level knobs); pass it explicitly for raw noise
   * parameters that have their own natural ranges.
   */
  private addSliderField(
    label: string,
    value: number,
    range?: SliderRange
  ): HTMLInputElement {
    const { min, max, step } = range ?? { min: 0, max: 1, step: 0.05 };

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = SLIDER_STYLE;
    this.body.appendChild(this.wrapField(label, slider));
    return slider;
  }

  /** Small uppercase caption used to visually group a set of fields. */
  private addSectionHeader(label: string): void {
    const header = document.createElement('div');
    header.textContent = label;
    header.style.cssText = SECTION_STYLE;
    this.body.appendChild(header);
  }

  /** Wrap `control` together with a caption `<span>` in a `<label>`. */
  private wrapField(label: string, control: HTMLElement): HTMLLabelElement {
    const field = document.createElement('label');
    field.style.cssText = FIELD_STYLE;

    const caption = document.createElement('span');
    caption.textContent = label;
    caption.style.cssText = CAPTION_STYLE;

    field.appendChild(caption);
    field.appendChild(control);
    return field;
  }
}
