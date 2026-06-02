export type Orientation = "pointy" | "flat";
export type Offset = "odd" | "even";

/** A 2D point in world/screen space. */
export type WorldPoint = {
  x: number;
  y: number;
};

/** Column/row position of a tile in a rectangular grid. */
export type TileCoords = {
  col: number;
  row: number;
};

export type CubeCoords = {
  q: number;
  r: number;
  s: number;
};

export type AxialCoords = {
  q: number;
  r: number;
};

/** Column/row position in the offset hex coordinate system. */
export type OffsetCoords = {
  col: number;
  row: number;
};

/** Construction options for HexMath. */
export type HexMathConfig = {
  size?: number;
  orientation?: Orientation;
  offset?: Offset;
};

/** Visual options for drawing a single hexagon. */
export type HexagonConfig = {
  filled?: boolean;
  color?: number;
  borderThickness?: number;
};
