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

## Next entry point

Commit, push, and merge SB-04 / issue #5 from `codex/issue-5-box-inventory-ranking` after GitHub CI. Then start SB-05 / issue #6 on a fresh `codex/issue-6-height-corner-reform` branch. Luna implements only the bounded height cut-down and shrink-only corner-reform domain/playbook package; Sol owns contracts/review/Git and a separate tester owns deterministic recipe fixtures. Preserve the Build route and Three/FoldNet files until the later renderer issues.
