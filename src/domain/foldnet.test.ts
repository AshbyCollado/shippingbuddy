import {describe, expect, it} from "vitest";
import {enumerateOrientations, generateWrapPlan, packedEnvelope, PROTOTYPE_PROFILE, type ItemInput} from "./geometry";
import {
  foldNetAtProgress,
  foldNetFromRectangles,
  foldNetFromWrapPlan,
  foldNetPoseDelta,
  foldNetToRectangles,
  triangulateFoldNet,
  validateFoldNet,
  type FoldNet,
  type FoldNetCandidate,
  type FoldNetCrease,
  type FoldNetPlaybookStep,
  type FoldNetValidation,
  type FoldNetVertex,
} from "./foldnet";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};

const orientation = {
  id: "LWH",
  packageDimensions: {lengthMm: 10, widthMm: 10, heightMm: 10},
  packageAxes: ["+L", "+W", "+H"] as const,
  upright: true,
};

function fixturePlan() {
  const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
  const result = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
  if ("error" in result) throw new Error(result.error);
  return result;
}

function simpleNet() {
  return foldNetFromRectangles({
    rectangles: [
      {id: "bottom", xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, role: "PANEL"},
      {id: "flap", xMm: 10, yMm: 0, widthMm: 10, heightMm: 10, role: "FLAP"},
    ],
    scores: [{id: "shared-score", from: {xMm: 10, yMm: 0}, to: {xMm: 10, yMm: 10}}],
    cuts: [{id: "edge-cut", kind: "boundary", from: {xMm: 0, yMm: 0}, to: {xMm: 10, yMm: 0}}],
    scrapRegions: [{
      id: "edge-scrap",
      points: [{xMm: 0, yMm: -2}, {xMm: 10, yMm: -2}, {xMm: 10, yMm: -1}, {xMm: 0, yMm: -1}],
      exitDirection: [0, -1],
    }],
    orientation,
  });
}

function emptyPlaybook(faceIds: readonly string[]): readonly FoldNetPlaybookStep[] {
  return [
    {code: "VERIFY", sequence: 0, label: "Verify", faceIds},
    {code: "SCORE", sequence: 1, label: "Score", scoreIds: []},
    {code: "CUT", sequence: 2, label: "Cut", cutIds: []},
    {code: "SCRAP", sequence: 3, label: "Scrap", scrapIds: []},
    {code: "FOLD", sequence: 4, label: "Fold", creaseIds: []},
    {code: "SEAL", sequence: 5, label: "Seal", faceIds: []},
    {code: "REMEASURE", sequence: 6, label: "Remeasure"},
  ];
}

function polygonNet(points: readonly (readonly [number, number])[], order = points.map((_, index) => `p${index}`)): FoldNet {
  const vertices = points.map(([xMm, yMm], index) => ({id: `p${index}`, xMm, yMm}));
  return {
    metadata: {version: 1, coordinateSystem: "flat-sheet-mm", units: "mm", orientation},
    rootFaceId: "shape",
    vertices,
    faces: [{id: "shape", role: "PANEL", vertexIds: order}],
    scores: [],
    cuts: [],
    scraps: [],
    creases: [],
    steps: [],
    playbook: emptyPlaybook(["shape"]),
  };
}

function validationWithCodes(candidate: FoldNetCandidate, expectedCodes: readonly string[]): FoldNetValidation {
  let result: FoldNetValidation | undefined;
  expect(() => {
    result = validateFoldNet(candidate);
  }).not.toThrow();
  expect(result).toBeDefined();
  const resolved = result!;
  expect(resolved.diagnosticCodes).toEqual([...resolved.diagnosticCodes].sort());
  expect(validateFoldNet(candidate)).toEqual(resolved);
  expectedCodes.forEach((code) => expect(resolved.diagnosticCodes).toContain(code));
  expect(resolved.valid).toBe(false);
  return resolved;
}

function withCreases(net: FoldNet, creases: readonly FoldNetCrease[]): FoldNetCandidate {
  return {
    ...net,
    creases,
    playbook: net.playbook.map((step) => step.code === "FOLD"
      ? {...step, creaseIds: creases.map((crease) => crease.id)}
      : step),
  };
}

