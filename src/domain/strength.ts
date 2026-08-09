import type {Dimensions3D} from "./geometry";

export type StrengthStatus = "STRENGTH_UNVERIFIED" | "VERIFIED_WITH_PROVIDED_RATING" | "KNOWN_LIMIT_EXCEEDED";
export type RatingSource = "BOX_MAKERS_CERTIFICATE" | "MANUFACTURER_SPECIFICATION" | "PACKAGE_TEST_CERTIFICATION";

export interface ExactRatingEvidence {
  source: RatingSource;
  exactBoxId: string;
  maximumGrossWeightKg: number;
  maximumSizeMm?: number;
  sizeBasis?: "LONGEST_SIDE" | "LENGTH_PLUS_WIDTH_PLUS_HEIGHT" | "LENGTH_PLUS_GIRTH";
}

export interface ParcelStrengthInput {
  operation: "USE_UNCHANGED" | "BUILD_FROM_FLAT_SHEET" | "REDUCE_HEIGHT";
  condition: "NEW" | "USED" | "DAMAGED";
  itemWeightKg: number;
  finalMeasuredPackedWeightKg?: number;
  measuredOutsideDimensions?: Dimensions3D;
  rating?: ExactRatingEvidence;
}

export interface ParcelStrengthAssessment {
  status: StrengthStatus;
  blocking: boolean;
  reasons: string[];
}

function sizeValue(dimensions: Dimensions3D, basis: ExactRatingEvidence["sizeBasis"]): number {
  if (basis === "LONGEST_SIDE") return Math.max(dimensions.lengthMm, dimensions.widthMm, dimensions.heightMm);
  if (basis === "LENGTH_PLUS_GIRTH") return dimensions.lengthMm + 2 * dimensions.widthMm + 2 * dimensions.heightMm;
  return dimensions.lengthMm + dimensions.widthMm + dimensions.heightMm;
}

export function assessParcelStrength(input: ParcelStrengthInput): ParcelStrengthAssessment {
  if (input.rating && input.itemWeightKg > input.rating.maximumGrossWeightKg) return {status: "KNOWN_LIMIT_EXCEEDED", blocking: true, reasons: ["The item weight alone exceeds the entered maximum gross-weight limit."]};
  if (input.finalMeasuredPackedWeightKg !== undefined && input.finalMeasuredPackedWeightKg < input.itemWeightKg) return {status: "STRENGTH_UNVERIFIED", blocking: false, reasons: ["Completed parcel weight cannot be lower than item weight."]};
  if (input.rating && input.finalMeasuredPackedWeightKg !== undefined && input.finalMeasuredPackedWeightKg > input.rating.maximumGrossWeightKg) return {status: "KNOWN_LIMIT_EXCEEDED", blocking: true, reasons: ["The completed parcel exceeds the entered maximum gross-weight limit."]};
  if (input.rating?.maximumSizeMm !== undefined) {
    if (!input.measuredOutsideDimensions || !input.rating.sizeBasis) return {status: "STRENGTH_UNVERIFIED", blocking: false, reasons: ["A final outside measurement and the rating-specific size basis are required."]};
    if (sizeValue(input.measuredOutsideDimensions, input.rating.sizeBasis) > input.rating.maximumSizeMm) return {status: "KNOWN_LIMIT_EXCEEDED", blocking: true, reasons: ["The completed parcel exceeds the entered maximum size limit."]};
  }
  if (input.condition === "DAMAGED") return {status: "STRENGTH_UNVERIFIED", blocking: true, reasons: ["Damaged sources cannot be used by the planning engine."]};
  if (input.operation !== "USE_UNCHANGED" || input.condition !== "NEW" || !input.rating || input.finalMeasuredPackedWeightKg === undefined) return {status: "STRENGTH_UNVERIFIED", blocking: false, reasons: ["Calculated fit is available, but exact-box evidence and completed parcel measurements are not sufficient for verification."]};
  return {status: "VERIFIED_WITH_PROVIDED_RATING", blocking: false, reasons: ["Within the rating you entered."]};
}
