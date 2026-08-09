import {z} from "zod";
import type {Dimensions3D} from "./geometry";

export type BoxMeasurementBasis = "INSIDE" | "OUTSIDE" | "NOT_SURE";

export interface BoxMeasurement {
  rawDimensions: Dimensions3D;
  basis: BoxMeasurementBasis;
  boardThicknessMm?: number;
  uncertaintyMm?: number;
}

export interface SavedBox extends BoxMeasurement {
  id: string;
  name: string;
}

const positiveFinite = z.number().finite().positive();

export const SavedBoxSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(100),
  rawDimensions: z.object({
    lengthMm: positiveFinite,
    widthMm: positiveFinite,
    heightMm: positiveFinite,
  }).strict(),
  basis: z.enum(["INSIDE", "OUTSIDE", "NOT_SURE"]),
  boardThicknessMm: positiveFinite.optional(),
  uncertaintyMm: z.number().finite().nonnegative().optional(),
}).strict();

export type BoxResolution =
  | {status: "RESOLVED"; internalDimensions: Dimensions3D; warning?: string}
  | {status: "MEASUREMENT_REQUIRED"; message: string}
  | {status: "INVALID"; message: string};

function validDimensions(dimensions: Dimensions3D) {
  return Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0);
}

export function resolveBoxMeasurement(measurement: BoxMeasurement): BoxResolution {
  if (!validDimensions(measurement.rawDimensions)) {
    return {status: "INVALID", message: "Every measured box dimension must be a positive, finite number."};
  }
  if (measurement.uncertaintyMm !== undefined && (!Number.isFinite(measurement.uncertaintyMm) || measurement.uncertaintyMm < 0)) {
    return {status: "INVALID", message: "Measurement uncertainty cannot be negative or non-finite."};
  }
  if (measurement.boardThicknessMm !== undefined && (!Number.isFinite(measurement.boardThicknessMm) || measurement.boardThicknessMm <= 0)) {
    return {status: "INVALID", message: "Board thickness must be a positive, finite measurement."};
  }
  if (measurement.basis === "NOT_SURE") {
    return {status: "MEASUREMENT_REQUIRED", message: "Choose whether these are inside or outside measurements before checking fit."};
  }
  if (measurement.basis === "INSIDE") {
    return {status: "RESOLVED", internalDimensions: {...measurement.rawDimensions}};
  }
  if (measurement.boardThicknessMm === undefined) {
    return {status: "MEASUREMENT_REQUIRED", message: "Measure and enter the thickness of one cardboard wall before checking fit."};
  }

  const uncertaintyMm = measurement.uncertaintyMm ?? 0;
  const deductionMm = 2 * (measurement.boardThicknessMm + uncertaintyMm);
  const internalDimensions = {
    lengthMm: measurement.rawDimensions.lengthMm - deductionMm,
    widthMm: measurement.rawDimensions.widthMm - deductionMm,
    heightMm: measurement.rawDimensions.heightMm - deductionMm,
  };
  if (!validDimensions(internalDimensions)) {
    return {status: "INVALID", message: "The wall thickness and uncertainty leave no positive inside space. Check these measurements."};
  }
  return {
    status: "RESOLVED",
    internalDimensions,
    warning: "Conservative inside size: two walls, including the entered uncertainty at each wall, were removed from every outside dimension.",
  };
}

export function measurementFromSource(source: {
  existingBox: Dimensions3D;
  measurementBasis?: BoxMeasurementBasis;
  boardThicknessMm?: number;
  measurementUncertaintyMm?: number;
}): BoxMeasurement {
  return {
    rawDimensions: source.existingBox,
    basis: source.measurementBasis ?? "INSIDE",
    boardThicknessMm: source.boardThicknessMm,
    uncertaintyMm: source.measurementUncertaintyMm,
  };
}
