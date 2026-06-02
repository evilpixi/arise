import { createNoise2D } from "simplex-noise";

type NoiseHexagon = {
  col: number;
  row: number;
  value: number;
  color: number;
};

export default class MapGenerator
{
  constructor()
  {

  } 
  
  public getNoise(width: number, height: number)
  {
    const noise2D = createNoise2D();
    const matrix: NoiseHexagon[][] = [];

    for (let j = 0; j < height; j++)
    {
      const row: NoiseHexagon[] = [];

      for (let i = 0; i < width; i++)
      {
        let noisedValue = noise2D(i, j);
        noisedValue = noisedValue * 0.5 + 0.5;
        noisedValue = Number(noisedValue.toFixed(3));

        const shade = Math.round(noisedValue * 255);
        const color = (shade << 16) | (shade << 8) | shade;

        row.push({
          col: i,
          row: j,
          value: noisedValue,
          color: color,
        });
      }

      matrix.push(row);
    }

    return matrix;
  }
}