/**
 * Geometry helpers for hexagonal tile layouts.
 * Supports pointy and flat orientations and coordinate conversions.
 */
import type {
  Orientation,
  Offset,
  CubeCoords,
  AxialCoords,
  OffsetCoords,
  TileCoords,
  WorldPoint,
  HexMathConfig,
} from "./HexTypes";

const SQRT3 = Math.sqrt(3);
const PI = Math.PI;

export default class HexMath
{
  public readonly size: number;
  public readonly orientation: Orientation;
  public readonly offset: Offset;

  public readonly width: number;
  public readonly height: number;
  public readonly horizontalSpace: number;
  public readonly verticalSpace: number;

  /**
   * Create a HexMath helper using the given tile size and orientation.
   */
  public constructor (config: HexMathConfig)
  {
    this.size = config.size || 1;
    this.orientation = config.orientation || "pointy";
    this.offset = config.offset || "odd";
    this.width = this.orientation == "pointy" ? SQRT3 * this.size : 2 * this.size;
    this.height = this.orientation == "pointy" ? 2 * this.size : SQRT3 * this.size;
    this.horizontalSpace = this.orientation == "pointy" ? this.width : 0.75 * this.width;
    this.verticalSpace = this.orientation == "pointy" ? 0.75 * this.height : this.height;
  }

  /**
   * Return the world position of one corner of a hex tile.
   * Index i goes from 0 to 5 in clockwise order.
   */
  public getCorner(center: WorldPoint, i: number) : WorldPoint
  {
    const angleInDegrees = 60 * i + (this.orientation == "pointy" ? -30 : 0);
    const angleInRadians = (PI / 180) * angleInDegrees;

    return {
      x: center.x + this.size * Math.cos(angleInRadians),
      y: center.y + this.size * Math.sin(angleInRadians)
    };
  }

  /**
   * Return all six corner points of a hex tile.
   * Useful for drawing a polygon shape in world space.
   */
  public getAllCorners(center: WorldPoint) : WorldPoint[]
  {
    const corners = [];

    for (let i = 0; i < 6; i++)
    {
      corners.push(this.getCorner(center, i))
    }

    return corners;
  }

  //  ---------------------------- cube vs axial  ---------------------------- 
  /**
   * Convert cube coordinates to axial coordinates.
   */
  public cubeToAxial(cubeCoords: CubeCoords) : AxialCoords
  {
    return { q: cubeCoords.q, r: cubeCoords.r };
  }

  /**
   * Convert axial coordinates to cube coordinates.
   */
  public axialToCube(axialCoords: AxialCoords) :CubeCoords
  {
    const q = axialCoords.q;
    const r = axialCoords.r;
    return { q: q, r: r, s: -q-r };
  }

  // ---------------------------- axial vs offset ---------------------------- 
  /**
   * Convert axial coordinates to offset coordinates.
   * Returns column/row values for a staggered grid layout.
   */
  public axialToOffset(axialCoords: AxialCoords) : OffsetCoords
  {
    let q = axialCoords.q;
    let r = axialCoords.r;
    //                                   odd-  even-                                -q    -r
    const parity = (this.offset == "odd" ? -1 : 1) * (this.orientation == "flat" ? q&1 : r&1);

    if (this.orientation == "flat") {
      r += Math.floor((q + parity) *0.5)
    }
    else {
      q += Math.floor((r + parity) *0.5)
    }
    
    return { col: q, row: r };
  }

  /**
   * Convert offset (grid) coordinates back to axial coordinates.
   */
  public offsetToAxial(offsetCoords: OffsetCoords) : AxialCoords
  {
    let q = offsetCoords.col;
    let r = offsetCoords.row;
    //                                   odd-  even-                                -q    -r
    const parity = (this.offset == "odd" ? -1 : 1) * (this.orientation == "flat" ? q&1 : r&1);

    if (this.orientation == "flat") {
      r -= Math.floor((q + parity) *0.5)
    }
    else {
      q -= Math.floor((r + parity) *0.5)
    }

    return {q: q, r: r}
  }

  //  ----------------------------  cube vs offset  ---------------------------- 
  /**
   * Convert offset grid coordinates to cube coordinates.
   */
  public offsetToCube(offsetCoords: OffsetCoords) : CubeCoords
  {
    const axials = this.offsetToAxial(offsetCoords);
    return { q: axials.q, r: axials.r, s: - axials.q - axials.r };
  }

