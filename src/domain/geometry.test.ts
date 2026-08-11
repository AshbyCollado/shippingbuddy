import {describe, expect, it} from "vitest";
import {COMMON_BOXES, FRAGILITY_PRESETS, PROTECTION_GOAL_MM, PROTOTYPE_PROFILE, autoFitSheet, chooseWrapOrientation, enumerateOrientations, fitsSheet, generateCommonBoxPlan, generateMailerPlan, generateTabInsertPlan, generateWrapPlan, packedEnvelope, protectionGoalToMm, renderWrapSvg, type ItemInput} from "./geometry";
import {foldNetAtProgress, foldNetFromWrapPlan, foldNetToCuts, foldNetToRectangles, foldNetToScores, foldNetToScrapRegions, validateFoldNet, type FoldNet} from "./foldnet";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};

function expectDeepFrozen(value: unknown, seen = new Set<object>()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value as Record<string, unknown>).forEach((child) => expectDeepFrozen(child, seen));
}

function expectIdBoundPlaybook(net: FoldNet) {
  expect(net.playbook.map((step) => step.code)).toEqual(["VERIFY", "SCORE", "CUT", "SCRAP", "FOLD", "SEAL", "REMEASURE"]);
  const byCode = new Map(net.playbook.map((step) => [step.code, step]));
  expect(byCode.get("VERIFY")?.faceIds).toEqual(net.faces.map(({id}) => id));
  expect(byCode.get("SCORE")?.scoreIds).toEqual(net.scores.map(({id}) => id));
  expect(byCode.get("CUT")?.cutIds).toEqual(net.cuts.map(({id}) => id));
  expect(byCode.get("SCRAP")?.scrapIds).toEqual(net.scraps.map(({id}) => id));
  expect(byCode.get("FOLD")?.creaseIds).toEqual(net.creases.map(({id}) => id));
  expect(byCode.get("SEAL")?.seamIds).toEqual(net.seams.map(({id}) => id));
}

function overlapsBoundarySegment(
  firstFrom: {readonly xMm: number; readonly yMm: number},
  firstTo: {readonly xMm: number; readonly yMm: number},
  secondFrom: {readonly xMm: number; readonly yMm: number},
  secondTo: {readonly xMm: number; readonly yMm: number},
) {
  const dx = firstTo.xMm - firstFrom.xMm;
  const dy = firstTo.yMm - firstFrom.yMm;
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return false;
  const cross = (point: {readonly xMm: number; readonly yMm: number}) =>
    dx * (point.yMm - firstFrom.yMm) -
    dy * (point.xMm - firstFrom.xMm);
  if (
    Math.abs(cross(secondFrom)) > 0.000001 ||
    Math.abs(cross(secondTo)) > 0.000001
  )
    return false;
  const ux = dx / length;
  const uy = dy / length;
  const projections = [secondFrom, secondTo].map(
    (point) =>
      (point.xMm - firstFrom.xMm) * ux +
      (point.yMm - firstFrom.yMm) * uy,
  );
  return (
    Math.min(length, Math.max(...projections)) -
      Math.max(0, Math.min(...projections)) >
    0.000001
  );
}

function expectedScrapCutIds(net: FoldNet, scrapId: string) {
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  const scrap = net.scraps.find(({id}) => id === scrapId)!;
  return net.cuts
    .filter((cut) => {
      const from = vertices.get(cut.fromVertexId)!;
      const to = vertices.get(cut.toVertexId)!;
      return scrap.vertexIds.some((id, index) =>
        overlapsBoundarySegment(
          from,
          to,
          vertices.get(id)!,
          vertices.get(scrap.vertexIds[(index + 1) % scrap.vertexIds.length])!,
        ),
      );
    })
    .map(({id}) => id);
}

function foldedVertex(net: FoldNet, faceId: string, vertexId: string) {
  const face = net.faces.find(({id}) => id === faceId)!;
  const pose = foldNetAtProgress(net, 1).faces.find(
    (candidate) => candidate.faceId === faceId,
  )!;
  return pose.vertices[face.vertexIds.indexOf(vertexId)];
}

