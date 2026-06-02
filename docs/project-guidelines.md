# Project Guidelines

## Core Technical Rules
- The project must be implemented in TypeScript.
- TypeScript strict mode is mandatory.
- The `any` type is forbidden.
- Source code identifiers, comments, and commit messages must be in English.
- Keep modules focused and small; avoid god objects and broad utility classes.

## Architecture Principles
- Organize by subsystem (`game`, `scenes`, `hex`, `maps`, `render`).
- Apply low-coupling/high-cohesion design.
- Prefer explicit interfaces between subsystems.
- Use design patterns where they improve maintainability:
  - `Facade` for public subsystem APIs.
  - `Strategy` for replaceable behaviors (example: pathfinding blocking rule).
  - `Factory` for map/scenario creation when needed.
- Follow Single Responsibility per class/file.

## Rendering and Engine Constraints
- Engine: Phaser `3.90.0`.
- Renderer: WebGL.
- Base resolution: `1280x720`.
- The game must be responsive using Phaser scale management.
- Pixel-art rendering is required (`pixelArt: true`, no antialiasing).

## Hex Grid Standards
- Use axial coordinates as the primary hex coordinate system.
- Support conversion between axial and cube representations.
- Provide reusable APIs for:
  - Neighbors.
  - Distance.
  - Coordinate conversions (grid <-> world).
  - Pathfinding (A* baseline).
- Keep map-data concerns separated from rendering concerns.

## Quality and Collaboration
- Run type checks before merging.
- Add concise comments only where logic is non-obvious.
- Keep public APIs stable and documented with clear names.
- Prefer deterministic functions for core game logic (pure logic where possible).
