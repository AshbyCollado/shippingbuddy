# Project structure

## Current ownership

- `src/app/`: Next.js application entry and current planner UI.
- `src/components/`: planner controls, dieline, and Three/R3F preview components.
- `src/domain/`: dimensions, fit, box catalog, geometry, animation, and FoldNet logic.
- `tests/`: Playwright customer flows and visual checks.
- `scripts/`: local launch and QA helpers.
- `qa-screenshots/`: visual evidence; generated artifacts must remain intentionally managed.

## Target ownership

- Route-scoped planner screens under `src/app/plan/` for item, protection, source, fit, review, and build.
- A versioned local draft/project store isolated from route components.
- Pure domain modules for item profiles, measurement uncertainty, fit assessment, method ranking, each box transformation, and build playbooks.
- A canonical polygon/FoldNet export boundary shared by dieline and 3D rendering.
- Tutorial-parity cardboard geometry, RSC rig, camera rig, cut/score tools, and playbook renderer as focused modules rather than one scene file.
- Tests organized around domain fixtures, route contracts, synchronized stage behavior, visual midpoint evidence, and performance/leak instrumentation.

Source files remain the authority. Update this document when verified ownership changes.
