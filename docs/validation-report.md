# Validation report

## Software validation

The current build has passing unit tests, typecheck, lint, Playwright browser tests, and production build. The customer-flow suite captures all eleven wrap checkpoints; the visible R3F scene shows generated score/cut overlays, the cutter stage, generated scrap regions, folded panels, closed flaps, and final seam without detached panels. Play advances the playhead, Pause holds it, Replay resets it, Previous/Next clamp at the endpoints, and 2× playback reaches 100%. Flat-sheet, every common-box card (including rejection and larger-box suggestion), existing-box inputs, advanced-clearance help, integer protection goals, automatic sheet expansion, and all three result tabs are exercised. Existing 390 px mobile and 320 px compact-layout checks remain covered by Playwright; no horizontal overflow is observed.

The animation-specific regression coverage is in `tests/e2e/shipping-buddy.spec.ts` and `src/domain/animation.test.ts`. It verifies stage labels, the R3F canvas, generated panel/cut/scrap counts, cut/seal progress attributes, detached-panel and seam invariants, timed playback, pause stability, existing-box no-cut behavior, and playback speed selection. Checkpoint screenshots are emitted under `test-results/` during the Playwright run.

## Physical validation

Not tested. The geometry is a visual prototype, not a physical collision or fold solver. Before treating any cutting layout as production guidance, build and measure representative small, medium, non-cubic, unchanged-RSC, and height-reduction samples. Record actual dimensions, tab usability, flap alignment, corner closure, fit, and calibration changes.
