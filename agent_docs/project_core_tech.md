# Core technology and invariants

## Current stack

- Next.js 16.3 App Router, React 19.2, and TypeScript.
- Three.js r185 with React Three Fiber and Drei.
- GSAP for controlled animation sequencing.
- Vitest for domain/component tests and Playwright for customer-flow verification.
- pnpm workspace tooling.

Agents must read the relevant bundled Next.js guide under `node_modules/next/dist/docs/` before changing framework code.

## Geometry invariants

- Canonical dimensions use millimetres; UI formatting and input adapters expose inches by default.
- Fit calculations use usable inside dimensions and propagate selected orientation.
- Item envelope, cuts, scores, scrap, fold poses, instructions, and export paths derive from one immutable plan/playbook contract.
- Face identities remain stable from flat layout through final assembly.
- Diagnostics report non-finite geometry, hinge gaps, edge stretch, inversions, collisions, and seam readiness.

## Renderer invariants

- The uuuulala Three.js folding-cardboard tutorial is the initial golden baseline for geometry layering, corrugated flute, fold-edge attenuation, normals, hierarchy, pivots, lighting, camera, and easing.
- The legacy Georgiee origami runtime is a conceptual reference only; no Three r86/`THREE.Geometry` dependency.
- One canvas, demand rendering while idle, cached/disposed geometry, adaptive DPR/shadows, and explicit quality tiers.
- Performance targets: median at least 55 fps on the desktop acceptance viewport and 30 fps at 320–390 px mobile during animation.
