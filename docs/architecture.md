# Architecture

The pure geometry layer lives in `src/domain/geometry.ts`; reduction and strength rules are isolated in `src/domain/reduction.ts` and `src/domain/strength.ts`. React consumes those outputs; it does not calculate panel dimensions or cut paths. The result surface contains the preview, metrics, SVG layout, and written instructions derived from the same plan.

The presentation uses a client-only Three/R3F adapter. The domain model remains authoritative: the renderer receives generated rectangles, scores, cuts, scrap regions, and package dimensions rather than recalculating geometry in the scene.
