import type { MapShape } from "../mapcreation/MapTypes";

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
  /** Called with the current control values when "Regenerar mapa" is pressed. */
  onRegenerate: (params: MapGenerationParams) => void;
  /**
   * Called when "Mapa de muestra" is pressed.
   * Loads the hand-authored design/test map that contains every biome type.
   */
  onLoadSample: () => void;
};

/** Range/step for a non-normalized numeric slider (normalized ones default to [0, 1] step 0.05). */
type SliderRange = { min: number; max: number; step: number };

const ISLAND_SHAPES: MapShape[] = ["pangea", "continents", "fractal", "islands", "mediterranean"];

const NOISE_FREQUENCY_RANGE: SliderRange = { min: 0.01, max: 0.2, step: 0.005 };
const NOISE_OCTAVES_RANGE: SliderRange = { min: 1, max: 8, step: 1 };
const NOISE_PERSISTENCE_RANGE: SliderRange = { min: 0, max: 1, step: 0.05 };
const NOISE_LACUNARITY_RANGE: SliderRange = { min: 1, max: 6, step: 0.1 };

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

const PANEL_STYLE = `
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  width: 200px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: rgba(13, 17, 23, 0.85);
  border: 1px solid #30363d;
  border-radius: 8px;
  font-family: sans-serif;
  font-size: 13px;
  color: #e6edf3;
  z-index: 10;
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

const BUTTON_STYLE = `
  margin-top: 4px;
  padding: 8px 12px;
  background: #238636;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
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

/**
 * Small floating HTML panel exposing the parameters `WorldMapGenerator`
 * accepts — seed (with a roll-random button), island shape, height/
 * temperature/moisture/irregularity levels and elevation-noise settings —
 * plus a button that regenerates the map with the current values.
 *
 * It lives outside Phaser's canvas as plain DOM — the simplest way to get
 * sliders, selects and number inputs without wiring up `dom.createContainer`
 * just for a debug tool.
 */
export default class MapGenerationPanel {
  private readonly root: HTMLDivElement;
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

  /**
   * Build the panel and attach it to `parent`.
   * @param parent DOM element the panel is appended to (e.g. `document.body`).
   * @param options Initial control values and the regenerate callback.
   */
  constructor(parent: HTMLElement, options: MapGenerationPanelOptions) {
    const { initial, onRegenerate, onLoadSample } = options;

    this.root = document.createElement("div");
    this.root.style.cssText = PANEL_STYLE;

    this.seedInput = this.addSeedField("Seed", initial.seed);
    this.shapeSelect = this.addSelectField("Tipo de isla", ISLAND_SHAPES, initial.islandShape);
    this.heightSlider = this.addSliderField("Nivel de altura", initial.heightLevel);
    this.temperatureSlider = this.addSliderField("Temperatura", initial.temperatureLevel);
    this.moistureSlider = this.addSliderField("Humedad", initial.moistureLevel);
    this.irregularitySlider = this.addSliderField("Irregularidad de costas", initial.irregularity);

    this.addSectionHeader("Ruido del terreno");
    this.noiseFrequencySlider = this.addSliderField("Frecuencia", initial.noiseFrequency, NOISE_FREQUENCY_RANGE);
    this.noiseOctavesSlider = this.addSliderField("Octavas", initial.noiseOctaves, NOISE_OCTAVES_RANGE);
    this.noisePersistenceSlider = this.addSliderField("Persistencia", initial.noisePersistence, NOISE_PERSISTENCE_RANGE);
    this.noiseLacunaritySlider = this.addSliderField("Lacunaridad", initial.noiseLacunarity, NOISE_LACUNARITY_RANGE);

    this.root.appendChild(this.buildRegenerateButton(onRegenerate));
    this.root.appendChild(this.buildSampleButton(onLoadSample));

    parent.appendChild(this.root);
  }

  /** Detach the panel from the DOM; the owning scene controls its lifetime. */
  public destroy(): void {
    this.root.remove();
  }

