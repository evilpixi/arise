import type { Biome, MapTile } from '../mapcreation/MapTypes';
import { getBiomeColor } from '../mapcreation/BiomePalette';

// ---- Biome display names (Spanish) -----------------------------------------

const BIOME_LABELS: Record<Biome, string> = {
  ocean:     'Océano',
  glacier:   'Glaciar',
  mountain:  'Montaña',
  tundra:    'Tundra',
  plains:    'Llanura',
  grassland: 'Pradera',
  forest:    'Bosque',
  swamp:     'Pantano',
  desert:    'Desierto',
  savanna:   'Sabana',
  jungle:    'Jungla',
};

// ---- Style constants --------------------------------------------------------

const PANEL_STYLE = `
  position: absolute;
  top: 16px;
  right: 16px;
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  width: 180px;
  background: rgba(13, 17, 23, 0.92);
  border: 1px solid #30363d;
  border-radius: 8px;
  font-family: sans-serif;
  font-size: 12px;
  color: #e6edf3;
  z-index: 10;
  pointer-events: none;
`;

const BIOME_ROW_STYLE = `
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  padding-bottom: 6px;
  border-bottom: 1px solid #30363d;
  margin-bottom: 2px;
`;

const BADGE_STYLE = `
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.15);
  flex-shrink: 0;
`;

const ROW_STYLE = `
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
`;

const LABEL_STYLE = `color: #8b949e;`;

const BAR_TRACK_STYLE = `
  flex: 1;
  height: 3px;
  background: #21262d;
  border-radius: 2px;
  overflow: hidden;
`;

// ---- Helper: Phaser hex number → CSS color string --------------------------

function toCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

// ---- Panel ------------------------------------------------------------------

/**
 * Small floating HTML overlay that shows data for the tile currently under
 * the pointer.  It is driven externally via `showTile` / `hide` and has no
 * internal event handling — the caller (TestScene) is responsible for wiring
 * those calls from Phaser's `pointerover` / `pointerout` events.
 *
 * The panel starts hidden (`display: none`) and shows itself on `showTile`.
 * `pointer-events: none` on the root div ensures the panel never captures
 * Phaser input events itself.
 */
export default class TileInfoPanel {
  private readonly root: HTMLDivElement;

  // ---- live-update nodes
  private readonly badge: HTMLSpanElement;
  private readonly biomeName: HTMLSpanElement;
  private readonly coordVal: HTMLSpanElement;
  private readonly elevVal: HTMLSpanElement;
  private readonly elevBar: HTMLDivElement;
  private readonly tempVal: HTMLSpanElement;
  private readonly tempBar: HTMLDivElement;
  private readonly humVal: HTMLSpanElement;
  private readonly humBar: HTMLDivElement;
  private readonly riverVal: HTMLSpanElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = PANEL_STYLE;

    // ---- biome header row (badge + name)
    const biomeRow = document.createElement('div');
    biomeRow.style.cssText = BIOME_ROW_STYLE;

    this.badge = document.createElement('span');
    this.badge.style.cssText = BADGE_STYLE;

    this.biomeName = document.createElement('span');

    biomeRow.appendChild(this.badge);
    biomeRow.appendChild(this.biomeName);
    this.root.appendChild(biomeRow);

    // ---- data rows
    this.coordVal  = this.addRow('Coord.');
    ({ val: this.elevVal, bar: this.elevBar } = this.addBarRow('Elev.'));
    ({ val: this.tempVal, bar: this.tempBar } = this.addBarRow('Temp.'));
    ({ val: this.humVal,  bar: this.humBar  } = this.addBarRow('Hum.'));
    this.riverVal  = this.addRow('Río');

    parent.appendChild(this.root);
  }

  // --------------------------------------------------------------------------

  /**
   * Update all fields and make the panel visible.
   * @param tile The tile the pointer is currently over.
   */
  public showTile(tile: MapTile): void {
    const color = toCss(getBiomeColor(tile.biome));

    this.badge.style.background = color;
    this.biomeName.textContent  = BIOME_LABELS[tile.biome];
    this.coordVal.textContent   = `col ${tile.col}, fila ${tile.row}`;

    this.setBar(this.elevVal, this.elevBar, tile.elevation,   color);
    this.setBar(this.tempVal, this.tempBar, tile.temperature, '#f78166');
    this.setBar(this.humVal,  this.humBar,  tile.moisture,    '#58a6ff');

    this.riverVal.textContent = tile.isRiver ? 'sí' : 'no';
    this.riverVal.style.color = tile.isRiver ? '#58a6ff' : '#8b949e';

    this.root.style.display = 'flex';
  }

  /** Hide the panel (e.g. pointer left all tile hexagons). */
  public hide(): void {
    this.root.style.display = 'none';
  }

  /** Remove the panel from the DOM. */
  public destroy(): void {
    this.root.remove();
  }

  // ---- builders ------------------------------------------------------------

  /** Plain label + value row. Returns the value span. */
  private addRow(label: string): HTMLSpanElement {
    const row = document.createElement('div');
    row.style.cssText = ROW_STYLE;

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;

    const val = document.createElement('span');

    row.appendChild(lbl);
    row.appendChild(val);
    this.root.appendChild(row);
    return val;
  }

  /**
   * Label + value text + thin progress bar row.
   * The bar fills proportionally to the [0, 1] value.
   */
  private addBarRow(label: string): { val: HTMLSpanElement; bar: HTMLDivElement } {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    // top line: label + number
    const top = document.createElement('div');
    top.style.cssText = ROW_STYLE;

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;

    const val = document.createElement('span');
    top.appendChild(lbl);
    top.appendChild(val);

    // progress bar
    const track = document.createElement('div');
    track.style.cssText = BAR_TRACK_STYLE;

    const bar = document.createElement('div');
    bar.style.cssText = 'height:100%;border-radius:2px;width:0%;';
    track.appendChild(bar);

    row.appendChild(top);
    row.appendChild(track);
    this.root.appendChild(row);

    return { val, bar };
  }

  /** Update a bar row's numeric text and visual fill. */
  private setBar(
    val: HTMLSpanElement,
    bar: HTMLDivElement,
    value: number,    // [0, 1]
    color: string
  ): void {
    val.textContent = value.toFixed(2);
    bar.style.width = `${(value * 100).toFixed(1)}%`;
    bar.style.background = color;
  }
}