function absolutePolygonArea(vertexIds: readonly string[], vertices: ReadonlyMap<string, FoldNetVertex>) {
  return Math.abs(vertexIds.reduce((sum, id, index) => {
    const point = vertices.get(id)!;
    const next = vertices.get(vertexIds[(index + 1) % vertexIds.length])!;
    return sum + point.xMm * next.yMm - next.xMm * point.yMm;
  }, 0) / 2);
}

describe("canonical fold-net adapter and projections", () => {
  it("returns the plan's canonical immutable net without data loss and keeps references stable", () => {
    const plan = fixturePlan();
    const first = foldNetFromWrapPlan(plan);
    const second = foldNetFromWrapPlan(plan);
    const ids = [
      ...first.vertices.map(({id}) => id),
      ...first.faces.map(({id}) => id),
      ...first.scores.map(({id}) => id),
      ...first.cuts.map(({id}) => id),
      ...first.scraps.map(({id}) => id),
      ...first.creases.map(({id}) => id),
    ];

    expect(first).toBe(plan.foldNet);
    expect(second).toBe(first);
    expect(first.rootFaceId).toBe("bottom");
    expect(first.faces).toHaveLength(plan.rectangles.length);
    expect(first.creases).toHaveLength(first.faces.length - 1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateFoldNet(first)).toMatchObject({valid: true, diagnosticCodes: []});
  });

  it("rejects concave and rotated faces from the rectangle compatibility projection", () => {
    const concave = polygonNet([[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]);
    const rotated = polygonNet([[0, 2], [2, 0], [4, 2], [2, 4]]);
    expect(() => foldNetToRectangles(concave)).toThrow(/not an axis-aligned rectangle/);
    expect(() => foldNetToRectangles(rotated)).toThrow(/not an axis-aligned rectangle/);
  });
});

describe("fold-net validation diagnostics", () => {
  it("returns stable identity and coordinate codes for malformed external data", () => {
    const base = simpleNet();
    validationWithCodes({...base, faces: [{...base.faces[0], id: base.vertices[0].id}, ...base.faces.slice(1)]}, ["DUPLICATE_ID"]);
    validationWithCodes({...base, faces: [{...base.faces[0], id: ""}, ...base.faces.slice(1)]}, ["EMPTY_ID"]);
    validationWithCodes({...base, faces: [{...base.faces[0], vertexIds: [...base.faces[0].vertexIds, "missing"]}, ...base.faces.slice(1)]}, ["MISSING_VERTEX"]);
    validationWithCodes({...base, vertices: [{...base.vertices[0], xMm: Number.NaN}, ...base.vertices.slice(1)]}, ["NONFINITE_VERTEX"]);
  });

  it("distinguishes invalid, missing, and zero-length score and cut endpoints", () => {
    const base = simpleNet();
    const score = base.scores[0];
    const cut = base.cuts[0];
    validationWithCodes({...base, scores: [{...score, kind: "hinge" as "score"}]}, ["INVALID_SCORE_KIND"]);
    validationWithCodes({...base, scores: [{...score, fromVertexId: "missing-score-vertex"}]}, ["MISSING_MARK_ENDPOINT"]);
    validationWithCodes({...base, scores: [{...score, toVertexId: score.fromVertexId}]}, ["ZERO_LENGTH_MARK"]);
    validationWithCodes({...base, cuts: [{...cut, fromVertexId: "missing-cut-vertex"}]}, ["MISSING_CUT_ENDPOINT"]);
    validationWithCodes({...base, cuts: [{...cut, toVertexId: cut.fromVertexId}]}, ["ZERO_LENGTH_CUT"]);
  });

  it("rejects degenerate and bow-tie faces and scraps, zero exit directions, and drifted compatibility points", () => {
    validationWithCodes(polygonNet([[0, 0], [2, 0], [4, 0]]), ["DEGENERATE_FACE"]);
    validationWithCodes(polygonNet([[0, 0], [4, 4], [0, 4], [4, 0]]), ["NON_SIMPLE_FACE", "DEGENERATE_FACE"]);

    const base = simpleNet();
    const scrap = base.scraps[0];
    const byId = new Map(base.vertices.map((vertex) => [vertex.id, vertex]));
    const bowTieIds = [scrap.vertexIds[0], scrap.vertexIds[2], scrap.vertexIds[1], scrap.vertexIds[3]];
    validationWithCodes({...base, scraps: [{...scrap, vertexIds: bowTieIds, points: bowTieIds.map((id) => byId.get(id)!)}]}, ["INVALID_SCRAP"]);
    validationWithCodes({...base, scraps: [{...scrap, vertexIds: [scrap.vertexIds[0], scrap.vertexIds[1], scrap.vertexIds[1]], points: [scrap.points[0], scrap.points[1], scrap.points[1]]}]}, ["INVALID_SCRAP"]);
    validationWithCodes({...base, scraps: [{...scrap, exitDirection: [0, 0]}]}, ["INVALID_SCRAP"]);
    validationWithCodes({...base, scraps: [{...scrap, points: [{...scrap.points[0], xMm: scrap.points[0].xMm + 0.1}, ...scrap.points.slice(1)]}]}, ["INVALID_SCRAP"]);
    validationWithCodes({...base, scraps: [{...scrap, vertexIds: [...scrap.vertexIds.slice(0, -1), "missing-scrap-vertex"]}]}, ["MISSING_SCRAP_ENDPOINT"]);
  });

  it("separates missing crease endpoints from existing endpoints that are not on both faces", () => {
    const base = simpleNet();
    const crease = base.creases[0];
    validationWithCodes({...base, creases: [{...crease, fromVertexId: "missing-crease-vertex"}]}, ["MISSING_CREASE_ENDPOINT"]);
    const offFaceVertex = base.vertices.find((vertex) => vertex.yMm === -2)!;
    const result = validationWithCodes({...base, creases: [{...crease, fromVertexId: offFaceVertex.id}]}, ["CREASE_ENDPOINT_NOT_ON_FACE"]);
    expect(result.diagnosticCodes).not.toContain("MISSING_CREASE_ENDPOINT");
  });

  it("reports missing roots, directed orphans, cycles, multiple parents, and root parents", () => {
    const base = simpleNet();
    validationWithCodes({...base, rootFaceId: "missing-root"}, ["MISSING_ROOT", "DISCONNECTED"]);
    validationWithCodes(withCreases(base, []), ["DISCONNECTED"]);

    const crease = base.creases[0];
    const reversed = {...crease, id: "reverse-crease", parentFaceId: crease.childFaceId, childFaceId: crease.parentFaceId};
    const directedOrphan = validationWithCodes(withCreases(base, [reversed]), ["DISCONNECTED", "CYCLE"]);
    expect(directedOrphan.errors).toContain(`root face has a parent: ${base.rootFaceId}`);

    validationWithCodes(withCreases(base, [crease, reversed]), ["CYCLE"]);
    const duplicateParent = {...crease, id: "second-parent-crease"};
    const multipleParents = validationWithCodes(withCreases(base, [crease, duplicateParent]), ["CYCLE"]);
    expect(multipleParents.errors).toContain(`face has multiple crease parents: ${crease.childFaceId}`);
  });

  it("rejects missing or unsupported metadata and malformed orientation axes", () => {
    const base = simpleNet();
    validationWithCodes({...base, metadata: undefined}, ["MISSING_METADATA"]);
    validationWithCodes({...base, metadata: {...base.metadata, version: 2 as 1}}, ["UNSUPPORTED_VERSION"]);
    validationWithCodes({...base, metadata: {...base.metadata, units: "in" as "mm"}}, ["INVALID_COORDINATE_SYSTEM"]);
    validationWithCodes({...base, metadata: {...base.metadata, orientation: {...base.metadata.orientation, packageAxes: ["+L", "+L", "+H"]}}}, ["MISSING_METADATA"]);
    validationWithCodes({...base, metadata: {...base.metadata, orientation: {...base.metadata.orientation, packageAxes: ["+L", "+W", "sideways" as "+H"]}}}, ["MISSING_METADATA"]);
  });

  it("requires one ordered, correctly bound playbook step per code with complete unique coverage", () => {
    const base = simpleNet();
    const scoreStep = base.playbook.find((step) => step.code === "SCORE")!;
    const cutId = base.cuts[0].id;
    const variants: FoldNetCandidate[] = [
      {...base, playbook: undefined},
      {...base, playbook: base.playbook.filter((step) => step.code !== "SCORE")},
      {...base, playbook: [...base.playbook, {...scoreStep, sequence: base.playbook.length}]},
      {...base, playbook: base.playbook.map((step) => step.code === "SCORE" ? {...step, cutIds: [cutId]} : step)},
      {...base, playbook: base.playbook.map((step) => step.code === "SCORE" ? {...step, scoreIds: []} : step)},
      {...base, playbook: base.playbook.map((step) => step.code === "SCORE" ? {...step, scoreIds: [base.scores[0].id, base.scores[0].id]} : step)},
      {...base, playbook: base.playbook.map((step) => step.code === "SCORE" ? {...step, scoreIds: [cutId]} : step)},
    ];
    variants.forEach((candidate) => validationWithCodes(candidate, ["INVALID_PLAYBOOK_REFERENCE"]));
  });
});

describe("fold-net triangulation", () => {
  it("triangulates clockwise and counter-clockwise concave L faces to n-2 with area preservation", () => {
    const points = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]] as const;
    for (const net of [polygonNet(points), polygonNet(points, points.map((_, index) => `p${points.length - index - 1}`))]) {
      const result = triangulateFoldNet(net);
      const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
      const triangleArea = result.triangles.reduce((sum, triangle) => sum + absolutePolygonArea(triangle.vertexIds, vertices), 0);
      expect(result.diagnostics).toEqual({faceIds: [], errors: [], codes: []});
      expect(result.triangles).toHaveLength(net.faces[0].vertexIds.length - 2);
      expect(triangleArea).toBeCloseTo(absolutePolygonArea(net.faces[0].vertexIds, vertices), 10);
    }
  });

  it("prunes collinear split edges from generated faces before triangulation", () => {
    const net = fixturePlan().foldNet;
    const splitFaces = net.faces.filter((face) => face.vertexIds.length > 4);
    const result = triangulateFoldNet(net);
    expect(splitFaces.length).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual({faceIds: [], errors: [], codes: []});
    splitFaces.forEach((face) => expect(result.triangles.filter((triangle) => triangle.faceId === face.id)).toHaveLength(2));
  });

  it("emits diagnostics and no partial triangles for invalid faces", () => {
    for (const net of [polygonNet([[0, 0], [4, 4], [0, 4], [4, 0]]), polygonNet([[0, 0], [2, 0], [4, 0]])]) {
      const result = triangulateFoldNet(net);
      expect(result.triangles).toEqual([]);
      expect(result.diagnostics.codes.length).toBeGreaterThan(0);
      expect(result.diagnostics.faceIds).toContain("shape");
    }
  });
});

