# Shipping Buddy

Shipping Buddy is a local-first packaging prototype: enter a measured item envelope, choose a parametric shape and construction profile, and get a calculated FoldNet layout with a responsive corrugated-cardboard preview, SVG dieline, and numbered build steps. Flat-sheet plans use modern immutable fold data; common and existing boxes stay separate RSC assembly workflows.

## Run it

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The current prototype is geometry-driven and intentionally does not claim carrier compliance, structural safety, or physical validation.

## Rendering references

The corrugated face geometry and hinge hierarchy are a modern Three.js/R3F adaptation of the MIT-licensed [Threejs-folding-cardboard-box-tutorial](https://github.com/uuuulala/Threejs-folding-cardboard-box-tutorial). The immutable FoldNet/playbook ideas are an independent modern implementation guided by the MIT-licensed [georgiee/origami](https://github.com/georgiee/origami) project; its legacy Three r86 runtime is not installed.
