# Latest session handoff

## Current state

- The durable Shipping Buddy v0.2 goal is active under the project-local Sol-manager/Luna-executor workflow.
- The private `AshbyCollado/shippingbuddy` baseline, rollback tag, milestone, issue tree, and passing GitHub Actions baseline exist.
- SB-02 / issue #3 is merged through PR #16 and replaces the monolithic planner entry with `/plan/item`, `/plan/protection`, `/plan/source`, `/plan/fit`, and `/plan/build` routes plus a versioned, validated, local persisted draft.
- Luna owns production implementation; an independent tester owns tests; Sol owns architecture, review, Git, issues, and release gates.
- SB-02 evidence: typecheck/build pass; full lint pass; 39 unit tests pass; 4 Playwright flows pass; live desktop and 320 px walkthrough passes with reload persistence, no horizontal overflow, no pre-Build canvas, and no console warnings/errors.
- SB-03 / issue #4 adds four truthful measured item profiles, per-face protection arithmetic, upward quarter-inch/whole-mm commits, one orientation-aware fit assessment, exact deficits/extra room, and shared Fit/Build summaries.
- SB-03 evidence: full lint/build pass; 48 unit tests pass; 5 Playwright flows pass; live `16 + 1 + 1 + 0.24 = 18.24 in` fixture and 18-inch-box shortfall pass at desktop/320 px with no canvas or console issues.
- SB-04 / issue #5 adds saved boxes that persist independently from draft JSON, explicit inside/outside/not-sure measurement basis, conservative two-wall thickness/uncertainty conversion, fit-first catalog cards without silent selection changes, a representative 20-inch cube, and a deterministic method-ranking seam for later recipes.
- SB-04 evidence: full lint/build pass; 58 unit tests pass; 7 Playwright flows pass; live desktop/390/320 px walkthrough confirms exact deficits, precise `0.157 in` wall input, conservative `20.50 in` outside to `20.11 in` usable inside resolution, saved-box reload, unknown-measurement blocking, selected too-small-card retention, no pre-renderer canvas, no horizontal overflow, and no browser console errors.
- SB-04 is merged through PR #18 (`c52f2fa`) after both GitHub CI runs passed; issue #5 is closed with evidence and the epic checkbox is complete.
- SB-05 / issue #6 adds immutable `RSC_HEIGHT_CUT_DOWN_V1` and shrink-only `RSC_CORNER_REFORM_V1` plans with stable diagnostics, scalar score/cut/scrap marks, ordered playbooks, strict source/stock/overlap boundaries, prototype warnings, and mandatory final remeasurement. It never claims enlargement, strength, carrier, or manufacturing compliance.
- SB-05 evidence: full lint/build pass; 62 unit tests pass; exact 394 mm height-stock boundary passes while 394.01 mm rejects; one-axis reform ignores untouched-side allowance; symmetric/unequal splits, epsilon noise, invalid anchors, insufficient stock/overlap, damaged/stapled/unknown sources, scalar-only output, stable terminal REMEASURE steps, and deep immutability pass.

## Next entry point

Commit, push, and merge SB-05 / issue #6 from `codex/issue-6-height-corner-reform` after GitHub CI. Then start SB-06 / issue #7 on a fresh branch. Luna implements the reject-by-default measured one-axis quick-shrink and precise opened-blank RSC rebuild domain packages; Sol owns contracts/review/Git and a separate tester owns equation/closure/rejection fixtures. Preserve route UI and Three/FoldNet files until their later issues.