describe("fold-net poses", () => {
  it("is deterministic and rigid at reveal, midpoint, and folded checkpoints", () => {
    const net = fixturePlan().foldNet;
    for (const progress of [0, 0.5, 1]) {
      const first = foldNetAtProgress(net, progress);
      const second = foldNetAtProgress(net, progress);
      expect(first.progress).toBe(progress);
      expect(foldNetPoseDelta(first, second)).toBe(0);
      expect(first.diagnostics).toMatchObject({
        connected: true,
        detachedFaceIds: [],
        nonFiniteValues: false,
        missingVertexIds: [],
        creaseTearIds: [],
        inversionFaceIds: [],
      });
      expect(first.diagnostics.maxHingeGapMm).toBeLessThan(0.000001);
      expect(first.diagnostics.maxEdgeStretchMm).toBeLessThan(0.000001);
      expect(first.faces.every((face) => face.vertices.every((vertex) => [vertex.xMm, vertex.yMm, vertex.zMm].every(Number.isFinite)))).toBe(true);
    }
  });

  it("keeps a malformed face visible and debuggable", () => {
    const base = polygonNet([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const malformed: FoldNet = {...base, faces: [{...base.faces[0], vertexIds: [...base.faces[0].vertexIds.slice(0, -1), "missing-face-vertex"]}]};
    const pose = foldNetAtProgress(malformed, 0.5);
    expect(pose.faces).toHaveLength(1);
    expect(pose.faces[0].faceId).toBe("shape");
    expect(pose.diagnostics.nonFiniteValues).toBe(true);
    expect(pose.diagnostics.missingVertexIds).toContain("missing-face-vertex");
    expect(pose.faces[0].vertices.some((vertex) => ![vertex.xMm, vertex.yMm, vertex.zMm].every(Number.isFinite))).toBe(true);
  });
});
