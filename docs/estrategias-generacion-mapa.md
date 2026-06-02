# Estrategias para Generar Mapas con Aspecto de Continentes

## El Problema Raíz

En `NoiseMapGenerator.ts:23`, el ruido se muestrea así:

```typescript
let value = noise2D(col, row);
```

`col` y `row` son enteros (`0, 1, 2, 3...`). El noise Simplex a coordenadas enteras consecutivas produce variaciones muy bruscas y de alta frecuencia — exactamente el "ruido visual" que se percibe. Cada tile está a 1 unidad del siguiente en el espacio del noise, que es mucho.

---

## Estrategia 1: Escalar la Frecuencia del Ruido (Cambio Mínimo, Máximo Impacto)

**El problema** es que las coordenadas enteras hacen que el noise cambie demasiado rápido entre tiles vecinos.

**La solución** es multiplicar las coordenadas por un factor pequeño (`frequency`) antes de muestrear:

```typescript
// En NoiseMapGenerator.ts
const frequency = 0.08; // Ajustar: menor = rasgos más grandes

const grid = new HexGrid<MapTile>(width, height, (col, row) => {
  let value = noise2D(col * frequency, row * frequency);
  value = value * 0.5 + 0.5;
  value = Number(value.toFixed(3));
  return { col, row, value };
});
```

Con `frequency = 0.08` sobre un mapa de 64×40, los rasgos tendrán ~12 tiles de ancho — suficiente para verse como masas de tierra. Con `frequency = 0.04` serían el doble de grandes.

**Agregar `frequency` a `MapConfig`** en `MapTypes.ts`:
```typescript
type MapConfig = {
  width: number;
  height: number;
  seed: number;
  frequency?: number; // default 0.08
}
```

---

## Estrategia 2: Ruido Fractal (FBM — Fractal Brownian Motion)

El noise de una sola octava produce formas suaves pero sin detalle. El FBM combina múltiples capas de noise con frecuencias y amplitudes distintas:

- **Octava 1 (base):** baja frecuencia, alta amplitud → forma general del continente
- **Octava 2:** frecuencia 2×, amplitud 0.5× → detalles de costa
- **Octava 3:** frecuencia 4×, amplitud 0.25× → irregularidades pequeñas

```typescript
// En NoiseMapGenerator.ts
function fbm(noise2D: (x: number, y: number) => number, x: number, y: number, octaves = 4): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue; // normalizar a [-1, 1]
}

// En generate():
const baseFreq = 0.08;
const grid = new HexGrid<MapTile>(width, height, (col, row) => {
  let value = fbm(noise2D, col * baseFreq, row * baseFreq, 4);
  value = value * 0.5 + 0.5;
  value = Number(value.toFixed(3));
  return { col, row, value };
});
```

**Resultado:** continentes con bordes naturales e irregulares, no formas de blob perfectas.

---

## Estrategia 3: Máscara de Isla (Island Mask)

Sin máscara, la tierra puede aparecer en cualquier parte del mapa, incluyendo los bordes. Una máscara de distancia desde el centro empuja los valores hacia abajo en los bordes, garantizando que el mapa esté rodeado de agua:

```typescript
// Dentro del callback de HexGrid, después de calcular el noise
const centerX = width / 2;
const centerY = height / 2;

// Distancia normalizada desde el centro [0, 1]
const dx = (col - centerX) / centerX;
const dy = (row - centerY) / centerY;
const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

// Máscara: 1.0 en el centro, 0.0 en los bordes
const islandMask = Math.max(0, 1 - distanceFromCenter * 1.3);

// Combinar noise con máscara
value = value * islandMask;
```

El factor `1.3` controla qué tan agresivamente cae el agua en los bordes. Con `1.0` la isla ocupa más espacio; con `2.0` es más pequeña.

---

## Estrategia 4: Nivel del Mar (Sea Level Threshold)

Actualmente el palette divide los 9 colores uniformemente sobre `[0, 1]`, lo que significa que ~33% del mapa es agua (índices 0-2). Esto es correcto si el noise está distribuido uniformemente, pero con FBM o con la máscara los valores se sesgan.

**Controlar el nivel del mar explícitamente:**

```typescript
// En MapTypes.ts agregar a MapConfig:
type MapConfig = {
  // ...existentes
  seaLevel?: number; // 0.0–1.0, default 0.45
}
```

