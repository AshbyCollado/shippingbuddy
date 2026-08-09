import type {Dimensions3D} from "./geometry";

export interface HeightReductionInput {
  originalInternal: Dimensions3D;
  requiredInternal: Dimensions3D;
  panelDepthScoreToScoreMm: number;
  openingWidthScoreSpanMm: number;
  thicknessMm: number;
  topSeamGapMm: number;
  slotWidthMm: number;
  joint: "ADHESIVE" | "TAPE" | "STAPLED" | "UNKNOWN";
  condition: "NEW" | "USED" | "DAMAGED";
}

export interface HeightReductionPlan {
  targetHeightMm: number;
  retainedAllowanceMm: number;
  newScoreMm: number;
  replacementFlapDepthMm: number;
  outerTrimMm: number;
  availableFlapMaterialMm: number;
  warnings: string[];
}

export function calculateHeightReduction(input: HeightReductionInput): HeightReductionPlan | {error: string} {
  const {originalInternal: original, requiredInternal: required} = input;
  const values = [original.lengthMm, original.widthMm, original.heightMm, required.lengthMm, required.widthMm, required.heightMm, input.panelDepthScoreToScoreMm, input.openingWidthScoreSpanMm, input.thicknessMm, input.topSeamGapMm, input.slotWidthMm];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return {error: "All measured dimensions must be finite and greater than zero."};
  if (input.condition === "DAMAGED") return {error: "This box is damaged and cannot be reduced by the current recipe."};
  if (input.joint === "STAPLED" || input.joint === "UNKNOWN") return {error: "Height reduction requires an accessible adhesive or tape manufacturer joint."};
  if (required.lengthMm > original.lengthMm || required.widthMm > original.widthMm) return {error: "The item does not fit the original length and width."};
  if (required.heightMm >= original.heightMm) return {error: "The target height must be lower than the existing internal height."};

  const retainedAllowanceMm = input.panelDepthScoreToScoreMm - original.heightMm;
  const newScoreMm = required.heightMm + retainedAllowanceMm;
  const replacementFlapDepthMm = (input.openingWidthScoreSpanMm - input.topSeamGapMm) / 2;
  const outerTrimMm = newScoreMm + replacementFlapDepthMm;
  const availableFlapMaterialMm = input.panelDepthScoreToScoreMm - newScoreMm;
  const edgeClearanceMm = Math.max(input.thicknessMm, input.slotWidthMm, 3);
  if (replacementFlapDepthMm <= 0 || newScoreMm <= 0 || outerTrimMm > input.panelDepthScoreToScoreMm - edgeClearanceMm || availableFlapMaterialMm < replacementFlapDepthMm) {
    return {error: `This box cannot be reduced to ${required.heightMm} mm: it does not have enough uncreased wall material for the replacement flaps.`};
  }
  return {targetHeightMm: required.heightMm, retainedAllowanceMm, newScoreMm, replacementFlapDepthMm, outerTrimMm, availableFlapMaterialMm, warnings: ["Experimental recipe: remove the original top flaps and old top score before creating replacement flaps.", "Physical validation is required before relying on the resized box."]};
}
