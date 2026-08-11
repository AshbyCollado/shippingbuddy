import {describe, expect, it} from "vitest";
import {
  actionForProgress,
  createConstructionInstructions,
  nextAction,
  previousAction,
  progressForAction,
} from "./constructionInstructions";
import {
  enumerateOrientations,
  generateWrapPlan,
  packedEnvelope,
  PROTOTYPE_PROFILE,
  type ItemInput,
  type WrapPatternId,
} from "./geometry";
import type {FoldNetPlaybookCode} from "./foldnet";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305}, weightKg: 3.2,
  fragility: "MODERATE", cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0}, allowRotation: true, keepUpright: false,
};

function planFor(pattern: WrapPatternId = "WRAP_BOX_V1") {
  const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
  const result = generateWrapPlan(envelope, PROTOTYPE_PROFILE, pattern);
  if ("error" in result) throw new Error(result.error);
  return result;
}

function ready(pattern?: WrapPatternId) {
  const instructions = createConstructionInstructions(planFor(pattern), {lengthMm: 962, widthMm: 1360});
  expect(instructions.status).toBe("READY");
  if (instructions.status !== "READY") throw new Error(instructions.errors.join("\n"));
  return instructions;
}

describe("canonical construction instructions", () => {
  it("derives exactly seven ordered WRAP, MAILER, and TAB actions from canonical references", () => {
    for (const pattern of ["WRAP_BOX_V1", "MAILER_BOX_V1", "TAB_INSERT_V1"] as const) {
      const plan = planFor(pattern);
      const instructions = ready(pattern);
      expect(instructions.patternId).toBe(pattern);
      expect(instructions.actions).toHaveLength(7);
      expect(instructions.actions.map(({code, sequence}) => [code, sequence])).toEqual([
        ["VERIFY", 0], ["SCORE", 1], ["CUT", 2], ["SCRAP", 3], ["FOLD", 4], ["SEAL", 5], ["REMEASURE", 6],
      ]);
      instructions.actions.forEach((action) => {
        const step = plan.foldNet.playbook[action.sequence];
        expect(action.canonicalLabel).toBe(step.label);
        expect(action.references).toEqual({
          faceIds: step.faceIds ?? [], scoreIds: step.scoreIds ?? [], cutIds: step.cutIds ?? [],
          scrapIds: step.scrapIds ?? [], creaseIds: step.creaseIds ?? [], seamIds: step.seamIds ?? [],
        });
        expect(action.instruction).toBeTruthy(); expect(action.tools.length).toBeGreaterThan(0);
        expect(action.safety).toBeTruthy(); expect(action.expectedResult).toBeTruthy();
      });
      expect(instructions.actions.flatMap(({stageIds}) => stageIds)).toEqual([
        "reveal", "envelope", "scores", "cuts", "cutting", "scrap", "tabs", "walls", "top", "seal", "present",
      ]);
      const verify = instructions.actions[0];
      expect(verify.counts).toEqual([{id: "generated-faces", label: "Generated faces", value: plan.foldNet.faces.length}]);
      expect(verify.measurements).toEqual(expect.arrayContaining([
        {id: "entered-sheet", kind: "SHEET", label: "Entered sheet", lengthMm: 962, widthMm: 1360},
        {id: "minimum-sheet", kind: "SHEET", label: "Minimum sheet", lengthMm: plan.metrics.requiredSheetWidthMm, widthMm: plan.metrics.requiredSheetHeightMm},
        {id: "generated-net", kind: "SHEET", label: "Generated net", lengthMm: plan.metrics.netWidthMm, widthMm: plan.metrics.netHeightMm},
        {id: "protected-inside", kind: "DIMENSIONS", label: "Required inside space", dimensionsMm: plan.requiredInternal},
      ]));
      expect(instructions.actions.find(({code}) => code === "SCORE")?.counts[0].value).toBe(plan.foldNet.scores.length);
      expect(instructions.actions.find(({code}) => code === "CUT")?.counts[0].value).toBe(plan.foldNet.cuts.length);
    }
  });

  it("assigns all eleven stage boundaries and round-trips action navigation", () => {
    const instructions = ready();
    const samples: Array<[number, FoldNetPlaybookCode]> = [
      [0, "VERIFY"], [0.14, "SCORE"], [0.22, "CUT"], [0.38, "SCRAP"], [0.44, "FOLD"], [0.9, "SEAL"], [0.97, "REMEASURE"], [1, "REMEASURE"],
    ];
    samples.forEach(([progress, code]) => expect(actionForProgress(instructions, progress)?.code).toBe(code));
    instructions.actions.forEach((action, index) => {
      expect(progressForAction(instructions, action.id)).toBe(action.startProgress);
      expect(actionForProgress(instructions, action.startProgress)?.id).toBe(action.id);
      expect(previousAction(instructions, action.id)?.id ?? null).toBe(index ? instructions.actions[index - 1].id : null);
      expect(nextAction(instructions, action.id)?.id ?? null).toBe(index < 6 ? instructions.actions[index + 1].id : null);
    });
  });

  it("keeps generated plans unchanged and deeply freezes all derived instructional data", () => {
    const plan = planFor(); const before = JSON.stringify(plan); const instructions = ready();
    expect(JSON.stringify(plan)).toBe(before);
    expect(Object.isFrozen(instructions)).toBe(true);
    if (instructions.status === "READY") {
      expect(Object.isFrozen(instructions.actions)).toBe(true);
      expect(Object.isFrozen(instructions.actions[0].references.faceIds)).toBe(true);
      expect(Object.isFrozen(instructions.actions[0].measurements)).toBe(true);
    }
  });

  it("returns stable INVALID results for malformed canonical containers, playbooks, stock, and measurements", () => {
    const plan = planFor();
    const malformed = [
      {...plan, foldNet: {...plan.foldNet, cuts: undefined}},
      {...plan, foldNet: {...plan.foldNet, playbook: [...plan.foldNet.playbook.slice(1), plan.foldNet.playbook[0]]}},
      {...plan, metrics: {...plan.metrics, netWidthMm: Number.NaN}},
    ];
    malformed.forEach((value) => {
      expect(() => createConstructionInstructions(value as typeof plan, {lengthMm: 962, widthMm: 1360})).not.toThrow();
      expect(createConstructionInstructions(value as typeof plan, {lengthMm: 962, widthMm: 1360}).status).toBe("INVALID");
    });
    for (const stock of [{lengthMm: 0, widthMm: 1360}, {lengthMm: Number.NaN, widthMm: 1360}]) {
      expect(createConstructionInstructions(plan, stock).status).toBe("INVALID");
    }
  });
});