```typescript
// En getColorForValue() de HexRenderer.ts
public static getColorForValue(value: number, seaLevel = 0.45): number {
  if (value < seaLevel) {
    // Agua: más oscura cuanto más profunda
    const depth = value / seaLevel; // [0, 1] dentro del rango de agua
    return depth < 0.5 ? 0x001233 : 0x001f3f;
  }

  // Tierra: remapear [seaLevel, 1] → [0, 1]
  const landValue = (value - seaLevel) / (1 - seaLevel);

  const landPalette = [
    0xa5db40, // playa/costa
    0x2e8c16, // pradera
    0x2e8c16, // bosque
    0x2e8c16, // bosque denso
    0x614f0d, // tierra/montaña baja
    0x402409, // montaña alta
  ];

  const index = Math.min(landPalette.length - 1, Math.floor(landValue * landPalette.length));
  return landPalette[index];
}
```

---

## Estrategia 5: Domain Warping (Costas Más Orgánicas)

El domain warping distorsiona las coordenadas de muestreo con otro noise antes de calcular el valor final. Produce costas con curvas y bahías más naturales:

```typescript
// Dentro de generate():
const noise2D_warp = createNoise2D(mulberry32(seed + 1)); // segundo noise para warp

const warpStrength = 0.3;
const baseFreq = 0.08;

const grid = new HexGrid<MapTile>(width, height, (col, row) => {
  const wx = col * baseFreq + noise2D_warp(col * 0.04, row * 0.04) * warpStrength;
  const wy = row * baseFreq + noise2D_warp(col * 0.04 + 5.2, row * 0.04 + 1.3) * warpStrength;

  let value = fbm(noise2D, wx, wy, 4);
  value = value * 0.5 + 0.5;
  return { col, row, value: Number(value.toFixed(3)) };
});
```

Los offsets `5.2` y `1.3` en el segundo muestreo del warp son para que los dos ejes usen partes distintas del noise (evitar simetría).

---

## Estrategia 6: Post-Proceso — Suavizado por Vecinos

`HexMath` ya tiene `getNeighbors()`. Después de generar el grid, se puede hacer una pasada de suavizado que promedia cada tile con sus vecinos:

```typescript
// En GameSession.ts o en generate() — pasada de post-proceso
function smoothGrid(grid: HexGrid<MapTile>, hexMath: HexMath, passes = 2): void {
  for (let pass = 0; pass < passes; pass++) {
    grid.forEachTile((tile, coords) => {
      const neighbors = hexMath.getNeighbors(coords)
        .filter(n => grid.inBounds(n))
        .map(n => grid.getTile(n)!.value);

      if (neighbors.length === 0) return;

      const avg = (tile.value + neighbors.reduce((a, b) => a + b, 0)) / (neighbors.length + 1);
      grid.setTile(coords, { ...tile, value: Number(avg.toFixed(3)) });
    });
  }
}
```

**Efecto:** elimina tiles aislados de tierra en medio del agua (y viceversa), cohesionando las masas. 2 pasadas suele ser suficiente.

---

## Recomendación de Implementación

Aplicar en este orden — cada paso mejora el resultado sobre el anterior:

| Prioridad | Estrategia | Impacto | Costo de Implementación |
|-----------|-----------|---------|-------------------------|
| 1 | Escalar frecuencia (`× 0.08`) | Alto | Mínimo (1 línea) |
| 2 | FBM con 4 octavas | Alto | Bajo (~15 líneas) |
| 3 | Máscara de isla | Medio-Alto | Bajo (~5 líneas) |
| 4 | Nivel del mar explícito | Medio | Bajo (~10 líneas) |
| 5 | Domain warping | Medio | Medio (~10 líneas) |
| 6 | Suavizado por vecinos | Bajo | Medio (~15 líneas) |

**Combinación mínima para un resultado visible:** Estrategia 1 + Estrategia 2 + Estrategia 3.

---

## Parámetros Sugeridos para Explorar

Una vez implementado el FBM con máscara, estos rangos dan resultados interesantes:

```
frequency:   0.04 – 0.12   (menor = islas más grandes)
octaves:     3 – 6         (más = detalles de costa más finos)
seaLevel:    0.40 – 0.55   (mayor = menos tierra)
warpStr:     0.1 – 0.5     (mayor = costas más caóticas)
islandMask:  1.0 – 1.8     (mayor = isla más pequeña respecto al mapa)
```