  /**
   * Convert cube coordinates to offset grid coordinates.
   */
  public cubeToOffset(cubeCoords: CubeCoords) : OffsetCoords
  {
    return this.axialToOffset({ q: cubeCoords.q, r: cubeCoords.r });
  }

  //  ---------------------------- double vs axial ---------------------------- 
  /**
   * Convert a doubled coordinate system to axial coordinates.
   */
  public doubleToAxial(doubleCoords: OffsetCoords) : AxialCoords
  {
    const q = doubleCoords.col;
    const r = doubleCoords.row;

    // these become 0 or 1 making the 
    // substraction and the division by 2 
    // appear or dissapear
    const qCtrl = this.orientation == "flat" ? 0 : 1;
    const rCtrl = this.orientation == "flat" ? 1 : 0;

    const ax_q = Math.floor(q - r * qCtrl) / (1 + qCtrl);
    const ax_r = Math.floor(r - q * rCtrl) / (1 + rCtrl);

    return { q: ax_q, r: ax_r };
  }

  /**
   * Convert axial coordinates into doubled coordinates.
   */
  public axialToDouble(axialCoords: AxialCoords) : OffsetCoords
  {
    const q = axialCoords.q;
    const r = axialCoords.r;

    // these become 0 or 1 making the 
    // substraction and the division by 2 
    // appear or dissapear
    const qCtrl = this.orientation == "flat" ? 1 : 0;
    const rCtrl = this.orientation == "flat" ? 0 : 1;

    const col = (2 - qCtrl) * q + qCtrl * r;
    const row = (2 - rCtrl) * r + rCtrl * q;

    return { col: col, row: row };
  }

  //  ---------------------------- double vs cube ---------------------------- 
  /**
   * Convert doubled coordinates directly to cube coordinates.
   */
  public doubleToCube(doubleCoords: OffsetCoords) : CubeCoords
  {
    const axials = this.doubleToAxial(doubleCoords);
    return { q: axials.q, r: axials.r, s: -axials.q - axials.r }
  }

  public cubeToDouble(cubeCoords: CubeCoords) : OffsetCoords
  {
    return this.axialToDouble({ q: cubeCoords.q, r: cubeCoords.r });
  }


  /**
   * Return the neighboring tile coordinates around a given tile.
   * The result uses axial coordinates and may include positions outside the map.
   */
  public getNeighbors(center_offsetCoords: OffsetCoords) : AxialCoords[]
  {
    const center: AxialCoords = this.offsetToAxial(center_offsetCoords);
    const dirs = [
      {q:  1, r: 0}, {q:  1, r: -1}, {q: 0, r: -1}, 
      {q: -1, r: 0}, {q: -1, r:  1}, {q: 0, r:  1}, 
    ]
    
    return dirs.map(dir => ({ q: center.q + dir.q, r: center.r + dir.r }));
  }

  /**
   * Compute the hex distance between two tiles in offset coordinates.
   * This returns the minimum number of steps between the tiles.
   */
  public getDistance(from: OffsetCoords, to: OffsetCoords) : number
  {
    const start: CubeCoords = this.offsetToCube(from);
    const end:CubeCoords = this.offsetToCube(to);

    const diff: CubeCoords = {
      q: start.q - end.q,
      r: start.r - end.r,
      s: start.s - end.s
    }

    return Math.floor((Math.abs(diff.q) + Math.abs(diff.r) + Math.abs(diff.s)) / 2);
  }

  /**
   * Convert tile coordinates into world X/Y position.
   * This gives the center point for a hex tile in world space.
   */
  public tileToWorld(tileCoords: TileCoords) : WorldPoint
  {
    const { col, row } = tileCoords;
    const radius = this.size;
    let x = 0;
    let y = 0;

    if (this.orientation === "pointy") {
      const rowShift = this.offset === "odd"
        ? (row & 1) === 1
        : (row & 1) === 0;

      x = radius * SQRT3 * col + (rowShift ? (SQRT3 / 2) * radius : 0);
      y = radius * ((3 / 2) * row);
    } else {
      const colShift = this.offset === "odd"
        ? (col & 1) === 1
        : (col & 1) === 0;

      x = radius * ((3 / 2) * col);
      y = radius * (SQRT3 * row + (colShift ? SQRT3 / 2 : 0));
    }

    return { x, y };
  }

}