describe("Shipping Buddy geometry", () => {
  it("enumerates six right-handed orientations", () => {
    expect(enumerateOrientations(item)).toHaveLength(6);
    expect(enumerateOrientations({...item, keepUpright: true})).toHaveLength(2);
  });

  it("creates the audited wrap fixture", () => {
    const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
    const plan = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.metrics.netWidthMm).toBe(978);
    expect(plan.metrics.netHeightMm).toBe(1298);
    expect(plan.metrics.requiredSheetWidthMm).toBe(988);
    expect(plan.metrics.requiredSheetHeightMm).toBe(1308);
    expect(plan.scrapRegions).toHaveLength(4);
    expect(plan.metrics.scrapAreaMm2).toBeGreaterThan(0);
    expect(plan.metrics.cutCount).toBeGreaterThan(6);
    expect(plan.scrapRegions.every((region) => region.points.length >= 4)).toBe(true);
    expect(fitsSheet(plan, {lengthMm: 1000, widthMm: 1320}).fits).toBe(true);
    expect(fitsSheet(plan, {lengthMm: 980, widthMm: 1320}).fits).toBe(false);
  });

  it("rejects a tab geometry that is too small", () => {
    const small = {...item, dimensions: {lengthMm: 100, widthMm: 100, heightMm: 100}};
    const plan = generateWrapPlan(packedEnvelope(small, enumerateOrientations(small)[0]));
    expect("error" in plan).toBe(true);
  });

  it("keeps the fragility suggestions explicit and editable", () => {
    expect(FRAGILITY_PRESETS.VERY_HIGH).toBe(76.2);
  });

  it("maps protection goals to whole-number customer choices", () => {
    expect(PROTECTION_GOAL_MM).toEqual({1: 12.7, 2: 25.4, 3: 38.1, 4: 50.8, 5: 76.2});
    expect(protectionGoalToMm(2)).toBe(25.4);
  });

  it("auto-grows a short sheet without shrinking existing material", () => {
    const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
    const plan = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(autoFitSheet(plan, {lengthMm: 980, widthMm: 1320})).toEqual({lengthMm: 990.6, widthMm: 1320, orientation: "direct"});
    expect(autoFitSheet(plan, {lengthMm: 1200, widthMm: 1600})).toEqual({lengthMm: 1200, widthMm: 1600, orientation: "unchanged"});
  });

  it("chooses the lower-growth rotated sheet when it is smaller", () => {
    const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
    const plan = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(autoFitSheet(plan, {lengthMm: 1000, widthMm: 500}).orientation).toBe("rotated");
  });

  it("keeps the selected catalog box on rejection and returns its fit orientation", () => {
    const tooSmall = generateCommonBoxPlan(item, "COMMON_BOX", COMMON_BOXES[0]);
    expect("error" in tooSmall).toBe(true);
    if (!("error" in tooSmall)) return;
    expect(tooSmall.error).toContain(COMMON_BOXES[0].name);
    const fitting = generateCommonBoxPlan(item, "COMMON_BOX", COMMON_BOXES[1]);
    expect("error" in fitting).toBe(false);
    if ("error" in fitting) return;
    expect(fitting.sourceMode).toBe("COMMON_BOX");
    expect(fitting.orientationId).toBe("LWH");
  });

  it("exports the same geometry used by the preview", () => {
    const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
    const plan = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    const svg = renderWrapSvg(plan);
    expect(svg).toContain("Shipping Buddy wrap box cutting layout");
    expect(svg).toContain("calibration bar");
    expect(svg.match(/<polygon/g)?.length).toBe(plan.foldNet.faces.length);
    expect(svg.match(/class="score"/g)?.length).toBe(plan.scores.length);
  });

  it("keeps parametric profiles and construction patterns in the same fold authority", () => {
    const shaped = {...item, shapeProfile: {kind: "CYLINDER_TUBE" as const, radiusMm: 90}};
    const envelope = packedEnvelope(shaped, enumerateOrientations(shaped)[0]);
    expect(envelope.itemProfile.kind).toBe("CYLINDER_TUBE");
    const mailer = generateMailerPlan(envelope);
    const insert = generateTabInsertPlan(envelope);
    expect("error" in mailer).toBe(false);
    expect("error" in insert).toBe(false);
    if (!("error" in mailer) && !("error" in insert)) {
      expect(mailer.patternId).toBe("MAILER_BOX_V1");
      expect(insert.patternId).toBe("TAB_INSERT_V1");
      expect(mailer.scores.some((score) => score.id === "mailer-tuck-score")).toBe(true);
      expect(insert.cuts.some((cut) => cut.id === "partition-relief-cut")).toBe(true);
      expect(mailer.foldNet.faces.length).toBe(mailer.rectangles.length);
    }
  });

  it("generates stable canonical WRAP, MAILER, and TAB nets with lossless legacy projections", () => {
    const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
    const results = [
      generateWrapPlan(envelope),
      generateMailerPlan(envelope),
      generateTabInsertPlan(envelope),
    ];
    const expectedPatterns = ["WRAP_BOX_V1", "MAILER_BOX_V1", "TAB_INSERT_V1"];
    results.forEach((result, index) => {
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      const net = result.foldNet;
      expect(result.patternId).toBe(expectedPatterns[index]);
      expect(net.metadata).toEqual({
        version: 1,
        coordinateSystem: "flat-sheet-mm",
        units: "mm",
        orientation: envelope.orientation,
      });
      expect(validateFoldNet(net)).toMatchObject({valid: true, diagnosticCodes: []});
      expect(foldNetFromWrapPlan(result)).toBe(net);
      expectDeepFrozen(net);

      const ids = [
        ...net.vertices.map(({id}) => id),
        ...net.faces.map(({id}) => id),
        ...net.scores.map(({id}) => id),
        ...net.cuts.map(({id}) => id),
        ...net.scraps.map(({id}) => id),
        ...net.seams.map(({id}) => id),
        ...net.creases.map(({id}) => id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
      expect(net.cuts.every((cut) => ["boundary", "relief", "slot", "seam", "trim", "lock"].includes(cut.kind))).toBe(true);
      expect(Object.fromEntries(net.scraps.map((scrap) => [scrap.id, scrap.exitDirection]))).toEqual({
        "scrap-left": [-1, 0],
        "scrap-right": [1, 0],
        "scrap-top": [0, -1],
        "scrap-bottom": [0, 1],
      });
      expect(Object.fromEntries(net.scraps.map(({id, cutIds}) => [id, cutIds]))).toEqual({
        "scrap-left": ["cut-17"],
        "scrap-right": ["cut-22"],
        "scrap-top": ["cut-23"],
        "scrap-bottom": ["cut-26"],
      });
      expect(net.scraps).toHaveLength(4);
      net.scraps.forEach((scrap) => {
        expect(scrap.cutIds.length).toBeGreaterThan(0);
        expect(scrap.cutIds).toEqual(expectedScrapCutIds(net, scrap.id));
      });
      expect(net.seams).toMatchObject([
        {
          id: "top-flap-tape-seam",
          kind: "tape",
          matingEdges: [
            {faceId: "front-flap"},
            {faceId: "back-flap"},
          ],
          expectedGapMm: 4,
          toleranceMm: 1,
        },
      ]);
      const vertexById = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
      expect(net.seams[0].matingEdges.map((edge) => [
        vertexById.get(edge.fromVertexId),
        vertexById.get(edge.toVertexId),
      ])).toEqual([
        [
          expect.objectContaining({xMm: 3, yMm: -478}),
          expect.objectContaining({xMm: 357, yMm: -478}),
        ],
        [
          expect.objectContaining({xMm: 357, yMm: 820}),
          expect.objectContaining({xMm: 3, yMm: 820}),
        ],
      ]);
      net.seams[0].matingEdges.forEach((edge, edgeIndex) => {
        const face = net.faces.find(({id}) => id === edge.faceId)!;
        const faceY = face.vertexIds.map((id) => vertexById.get(id)!.yMm);
        const freeEdgeY = edgeIndex === 0 ? Math.min(...faceY) : Math.max(...faceY);
        expect(vertexById.get(edge.fromVertexId)?.yMm).toBe(freeEdgeY);
        expect(vertexById.get(edge.toVertexId)?.yMm).toBe(freeEdgeY);
      });
      const [frontEdge, backEdge] = net.seams[0].matingEdges;
      const pairedDistances = [
        [
          foldedVertex(net, frontEdge.faceId, frontEdge.fromVertexId),
          foldedVertex(net, backEdge.faceId, backEdge.toVertexId),
        ],
        [
          foldedVertex(net, frontEdge.faceId, frontEdge.toVertexId),
          foldedVertex(net, backEdge.faceId, backEdge.fromVertexId),
        ],
      ].map(([from, to]) => Math.hypot(
        to.xMm - from.xMm,
        to.yMm - from.yMm,
        to.zMm - from.zMm,
      ));
      pairedDistances.forEach((distance) =>
        expect(distance).toBeCloseTo(net.seams[0].expectedGapMm, 8),
      );
      expectIdBoundPlaybook(net);

      expect(result.rectangles).toEqual(foldNetToRectangles(net));
      expect(result.scores).toEqual(foldNetToScores(net));
      expect(result.cuts).toEqual(foldNetToCuts(net));
      expect(result.scrapRegions).toEqual(foldNetToScrapRegions(net).map(({id, points}) => ({id, points})));
      expect(result.scrapRegions).toHaveLength(net.scraps.length);
    });

    const wrap = results[0];
    const mailer = results[1];
    const tab = results[2];
    if (!("error" in wrap) && !("error" in mailer) && !("error" in tab)) {
      expect(generateWrapPlan(envelope)).toEqual(wrap);
      expect(generateMailerPlan(envelope)).toEqual(mailer);
      expect(generateTabInsertPlan(envelope)).toEqual(tab);
      expect(mailer.foldNet.cuts.find(({id}) => id === "mailer-lock-cut")?.kind).toBe("lock");
      expect(tab.foldNet.cuts.find(({id}) => id === "partition-relief-cut")?.kind).toBe("relief");
    }
  });

  it("propagates the selected stock orientation into the generated plan", () => {
    const chosen = chooseWrapOrientation(item, {lengthMm: 500, widthMm: 2000});
    expect(chosen.id).toBeTruthy();
  });
});
