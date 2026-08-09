import {describe, expect, it} from "vitest";
import {enumerateOrientations, generateWrapPlan, packedEnvelope, PROTOTYPE_PROFILE, type ItemInput} from "./geometry";
import {foldNetAtProgress, foldNetFromWrapPlan, foldNetPoseDelta, type FoldNet} from "./foldnet";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};

function fixturePlan() {
  const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
  const result = generateWrapPlan(envelope, PROTOTYPE_PROFILE);
  if ("error" in result) throw new Error(result.error);
  return result;
}
describe("fold net adapter", () => {
  it("creates stable shared vertices and one crease per connected face", () => {
    const plan = fixturePlan();
    const first = foldNetFromWrapPlan(plan);
    const second = foldNetFromWrapPlan(plan);

    expect(first.rootFaceId).toBe("bottom");
    expect(first.faces).toHaveLength(plan.rectangles.length);
    expect(first.vertices.length).toBeLessThan(first.faces.length * 4);
    expect(first.creases).toHaveLength(first.faces.length - 1);
    expect(first).toEqual(second);
    expect(new Set(first.creases.map((crease) => crease.childFaceId)).size).toBe(first.faces.length - 1);
    expect(first.creases.every((crease) => ["tabs", "walls", "top"].includes(crease.stepId))).toBe(true);
  });

  it("preserves the source net exactly at the reveal pose", () => {
    const plan = fixturePlan();
    const net = foldNetFromWrapPlan(plan);
    const pose = foldNetAtProgress(net, 0);

    expect(pose.progress).toBe(0);
    expect(pose.diagnostics.connected).toBe(true);
    expect(pose.diagnostics.detachedFaceIds).toEqual([]);
    expect(pose.diagnostics.maxHingeGapMm).toBeLessThan(0.000001);
    expect(pose.diagnostics.maxEdgeStretchMm).toBeLessThan(0.000001);
    expect(pose.faces.every((face) => face.vertices.every((vertex) => Math.abs(vertex.zMm) < 0.000001))).toBe(true);
    const bottom = pose.faces.find((face) => face.faceId === "bottom");
    expect(bottom?.vertices[0]).toMatchObject({xMm: 0, yMm: 0, zMm: 0});
  });

  it("folds deterministically while preserving edge lengths and hinge contact", () => {
    const net = foldNetFromWrapPlan(fixturePlan());
    const first = foldNetAtProgress(net, 1);
    const second = foldNetAtProgress(net, 1);

    expect(foldNetPoseDelta(first, second)).toBe(0);
    expect(first.diagnostics.connected).toBe(true);
    expect(first.diagnostics.maxHingeGapMm).toBeLessThan(0.000001);
    expect(first.diagnostics.maxEdgeStretchMm).toBeLessThan(0.000001);
    expect(first.faces.some((face) => face.vertices.some((vertex) => Math.abs(vertex.zMm) > 1))).toBe(true);
  });

  it("keeps a malformed disconnected face visible but reports the detachment", () => {
    const net: FoldNet = {
      rootFaceId: "root",
      vertices: [
        {id: "a", xMm: 0, yMm: 0}, {id: "b", xMm: 10, yMm: 0}, {id: "c", xMm: 10, yMm: 10}, {id: "d", xMm: 0, yMm: 10},
        {id: "e", xMm: 50, yMm: 50}, {id: "f", xMm: 60, yMm: 50}, {id: "g", xMm: 60, yMm: 60}, {id: "h", xMm: 50, yMm: 60},
      ],
      faces: [
        {id: "root", sourceRectId: "root", role: "PANEL", vertexIds: ["a", "b", "c", "d"]},
        {id: "orphan", sourceRectId: "orphan", role: "TAB", vertexIds: ["e", "f", "g", "h"]},
      ],
      creases: [],
      steps: [{id: "tabs", sequence: 0, start: 0, end: 1, label: "Tabs"}],
    };
    const pose = foldNetAtProgress(net, 0.5);
    expect(pose.diagnostics.connected).toBe(false);
    expect(pose.diagnostics.detachedFaceIds).toEqual(["orphan"]);
    expect(pose.faces).toHaveLength(2);
    expect(pose.diagnostics.nonFiniteValues).toBe(false);
  });
});
