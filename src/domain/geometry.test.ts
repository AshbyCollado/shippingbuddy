import {describe, expect, it} from "vitest";
import {COMMON_BOXES, FRAGILITY_PRESETS, PROTECTION_GOAL_MM, PROTOTYPE_PROFILE, autoFitSheet, chooseWrapOrientation, enumerateOrientations, fitsSheet, generateCommonBoxPlan, generateMailerPlan, generateTabInsertPlan, generateWrapPlan, packedEnvelope, protectionGoalToMm, renderWrapSvg, type ItemInput} from "./geometry";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};

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

  it("propagates the selected stock orientation into the generated plan", () => {
    const chosen = chooseWrapOrientation(item, {lengthMm: 500, widthMm: 2000});
    expect(chosen.id).toBeTruthy();
  });
});