  /** Read the current value of every control into a `MapGenerationParams`. */
  private readParams(): MapGenerationParams {
    return {
      seed: Math.trunc(Number(this.seedInput.value)) || 0,
      islandShape: this.shapeSelect.value as MapShape,
      heightLevel: Number(this.heightSlider.value),
      temperatureLevel: Number(this.temperatureSlider.value),
      moistureLevel: Number(this.moistureSlider.value),
      irregularity: Number(this.irregularitySlider.value),
      noiseFrequency: Number(this.noiseFrequencySlider.value),
      noiseOctaves: Math.trunc(Number(this.noiseOctavesSlider.value)),
      noisePersistence: Number(this.noisePersistenceSlider.value),
      noiseLacunarity: Number(this.noiseLacunaritySlider.value),
    };
  }

  // ---------------------------- field builders ----------------------------

  private buildRegenerateButton(onRegenerate: (params: MapGenerationParams) => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = "Regenerar mapa";
    button.style.cssText = BUTTON_STYLE;
    button.addEventListener("click", () => onRegenerate(this.readParams()));
    return button;
  }

  /** Secondary button that loads the hand-authored sample map for design review. */
  private buildSampleButton(onLoadSample: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = "Mapa de muestra";
    button.title = "Carga un mapa pequeño con todos los biomas para revisar los elementos visuales";
    button.style.cssText = SAMPLE_BUTTON_STYLE;
    button.addEventListener("click", () => onLoadSample());
    return button;
  }

  /** Number input plus a button that rolls a fresh random seed into it. */
  private addSeedField(label: string, value: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.value = String(value);
    input.style.cssText = `${INPUT_STYLE} flex: 1; min-width: 0;`;

    const rollButton = document.createElement("button");
    rollButton.type = "button";
    rollButton.textContent = "🎲";
    rollButton.title = "Sortear seed aleatoria";
    rollButton.style.cssText = RANDOM_SEED_BUTTON_STYLE;
    rollButton.addEventListener("click", () => {
      input.value = String(randomSeed());
    });

    const row = document.createElement("div");
    row.style.cssText = SEED_ROW_STYLE;
    row.appendChild(input);
    row.appendChild(rollButton);

    this.root.appendChild(this.wrapField(label, row));
    return input;
  }

  private addSelectField(label: string, options: readonly string[], value: string): HTMLSelectElement {
    const select = document.createElement("select");
    select.style.cssText = INPUT_STYLE;

    for (const option of options) {
      const entry = document.createElement("option");
      entry.value = option;
      entry.textContent = option;
      select.appendChild(entry);
    }
    select.value = value;

    this.root.appendChild(this.wrapField(label, select));
    return select;
  }

  /**
   * Range input. `range` defaults to a normalized `[0, 1]` slider (the shape
   * of the generation-level knobs); pass it explicitly for raw noise
   * parameters that have their own natural ranges.
   */
  private addSliderField(label: string, value: number, range?: SliderRange): HTMLInputElement {
    const { min, max, step } = range ?? { min: 0, max: 1, step: 0.05 };

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = SLIDER_STYLE;
    this.root.appendChild(this.wrapField(label, slider));
    return slider;
  }

  /** Small uppercase caption used to visually group a set of fields (e.g. noise settings). */
  private addSectionHeader(label: string): void {
    const header = document.createElement("div");
    header.textContent = label;
    header.style.cssText = SECTION_STYLE;
    this.root.appendChild(header);
  }

  /** Wrap `control` together with a caption `<span>` in a `<label>`. */
  private wrapField(label: string, control: HTMLElement): HTMLLabelElement {
    const field = document.createElement("label");
    field.style.cssText = FIELD_STYLE;

    const caption = document.createElement("span");
    caption.textContent = label;
    caption.style.cssText = CAPTION_STYLE;

    field.appendChild(caption);
    field.appendChild(control);
    return field;
  }
}
