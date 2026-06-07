Aquí tienes el resumen consolidado de todo lo que hemos diseñado y estructurado hasta ahora para tu juego de hextiles:

---

## 1. Arquitectura del Servidor y Pipeline de Mapas

Pasamos de un renderizado simple en un solo bucle a un **Pipeline de Generación Secuencial**. La información de cada hexágono se procesa paso a paso, enriqueciendo la estructura de datos de cada `MapTile`:

```
[Elevación (Noise)] ➔ [Humedad Base] ➔ [Algoritmo de Ríos] ➔ [Modificación de Humedad] ➔ [Asignación de Biomas] ➔ [Spawns y Recursos]

```

---

## 2. Lógica de Clima, Altitud e Hidrografía

* **Influencia de la Altitud:** La elevación resta temperatura directamente a la latitud del hexágono ($T_{\text{final}} = T_{\text{latitud}} - (\text{Elevación} \times \text{Factor})$). Esto genera una zonación vertical (montañas con bases cálidas y cumbres nevadas).
* **Dinámica de los Ríos:** Nacen en zonas altas y húmedas, descienden buscando el vecino con menor elevación hasta llegar al mar, y saturan de humedad los hexágonos por donde pasan (creando valles fértiles u oasis).
* **Sombra de Lluvia:** El viento predominante bloquea la humedad al chocar con cadenas montañosas, creando zonas áridas (desiertos/estepas) del lado opuesto.

---

## 3. Matriz de Biomas y Actividades Económicas

Definimos la clasificación de terrenos cruzando **Temperatura, Humedad y Altura** (basado en el diagrama de Whittaker) y les asignamos mecánicas de juego:

* **Zonas Cálidas (Alta Temp):** Desierto (Comercio/Caravanas), Sabana (Ganadería), Selva (Maderas exóticas/Farmacia).
* **Zonas Templadas (Media Temp):** Pradera (Agricultura/Ciudades), Bosque (Silvicultura), Pantano (Turba/Carbón).
* **Zonas Frías (Baja Temp):** Tundra (Pieles), Taiga (Madera resistente), Glaciar/Picos (Fe/Monasterios).
* **Zonas Especiales:** Alta Montaña (Minería pesada), Océano (Pesca/Astilleros).

---

## 4. Game Design: Crecimiento Poblacional

Para la reproducción y crecimiento de las ciudades, estructuramos tres pilares de gamificación:

* **Motores:** El *excedente* de alimento impulsa la natalidad pasiva.
* **Modificadores Simbólicos:** La **Fe** activa dogmas de natalidad o atrae inmigración (peregrinos); la **Felicidad** genera atractivo migratorio; la **Seguridad** frena la natalidad si hay enemigos cerca.
* **Frenos/Límites:** El espacio de vivienda en el hexágono dictamina el tope de población (*cap*). El hacinamiento genera insalubridad/plagas, y la presión fiscal (impuestos altos) provoca emigración.

---

## 5. Referencias de Lore y Balanceo Post-Mapa

* **Orden de Ubicación:** Primero se genera el mundo completo con sus reglas físicas. Luego, mediante algoritmos como *Farthest Point Sampling*, se calculan los puntos de partida de los jugadores para que estén distantes y equilibrados en recursos iniciales.
* **Razas de Fantasía:** Definimos la estética y trasfondo de los **Tieflings** (humanoides de herencia infernal) y sus contrapartes o variantes similares: *Aasimar* (celestiales), *Genasi* (elementales), *Cambion* (semi-demonios directos) y *Dhampir* (semi-vampiros).