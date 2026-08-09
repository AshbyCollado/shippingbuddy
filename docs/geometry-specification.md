# Geometry specification

`WRAP_BOX_V1` uses the audited formulas:

```text
BL = L + t
BW = W + 3t
WH = H + t
```

Tabs are projected outside the packed envelope. The five-part side-wall collision decomposition and fixture values are encoded in `src/domain/geometry.ts` and `src/domain/geometry.test.ts`.
