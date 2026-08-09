import {describe, expect, it} from "vitest";
import {
  createDefaultPlannerDraft,
  parsePlannerDraftJson,
  PLANNER_DRAFT_SCHEMA_VERSION,
  PlannerDraftSchema,
  serializePlannerDraft,
  validatePlannerDraft,
} from "./draft";

describe("versioned planner drafts", () => {
  it("creates a complete default that survives the export/import boundary", () => {
    const draft = createDefaultPlannerDraft();
    const exported = serializePlannerDraft(draft);
    const imported = parsePlannerDraftJson(exported);

    expect(draft.schemaVersion).toBe(PLANNER_DRAFT_SCHEMA_VERSION);
    expect(imported).toEqual({success: true, data: draft});
    expect(JSON.parse(exported)).toEqual(draft);
  });

  it("rejects malformed, future-version, and generated-geometry payloads", () => {
    const draft = createDefaultPlannerDraft();

    expect(parsePlannerDraftJson("not json").success).toBe(false);
    expect(validatePlannerDraft({...draft, schemaVersion: PLANNER_DRAFT_SCHEMA_VERSION + 1}).success).toBe(false);
    expect(PlannerDraftSchema.safeParse({...draft, generatedPlan: {cuts: []}}).success).toBe(false);
    expect(PlannerDraftSchema.safeParse({...draft, method: "cut-and-fold"}).success).toBe(false);
  });
});
