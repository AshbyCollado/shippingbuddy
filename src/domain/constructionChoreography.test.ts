import {describe, expect, it} from "vitest";
import {
  constructionFrameAt,
  createConstructionChoreography,
  type ConstructionChoreographyReady,
} from "./constructionChoreography";
import {foldNetStepProgress, type FoldNet} from "./foldnet";
import {
  enumerateOrientations,
  generateWrapPlan,
  packedEnvelope,
  PROTOTYPE_PROFILE,
  type ItemInput,
} from "./geometry";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};

function wrapNet(): FoldNet {
  const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
  const result = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
  if ("error" in result) throw new Error(result.error);
  return result.foldNet;
}

function ready(net = wrapNet()): ConstructionChoreographyReady {
  const choreography = createConstructionChoreography(net);
  expect(choreography.status).toBe("READY");
  if (choreography.status !== "READY") throw new Error(choreography.errors.join("\n"));
  return choreography;
}

function changedNet(net: FoldNet, changes: Partial<FoldNet>): FoldNet {
  return {...net, ...changes};
}

describe("construction choreography", () => {
  it("preserves generated playbook order and input while producing a frozen authority", () => {
    const net = wrapNet();
    const before = JSON.stringify(net);
    const choreography = ready(net);
    const byCode = (code: string) => net.playbook.find((step) => step.code === code)!;

    expect(choreography.order).toEqual({
      scoreIds: byCode("SCORE").scoreIds,
      cutIds: byCode("CUT").cutIds,
      scrapIds: byCode("SCRAP").scrapIds,
      creaseIds: byCode("FOLD").creaseIds,
      seamIds: byCode("SEAL").seamIds,
    });
    expect(JSON.stringify(net)).toBe(before);
    expect(Object.isFrozen(choreography)).toBe(true);
    expect(Object.isFrozen(choreography.order.cutIds)).toBe(true);
  });

  it("maps every wrap boundary and non-finite input to its truthful construction frame", () => {
    const choreography = ready();
    const checkpoints = new Map([
      [0.14, "scores"], [0.22, "cuts"], [0.30, "cutting"], [0.38, "scrap"],
      [0.44, "tabs"], [0.90, "seal"], [0.97, "present"], [1, "present"],
    ]);
    for (const [progress, stage] of checkpoints) {
      const frame = constructionFrameAt(choreography, progress);
      expect(frame.status).toBe("READY");
      if (frame.status === "READY") expect(frame.stage.id).toBe(stage);
    }
    const nonFinite = constructionFrameAt(choreography, Number.NaN);
    expect(nonFinite).toMatchObject({status: "READY", progress: 0, stage: {id: "reveal"}});
  });

  it("tracks score and trace paths against their animation channels", () => {
    const choreography = ready();
    const scoring = constructionFrameAt(choreography, 0.18);
    const tracing = constructionFrameAt(choreography, 0.26);
    const cutStart = constructionFrameAt(choreography, 0.30);
    if (scoring.status !== "READY" || tracing.status !== "READY" || cutStart.status !== "READY") throw new Error("Expected ready frames");

    expect(scoring.score.progress).toBeCloseTo(0.5, 10);
    expect(scoring.score.activeId).toBeTruthy();
    expect(choreography.order.scoreIds).toContain(scoring.score.activeId!);
    expect(scoring.score.position).not.toBeNull();
    expect(tracing.trace.progress).toBeCloseTo(0.5, 10);
    expect(tracing.trace.activeId).toBeTruthy();
    expect(choreography.order.cutIds).toContain(tracing.trace.activeId!);
    expect(tracing.trace.position).not.toBeNull();
    expect(cutStart.trace.completedIds).toEqual(choreography.order.cutIds);
  });

  it("creates explicit CUT operations and lifts only across disconnected cut endpoints", () => {
    const choreography = ready();
    const operations = choreography.cutOperations;
    const cutOperations = operations.filter((operation) => operation.kind === "CUT");
    const lifts = operations.filter((operation) => operation.kind === "LIFT");

    expect(cutOperations.map((operation) => operation.id)).toEqual(choreography.order.cutIds.map((id) => `cut:${id}`));
    cutOperations.forEach((operation, index) => {
      expect(operation.weight).toBeCloseTo(choreography.cutSegments[index].lengthMm, 10);
    });
    for (let index = 1; index < choreography.cutSegments.length; index += 1) {
      const previous = choreography.cutSegments[index - 1];
      const next = choreography.cutSegments[index];
      const gap = Math.hypot(next.from.xMm - previous.to.xMm, next.from.yMm - previous.to.yMm);
      const lift = lifts.find((operation) => operation.fromCutId === previous.id && operation.toCutId === next.id);
      if (gap > 0.01) {
        expect(lift).toMatchObject({id: `lift:${previous.id}->${next.id}`, distanceMm: expect.closeTo(gap, 10), weight: expect.closeTo(Math.max(12, 0.35 * gap), 10), heightMm: 8});
      } else {
        expect(lift).toBeUndefined();
      }
    }

    const contiguousPair = wrapNet().cuts.flatMap((first) =>
      wrapNet().cuts
        .filter((second) => first.id !== second.id && first.toVertexId === second.fromVertexId)
        .map((second) => [first.id, second.id] as const),
    )[0];
    expect(contiguousPair).toBeDefined();
    const contiguousNet = wrapNet();
    const contiguousIds = [...contiguousPair!, ...contiguousNet.cuts.map(({id}) => id).filter((id) => !contiguousPair!.includes(id))];
    const contiguous = ready(changedNet(contiguousNet, {
      playbook: contiguousNet.playbook.map((step) => step.code === "CUT" ? {...step, cutIds: contiguousIds} : step),
    }));
    expect(contiguous.cutOperations.slice(0, 2)).toMatchObject([
      {id: `cut:${contiguousPair![0]}`, kind: "CUT"},
      {id: `cut:${contiguousPair![1]}`, kind: "CUT"},
    ]);
    expect(contiguous.cutOperations.some((operation) => operation.kind === "LIFT" && operation.fromCutId === contiguousPair![0] && operation.toCutId === contiguousPair![1])).toBe(false);
  });

  it("keeps partial kerfs persistent and gates nonempty scraps on every release cut", () => {
    const choreography = ready();
    const partial = Array.from({length: 79}, (_, index) =>
      constructionFrameAt(choreography, 0.301 + index * 0.001),
    ).find(
      (frame) => frame.status === "READY" && frame.kerf.some((kerf) => kerf.progress > 0 && kerf.progress < 1),
    );
    const cutComplete = constructionFrameAt(choreography, 0.38);
    const scrapComplete = constructionFrameAt(choreography, 0.44);
    if (!partial || partial.status !== "READY" || cutComplete.status !== "READY" || scrapComplete.status !== "READY") throw new Error("Expected ready frames");

    expect(partial.kerf.some((kerf) => kerf.progress > 0 && kerf.progress < 1)).toBe(true);
    expect(cutComplete.kerf).toHaveLength(choreography.order.cutIds.length);
    expect(cutComplete.kerf.every((kerf) => kerf.progress === 1)).toBe(true);
    expect(cutComplete.scraps.length).toBeGreaterThan(0);
    expect(partial.scraps.every((scrap) => !scrap.ready && scrap.removalProgress === 0)).toBe(true);
    expect(scrapComplete.scraps.every((scrap) => scrap.cutIds.every((id) => scrapComplete.completedCutIds.includes(id)) && scrap.ready && scrap.removalProgress === 1)).toBe(true);
  });

  it("reports the actual seam, including gap tolerance, centreline, and seal visibility", () => {
    const net = wrapNet();
    const choreography = ready(net);
    const atSeal = constructionFrameAt(choreography, 0.90);
    const atPresent = constructionFrameAt(choreography, 0.97);
    if (atSeal.status !== "READY" || atPresent.status !== "READY") throw new Error("Expected ready frames");
    const seam = atSeal.seams[0];

    expect(seam).toMatchObject({expectedGapMm: 4, toleranceMm: 1, endpointGapsMm: [4, 4], ready: true});
    expect(seam.centerline).toHaveLength(2);
    expect(atSeal.tape).toMatchObject({ready: true, visible: false, progress: 0});
    expect(atPresent.tape).toMatchObject({ready: true, visible: true, progress: 1});

    const original = net.seams[0];
    const reversed = ready(changedNet(net, {seams: [{...original, matingEdges: [original.matingEdges[0], {...original.matingEdges[1], fromVertexId: original.matingEdges[1].toVertexId, toVertexId: original.matingEdges[1].fromVertexId}]}]}));
    const reversedFrame = constructionFrameAt(reversed, 0.90);
    if (reversedFrame.status !== "READY") throw new Error("Expected reversed seam frame");
    expect(reversedFrame.seams[0].pairing).not.toBe(seam.pairing);
    expect(reversedFrame.seams[0].centerline).toEqual(seam.centerline);
  });

  it("rejects invalid, missing, duplicate, and misordered fold steps", () => {
    const net = wrapNet();
    const first = net.steps[0];
    const variants = [
      changedNet(net, {steps: [{...first, end: 1.01}, ...net.steps.slice(1)]}),
      changedNet(net, {creases: [{...net.creases[0], stepId: "missing-step"}, ...net.creases.slice(1)]}),
      changedNet(net, {steps: [{...first}, {...net.steps[1], id: first.id}, ...net.steps.slice(2)]}),
      changedNet(net, {steps: [{...first, sequence: 1}, ...net.steps.slice(1)]}),
    ];
    variants.forEach((variant) => expect(createConstructionChoreography(variant).status).toBe("INVALID"));
  });

  it("never throws when any canonical container is omitted", () => {
    const net = wrapNet();
    const containers = ["vertices", "faces", "scores", "cuts", "scraps", "seams", "creases", "steps", "playbook"] as const;
    containers.forEach((container) => {
      const malformed = {...net, [container]: undefined} as unknown as FoldNet;
      expect(() => createConstructionChoreography(malformed)).not.toThrow();
      expect(createConstructionChoreography(malformed)).toMatchObject({status: "INVALID", codes: ["CHOREOGRAPHY_INVALID_NET"]});
    });
  });

  it("rejects malformed creases while finite generated diagnostics remain ready", () => {
    const net = wrapNet();
    const crease = net.creases[0];
    const variants = [
      {...crease, angleRad: Number.NaN},
      {...crease, direction: 0 as 1},
      {...crease, kind: "cut" as "score"},
      {...crease, sequence: crease.sequence + 1},
    ];
    variants.forEach((invalidCrease) => {
      const choreography = createConstructionChoreography(changedNet(net, {creases: [invalidCrease, ...net.creases.slice(1)]}));
      expect(choreography.status).toBe("INVALID");
    });
    const choreography = ready(net);
    const frame = constructionFrameAt(choreography, 1);
    if (frame.status !== "READY") throw new Error("Expected finite frame");
    expect(frame.fold.diagnostics).toMatchObject({connected: true, nonFiniteValues: false, detachedFaceIds: []});
    frame.fold.steps.forEach((step) => expect(step.progress).toBe(foldNetStepProgress(net, step.id, 1)));
  });
});
