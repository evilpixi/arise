import type { TileCoords } from './HexTypes';

/**
 * A rectangular tile grid for hex-based maps.
 * Stores data in a row/column layout and provides safe tile access.
 */
export default class HexGrid<T> {
  public readonly layout: T[][];
  public readonly width: number;
  public readonly height: number;

  /**
   * Create a new hex grid with the given dimensions.
   * The initCallback is used to populate each tile value.
   */
  constructor(width: number, height: number, initCallback: (col: number, row: number) => T) {
    this.width = width;
    this.height = height;

    this.layout = new Array<T[]>(height);

    for (let row = 0; row < height; row += 1) {
      this.layout[row] = new Array<T>(width);
      for (let col = 0; col < width; col += 1) {
        this.layout[row][col] = initCallback(col, row);
      }
    }
  }

  /**
   * Return the tile value at the given coordinates.
   * Returns undefined when the coordinates are outside the grid.
   */
  public getTile(coords: TileCoords): T | undefined {
    if (!this.inBounds(coords)) {
      return undefined;
    }
    return this.layout[coords.row][coords.col];
  }

  /**
   * Replace the tile value at the given coordinates.
   * Throws an error when the coordinates are outside the grid.
   */
  public setTile(coords: TileCoords, value: T): void {
    if (!this.inBounds(coords)) {
      throw new Error(`Tile coordinates out of bounds: ${coords.col}, ${coords.row}`);
    }
    this.layout[coords.row][coords.col] = value;
  }

  /**
   * Check whether the given coordinates are inside the grid bounds.
   */
  public inBounds(coords: TileCoords): boolean {
    return coords.row >= 0 && coords.row < this.height && coords.col >= 0 && coords.col < this.width;
  }

  /**
   * Iterate every tile in row-major order.
   * The callback receives the tile value and its coordinates.
   */
  public forEachTile(callback: (value: T, coords: TileCoords) => void): void {
    for (let row = 0; row < this.height; row += 1) {
      for (let col = 0; col < this.width; col += 1) {
        callback(this.layout[row][col], { col, row });
      }
    }
  }

  public getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
