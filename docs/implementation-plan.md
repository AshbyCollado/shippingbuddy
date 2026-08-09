# Implementation plan — completed

1. Freeze serializable domain contracts and unit rules, including inch-first quarter-inch checkpoints and synchronized millimetre conversion.
2. Implement deterministic orientation, packed-envelope, wrap-net, automatic direct/rotated sheet fitting, exposed cut/scrap geometry, SVG export, and fixture tests.
3. Connect the responsive form to the same live generated plan used by the visual result; committed quantity fields retain drafts safely and advance through useful checkpoints with arrows or focused-wheel scrolling.
4. Add accessible result tabs, playback controls, plain-language source/clearance guidance, clickable common-box cards, and distinct flat-sheet, common-box, and existing-box states.
5. Drive the client-only R3F preview from the generated plan with semantic wrap/RSC/existing-box checkpoints, visible score/cut/scrap stages, and final seam presentation.
6. Verify with unit tests, Playwright customer flows, desktop/mobile walkthroughs, lint, typecheck, and production build.
