# Como funciona el sistema de mapas de NuGame

Guia didactica paso a paso para entender (y replicar) el sistema de mapas hexagonales procedurales del proyecto.

---

## Indice

1. [Vision general](#1-vision-general)
2. [Stack tecnologico](#2-stack-tecnologico)
3. [La grilla hexagonal: coordenadas y matematica](#3-la-grilla-hexagonal-coordenadas-y-matematica)
4. [Estructura de datos del mapa](#4-estructura-de-datos-del-mapa)
5. [Generacion procedural con ruido Simplex](#5-generacion-procedural-con-ruido-simplex)
6. [Renderizado pixel-perfect del mapa](#6-renderizado-pixel-perfect-del-mapa)
7. [La rejilla hexagonal como overlay](#7-la-rejilla-hexagonal-como-overlay)
8. [Camara, panning y viewport](#8-camara-panning-y-viewport)
9. [Pathfinding A* sobre hexagonos](#9-pathfinding-a-sobre-hexagonos)
10. [Flujo completo: de semilla a pantalla](#10-flujo-completo-de-semilla-a-pantalla)
11. [Como replicarlo tu mismo](#11-como-replicarlo-tu-mismo)

---

## 1. Vision general

El mapa de NuGame es una **grilla hexagonal procedural** donde cada celda tiene un tipo de terreno (agua, llanura, colinas, montana). No usa tilesets tradicionales ni sprites: el mapa entero se genera como una **textura de pixeles** calculada matematicamente en tiempo real, con bordes organicos entre terrenos que parecen naturales.

```
Semilla (string)
    |
    v
Ruido Simplex (FBM)  -->  Mapa de alturas [0, 1]  -->  Terrenos por umbrales
    |
    v
Domain Warp + Shepard Blending  -->  Textura pixel-perfect
    |
    v
Phaser 3 (WebGL)  -->  Pantalla
```

---

## 2. Stack tecnologico

| Tecnologia | Rol | Por que se usa |
|---|---|---|
| **TypeScript** | Lenguaje | Tipado estricto, menos bugs |
| **Phaser 3.90** | Motor de juego | Renderizado WebGL, manejo de camara, input |
| **simplex-noise 4.0** | Generacion procedural | Ruido suave para terrenos naturales |
| **Vite** | Build tool | Desarrollo rapido con HMR |

**Archivos clave:**

```
src/
  hex/           <-- Matematica hexagonal (coordenadas, layout, pathfinding)
  maps/          <-- Datos del mapa, generacion, tipos de terreno
  render/        <-- Renderizado visual (textura de pixeles, rejilla)
  scenes/        <-- Orquestacion (GameScene une todo)
```

---

## 3. La grilla hexagonal: coordenadas y matematica

### 3.1 Tres sistemas de coordenadas

El proyecto maneja 3 sistemas de coordenadas hexagonales. Cada uno tiene su utilidad:

**Offset Odd-R** (col, row) — para almacenamiento en arrays 2D:
```
  [0,0] [1,0] [2,0] [3,0]      <-- fila par: alineada
     [0,1] [1,1] [2,1] [3,1]   <-- fila impar: desplazada a la derecha
  [0,2] [1,2] [2,2] [3,2]      <-- fila par: alineada
```

**Axial** (q, r) — coordenadas principales para logica de juego:
```
- Compactas: solo 2 numeros
- Eficientes para calcular vecinos, distancias
- Son las que se usan en todo el codigo
```

**Cubo** (x, y, z) donde x + y + z = 0 — para calculos intermedios:
```
- Utiles para distancia Manhattan hexagonal
- Necesarias para redondeo de coordenadas fraccionarias
```

### 3.2 Conversiones entre sistemas

```typescript
// Offset → Axial (para leer del array 2D)
axial.q = col - (row - (row & 1)) / 2
axial.r = row

// Axial → Cubo (para calculos)
cube.x = q
cube.z = r
cube.y = -q - r

// Axial → Mundo (posicion en pixeles, hexagonos pointy-top)
mundo.x = hexSize * sqrt(3) * (q + r/2) + origen.x
mundo.y = hexSize * (3/2) * r + origen.y
```

### 3.3 El HexLayout

`HexLayout` es la clase que convierte entre coordenadas axiales y posiciones en el mundo:

```typescript
const layout = new HexLayout({
  orientation: "pointy",   // Punta arriba (vs "flat" = lado plano arriba)
  hexSize: 96,             // Radio del hexagono en unidades de mundo
  origin: { x: 192, y: 192 }  // Offset del grid en el mundo
});

// Hex → posicion en el mundo
const centro = layout.axialToWorld({ q: 3, r: 2 });

// Posicion del mouse → hex mas cercano
const hex = layout.worldToAxial({ x: 500, y: 300 });

// Las 6 esquinas de un hexagono (para dibujar)
const esquinas = layout.getHexCornerPoints(centro);
```

**Geometria pointy-top**: las esquinas se calculan cada 60 grados empezando en -30:

```
       /\
      /  \
     |    |     Ancho = hexSize * sqrt(3)
     |    |     Alto  = hexSize * 2
      \  /      Separacion Y entre filas = hexSize * 1.5
       \/
```

### 3.4 Vecinos y distancias

Cada hexagono tiene 6 vecinos. En coordenadas axiales, los offsets son fijos:

```typescript
const DIRECCIONES = [
  { q: 1,  r: 0 },    // Este
  { q: 1,  r: -1 },   // Noreste
  { q: 0,  r: -1 },   // Noroeste
  { q: -1, r: 0 },    // Oeste
  { q: -1, r: 1 },    // Suroeste
  { q: 0,  r: 1 }     // Sureste
];
```

La distancia entre dos hexagonos se calcula via coordenadas cubo:
```
distancia = (|x1-x2| + |y1-y2| + |z1-z2|) / 2
```

---

## 4. Estructura de datos del mapa

### 4.1 GameMap

El mapa es un array 2D inmutable de `TileData`:

```typescript
class GameMap {
  readonly width: number;      // 112 columnas (demo)
  readonly height: number;     // 80 filas (demo)
  private readonly tiles: ReadonlyArray<ReadonlyArray<TileData>>;
}
```

Internamente almacena en formato offset odd-r (filas y columnas), pero expone su API en coordenadas axiales:

```typescript
map.getTerrain({ q: 5, r: 3 })   // → "plains"
map.isBlocked({ q: 5, r: 3 })    // → false (llanura es caminable)
map.isInside({ q: -1, r: 0 })    // → false (fuera de limites)
```

### 4.2 Tipos de terreno

Solo hay 4 tipos, definidos como un union type:

```typescript
type TerrainKind = "water" | "plains" | "hills" | "mountain";
```

| Terreno | Caminable | Color por defecto | Altura logica |
|---|---|---|---|
| water | No | #a6d0cc | 0.10 |
| plains | Si | #77bb77 | 0.43 |
| hills | Si | #bfb386 | 0.69 |
| mountain | No | #a38065 | 0.94 |

---

## 5. Generacion procedural con ruido Simplex

Esta es la parte mas interesante. El mapa NO esta dibujado a mano: se genera matematicamente a partir de una **semilla** (string).

### 5.1 Que es el ruido Simplex?

Es una funcion matematica que recibe coordenadas (x, y) y devuelve un valor entre -1 y 1. Lo especial es que valores cercanos en el espacio producen resultados cercanos, creando un patron **suave y continuo** (como colinas naturales).

```
noise2D(0.0, 0.0) → 0.23
noise2D(0.01, 0.0) → 0.24    // Muy cerca → valor similar
noise2D(5.0, 5.0) → -0.67    // Lejos → valor distinto
```

### 5.2 Generador pseudo-aleatorio con semilla (PRNG)

Para que el mismo mapa se genere siempre con la misma semilla, se usa un PRNG determinista:

```typescript
const createSeededRandom = (seed: string): (() => number) => {
  // 1. Convierte el string a un numero con hash FNV-1a
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  // 2. Genera numeros pseudo-aleatorios con un algoritmo estilo PCG
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;  // [0, 1)
  };
};
```

Este PRNG alimenta a `createNoise2D()` de la libreria simplex-noise, que lo usa para construir su tabla de permutaciones interna.

### 5.3 Fractal Brownian Motion (FBM)

Un solo nivel de ruido Simplex produce formas demasiado simples. Para crear terrenos mas interesantes, se suman **multiples capas (octavas)** a diferentes escalas:

```typescript
const sampleTerrainHeight01 = (col, row, options) => {
  let sum = 0;
  let amplitude = 1;
  let weight = 0;
  let freq = 0.06;         // Frecuencia base

  for (let octava = 0; octava < 4; octava++) {
    sum += noise2D(col * freq, row * freq) * amplitude;
    weight += amplitude;
    freq *= 2;              // Cada octava: frecuencia x2 (mas detalle)
    amplitude *= 0.5;       // Cada octava: amplitud /2 (menos peso)
  }

  return (sum / weight + 1) / 2;  // Normalizar a [0, 1]
};
```

Visualmente:
```
Octava 1 (freq=0.06):  ~~~~          Formas grandes (continentes)
Octava 2 (freq=0.12):  ~~  ~~        Detalle medio (peninsulas)
Octava 3 (freq=0.24):  ~ ~ ~ ~       Detalle fino (bahias)
Octava 4 (freq=0.48):  ~~~~~~~~      Micro-detalle (irregularidades)
                        ────────
Suma ponderada:         Terreno natural y variado
```

### 5.4 De altura a terreno: umbrales

El valor continuo [0, 1] se convierte a terreno discreto con umbrales simples:

```
Altura:    0.0 ──── 0.35 ──── 0.55 ──── 0.75 ──── 1.0
Terreno:    AGUA     LLANURA    COLINAS    MONTANA
```

```typescript
if (h < 0.35) return "water";
if (h < 0.55) return "plains";
if (h < 0.75) return "hills";
return "mountain";
```

### 5.5 Semilla aleatoria

Cada vez que pulsas "Nuevo mapa aleatorio", se genera una nueva semilla:

```typescript
const randomMapSeed = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
// Ejemplo: "m1abc2d-x7k9p3q2wz"
```

Misma semilla = mismo mapa. Siempre.

---

## 6. Renderizado pixel-perfect del mapa

Aqui esta la magia visual. En vez de dibujar sprites por celda, el mapa se renderiza como una **unica textura de canvas** donde cada pixel se calcula individualmente.

### 6.1 Pipeline de renderizado (por cada pixel)

```
Pixel (px, py)
    |
    v
[1] Coordenada mundo (wx, wy)
    |
    v
[2] Domain Warp → posicion desplazada (sx, sy)
    |
    v
[3] Shepard Blending → altura suavizada h
    |
    v
[4] Undulacion isolinea → h ajustada
    |
    v
[5] Cuantizacion → TerrainKind
    |
    v
[6] Color RGB → pixel final
```

### 6.2 Paso 1: Coordenada mundo

Cada pixel de la textura corresponde a una posicion en el mundo del juego:

```typescript
const wx = bounds.minX + (px + 0.5) / scale;
const wy = bounds.minY + (py + 0.5) / scale;
```

### 6.3 Paso 2: Domain Warp (deformacion de dominio)

**Concepto clave**: en vez de mover los bordes del terreno, se mueve *donde miras* para calcular el terreno. Esto crea costas organicas y curvas naturales.

```
Sin domain warp:          Con domain warp:
┌──────────┐             ┌──────────┐
│ AGUA     │             │ AGUA  ~  │
│──────────│             │  ~~──~── │
│ TIERRA   │             │ TIERRA~~ │
└──────────┘             └──────────┘
Bordes rectos            Bordes organicos
```

La implementacion usa **dos etapas de warp**:

```typescript
const sampleWorld = (wx, wy) => {
  // Etapa 1: desplazamiento con ruido suave
  const nx = noise2D(wx * freq, wy * freq) + detailNoise(...) * 0.36;
  const ny = noise2D(wx * freq + 19.2, wy * freq + 7.4) + ...;
  let x = wx + nx * 7.4;  // Amplitud ~7.4 unidades
  let y = wy + ny * 7.4;

  // Etapa 2: warp adicional con rotacion 35 grados (rompe simetria)
  const ux = x * cos35 - y * sin35;
  const uy = x * sin35 + y * cos35;
  const dx2 = warp2U(ux * freq2, uy * freq2) + ...;
  const dy2 = warp2V(ux * freq2, uy * freq2) + ...;
  x += dx2 * 7.4 * 0.56;
  y += dy2 * 7.4 * 0.56;

  return { x, y };
};
```

**Por que 2 etapas?** Una sola capa de warp tiende a crear patrones reconocibles. La segunda etapa (rotada 35 grados) rompe la simetria y produce bordes mas naturales.

### 6.4 Paso 3: Shepard Blending (campo de alturas suavizado)

Despues del warp, se calcula la "altura" del pixel mezclando las alturas de los hexagonos cercanos con pesos por distancia:

```
h(pixel) = Sum(peso_i * altura_hex_i) / Sum(peso_i)
```

Donde el peso usa un kernel de soporte compacto:

```typescript
const peso = (distancia, radio) => {
  if (distancia >= radio) return 0;
  const t = distancia / radio;
  return (1 - t) * (1 - t);   // Decae suavemente hasta 0
};
```

```
peso
1.0 |\
    | \
    |  \
    |   \
0.0 |____\___
    0   radio   distancia
```

**Radio**: 2.05 * hexSize. Esto significa que cada pixel "ve" a los hexagonos en un radio de ~3 celdas.

**Resultado**: las transiciones entre terrenos son suaves en el campo de alturas, pero el color final es discreto (un solo terreno por pixel).

### 6.5 Paso 4: Undulacion de isolinea

Antes de decidir el terreno final, se agrega una pequena perturbacion de baja frecuencia:

```typescript
h += undulationAmplitude * isolineNoise(x * freq * 0.5, y * freq * 0.5);
// Amplitud ~0.076, frecuencia muy baja → ondulaciones grandes y suaves
```

Esto crea **bahias y meandros** en las costas. Solo son 2 octavas a frecuencia muy baja, asi que no agrega "grano" fino.

### 6.6 Paso 5: Cuantizacion

La altura suavizada se convierte a terreno con umbrales ligeramente diferentes a los de generacion:

```
Generacion:     0.35 / 0.55 / 0.75
Renderizado:    0.265 / 0.56 / 0.815
```

Los umbrales son distintos porque las alturas representativas de cada terreno (0.1, 0.43, 0.69, 0.94) no son los promedios de los rangos originales. Esto garantiza que zonas grandes de un solo terreno mantengan su color correcto.

### 6.7 Paso 6: Color final

Cada terreno tiene un color fijo (sin mezcla RGB entre terrenos):

```typescript
const { r, g, b } = terrainToRgb(terrain);
pixels[i]     = r;
pixels[i + 1] = g;
pixels[i + 2] = b;
pixels[i + 3] = 255;  // Opaco
```

---

## 7. La rejilla hexagonal como overlay

Sobre la textura de pixeles se dibuja opcionalmente una rejilla de lineas blancas:

```typescript
// Para cada hexagono del mapa:
const centro = layout.axialToWorld(coord);
const esquinas = layout.getHexCornerPoints(centro);  // 6 puntos

graphics.lineStyle(1, 0xffffff, 1);
graphics.beginPath();
graphics.moveTo(esquinas[0].x, esquinas[0].y);
for (let i = 1; i < 6; i++) {
  graphics.lineTo(esquinas[i].x, esquinas[i].y);
}
graphics.closePath();
graphics.strokePath();
```

La rejilla esta a depth 500 (encima de la textura a depth 0), se activa/desactiva con un boton.

---

## 8. Camara, panning y viewport

### 8.1 Limites de la camara

Se calculan los limites del mundo iterando TODAS las esquinas de TODOS los hexagonos:

```typescript
// mapBounds.ts: recorre todas las coordenadas del mapa
// Para cada hex, obtiene las 6 esquinas
// Calcula el bounding box global (minX, minY, maxX, maxY)

cam.setBounds(bounds.minX, bounds.minY, worldW, worldH, true);
```

### 8.2 Drag para mover

El movimiento de camara funciona arrastrando con el boton izquierdo:

```typescript
input.on("pointermove", (pointer) => {
  if (!pointer.isDown || !pointer.leftButtonDown()) return;

  const zoom = cam.zoom;
  cam.scrollX -= (pointer.x - pointer.prevPosition.x) / zoom;
  cam.scrollY -= (pointer.y - pointer.prevPosition.y) / zoom;
});
```

Se divide por `zoom` para que el movimiento sea consistente a cualquier nivel de zoom.

### 8.3 Hover: coordenadas de pantalla a hex

```
Mouse (screenX, screenY)
    |  cam.getWorldPoint()
    v
Mundo (worldX, worldY)
    |  layout.worldToAxial()
    v
Hex (q, r)
    |  map.getTerrain()
    v
"Llanura" (mostrar en HUD)
```

---

## 9. Pathfinding A* sobre hexagonos

El proyecto incluye un algoritmo A* adaptado para grillas hexagonales:

```typescript
findPath(inicio, destino, isBlocked): AxialCoord[]
```

### Como funciona:

1. **Open set**: cola de prioridad (array con extraccion del minimo)
2. **Heuristica**: distancia hexagonal (admisible, nunca sobreestima)
3. **Costo**: 1 por paso (uniforme)
4. **Bloqueo**: funcion que dice si un hex es transitable

```typescript
// Ejemplo de uso:
const camino = findPath(
  { q: 0, r: 0 },
  { q: 10, r: 5 },
  (coord) => map.isBlocked(coord)   // Agua y montana bloquean
);
// Resultado: [{ q:0, r:0 }, { q:1, r:0 }, ..., { q:10, r:5 }]
```

---

## 10. Flujo completo: de semilla a pantalla

```
1. Usuario pulsa "Nuevo mapa aleatorio"
        |
2. randomMapSeed() → "m1abc2d-x7k9p3q2wz"
        |
3. createNoiseTerrainMap(112, 80, { seed })
        |
   Para cada celda (col, row):
        |
4.   sampleTerrainHeight01(col, row)  → FBM Simplex → 0.0 a 1.0
        |
5.   height01ToTerrain(h)  → "water" | "plains" | "hills" | "mountain"
        |
6. GameMap.fromDefinition(...)  → Mapa logico listo
        |
7. buildMapPixelTexture(...)
        |
   Para cada pixel de la textura:
        |
8.   sampleWorld(wx, wy)        → Domain warp
9.   terrainAtSample(sx, sy)    → Shepard blend + undulacion + cuantizar
10.  terrainToRgb(terrain)      → Color del pixel
        |
11. CanvasTexture.putImageData()  → Textura lista
        |
12. Phaser Image.setTexture()     → Visible en pantalla
        |
13. HexGridRenderer.render()      → Rejilla opcional encima
```

---

## 11. Como replicarlo tu mismo

### Paso 1: Setup minimo

```bash
npm create vite@latest mi-hexmap -- --template vanilla-ts
cd mi-hexmap
npm install phaser simplex-noise
```

### Paso 2: Implementar coordenadas hexagonales

Empieza por las conversiones basicas. La referencia definitiva es [Red Blob Games](https://www.redblobgames.com/grids/hexagons/):

1. Define los tipos `AxialCoord` y `OffsetOddRCoord`
2. Implementa las conversiones entre ellos
3. Crea `HexLayout` con `axialToWorld()` y `worldToAxial()`
4. Implementa `getHexCornerPoints()` para dibujar hexagonos

### Paso 3: Generacion procedural

1. Instala `simplex-noise`
2. Crea un PRNG con semilla (o usa la implementacion del proyecto)
3. Implementa FBM: suma 4 octavas de `noise2D` con frecuencia duplicada y amplitud reducida
4. Define umbrales para convertir alturas a tipos de terreno

### Paso 4: Renderizado basico

Empieza simple — dibuja hexagonos rellenos con `Phaser.Graphics`:
```typescript
for (const coord of map.getAllCoords()) {
  const center = layout.axialToWorld(coord);
  const corners = layout.getHexCornerPoints(center);
  graphics.fillStyle(getColor(map.getTerrain(coord)));
  graphics.beginPath();
  // ... dibujar poligono con corners
  graphics.fillPath();
}
```

### Paso 5: Upgrade a textura de pixeles

Cuando el relleno basico funcione, puedes ir agregando capas de complejidad:

1. **CanvasTexture**: crea una textura y pinta pixel por pixel
2. **Shepard blending**: mezcla alturas de hexagonos vecinos para bordes suaves
3. **Domain warp**: agrega ruido simplex para deformar las coordenadas de muestreo
4. **Undulacion**: perturba la altura final para bahias y meandros

### Recursos recomendados

- **Hexagonos**: [Red Blob Games - Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/) — la biblia de los hex grids
- **Ruido procedural**: [Red Blob Games - Noise](https://www.redblobgames.com/articles/noise/introduction.html)
- **Domain Warping**: [Inigo Quilez - Domain Warping](https://iquilezles.org/articles/warp/)
- **Phaser 3**: [Documentacion oficial](https://phaser.io/phaser3)
