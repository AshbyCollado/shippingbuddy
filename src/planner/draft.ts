import {z} from "zod";
import {inchesToMm, poundsToKg, type DisplayUnit} from "@/domain/measurements";
import type {Dimensions3D, ItemInput, ProtectionGoal, WrapPatternId} from "@/domain/geometry";

export const PLANNER_DRAFT_SCHEMA_VERSION = 1 as const;
export const PLANNER_STORAGE_KEY = "shipping-buddy:planner-draft:v1";

const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().nonnegative();

export const DimensionsSchema = z.object({
  lengthMm: positiveNumber,
  widthMm: positiveNumber,
  heightMm: positiveNumber,
}).strict();

const CushioningSchema = z.object({
  leftMm: nonNegativeNumber,
  rightMm: nonNegativeNumber,
  frontMm: nonNegativeNumber,
  backMm: nonNegativeNumber,
  bottomMm: nonNegativeNumber,
  topMm: nonNegativeNumber,
}).strict();

const FitToleranceSchema = z.object({
  lengthTotalMm: nonNegativeNumber,
  widthTotalMm: nonNegativeNumber,
  heightTotalMm: nonNegativeNumber,
}).strict();

export const ItemInputSchema = z.object({
  dimensions: DimensionsSchema,
  shapeProfile: z.object({
    kind: z.enum(["RECTANGULAR_BOX", "CYLINDER_TUBE", "ROUNDED_FORM", "L_U_MEASURED"]),
  }).strict(),
  weightKg: positiveNumber,
  fragility: z.enum(["LOW", "MODERATE", "HIGH", "VERY_HIGH"]),
  cushioning: CushioningSchema,
  tolerance: FitToleranceSchema,
  allowRotation: z.boolean(),
  keepUpright: z.boolean(),
}).strict();

export const ProtectionGoalSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const PlannerSourceSchema = z.object({
  mode: z.enum(["EXISTING_BOX", "COMMON_BOX", "FLAT_SHEET"]),
  existingBox: DimensionsSchema,
  selectedCommonBoxId: z.string().min(1).max(80),
  sheet: z.object({
    lengthMm: positiveNumber,
    widthMm: positiveNumber,
  }).strict(),
  pattern: z.enum(["WRAP_BOX_V1", "MAILER_BOX_V1", "TAB_INSERT_V1"]),
}).strict();

export const PlannerDraftSchema = z.object({
  schemaVersion: z.literal(PLANNER_DRAFT_SCHEMA_VERSION),
  draftId: z.string().min(1).max(120),
  updatedAt: z.string().datetime(),
  unit: z.enum(["in", "mm"]),
  item: ItemInputSchema,
  protectionGoal: ProtectionGoalSchema,
  source: PlannerSourceSchema,
}).strict();

export type PlannerDraft = z.infer<typeof PlannerDraftSchema>;
export type PlannerSourceMode = PlannerDraft["source"]["mode"];

function createDraftId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultPlannerDraft(): PlannerDraft {
  const protectionMm = inchesToMm(1);
  return {
    schemaVersion: PLANNER_DRAFT_SCHEMA_VERSION,
    draftId: createDraftId(),
    updatedAt: new Date().toISOString(),
    unit: "in",
    item: {
      dimensions: {
        lengthMm: inchesToMm(14),
        widthMm: inchesToMm(13),
        heightMm: inchesToMm(12),
      },
      shapeProfile: {kind: "RECTANGULAR_BOX"},
      weightKg: poundsToKg(7),
      fragility: "MODERATE",
      cushioning: {
        leftMm: protectionMm,
        rightMm: protectionMm,
        frontMm: protectionMm,
        backMm: protectionMm,
        bottomMm: protectionMm,
        topMm: protectionMm,
      },
      tolerance: {lengthTotalMm: 6, widthTotalMm: 6, heightTotalMm: 6},
      allowRotation: true,
      keepUpright: false,
    },
    protectionGoal: 2,
    source: {
      mode: "EXISTING_BOX",
      existingBox: {
        lengthMm: inchesToMm(20),
        widthMm: inchesToMm(20),
        heightMm: inchesToMm(20),
      },
      selectedCommonBoxId: "RSC-04",
      sheet: {lengthMm: inchesToMm(48), widthMm: inchesToMm(64)},
      pattern: "WRAP_BOX_V1",
    },
  };
}

export function validatePlannerDraft(value: unknown) {
  return PlannerDraftSchema.safeParse(value);
}

export function serializePlannerDraft(draft: PlannerDraft) {
  return JSON.stringify(PlannerDraftSchema.parse(draft), null, 2);
}

export function parsePlannerDraftJson(json: string) {
  try {
    return PlannerDraftSchema.safeParse(JSON.parse(json) as unknown);
  } catch {
    return PlannerDraftSchema.safeParse(undefined);
  }
}

export function protectedDimensions(draft: Pick<PlannerDraft, "item">): Dimensions3D {
  const {dimensions, cushioning, tolerance} = draft.item;
  return {
    lengthMm: dimensions.lengthMm + cushioning.leftMm + cushioning.rightMm + tolerance.lengthTotalMm,
    widthMm: dimensions.widthMm + cushioning.frontMm + cushioning.backMm + tolerance.widthTotalMm,
    heightMm: dimensions.heightMm + cushioning.bottomMm + cushioning.topMm + tolerance.heightTotalMm,
  };
}

// Compile-time guards keep persisted data aligned with the established domain contracts.
const _itemContract: ItemInput = createDefaultPlannerDraft().item;
const _unitContract: DisplayUnit = createDefaultPlannerDraft().unit;
const _goalContract: ProtectionGoal = createDefaultPlannerDraft().protectionGoal;
const _patternContract: WrapPatternId = createDefaultPlannerDraft().source.pattern;
void [_itemContract, _unitContract, _goalContract, _patternContract];
