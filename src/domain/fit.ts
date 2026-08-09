import {
  enumerateOrientations,
  getItemShapeProfile,
  packedEnvelope,
  type Dimensions3D,
  type ItemInput,
  type Orientation,
} from "./geometry";
import {formatLengthInput, type DisplayUnit} from "./measurements";
import {normalizeDimensionsForProfile} from "./itemProfiles";

export type FitStatus = "fits" | "too-small";

export interface AxisValues {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface FitAssessment {
  status: FitStatus;
  fits: boolean;
  orientationId: string;
  requiredDimensions: Dimensions3D;
  deficitsMm: AxisValues;
  extraRoomMm: AxisValues;
}

export interface EnvelopeAxisBreakdown {
  axis: "length" | "width" | "height";
  itemMm: number;
  firstFacePaddingMm: number;
  oppositeFacePaddingMm: number;
  clearanceMm: number;
  requiredMm: number;
}

export interface ProtectedEnvelopeBreakdown {
  orientationId: string;
  dimensions: Dimensions3D;
  axes: readonly [EnvelopeAxisBreakdown, EnvelopeAxisBreakdown, EnvelopeAxisBreakdown];
}

export interface ProtectedEnvelopeCopy {
  legend: string;
  axes: readonly {axis: EnvelopeAxisBreakdown["axis"]; label: string; formula: string}[];
}

function normalizedItem(item: ItemInput): ItemInput {
  const kind = getItemShapeProfile(item).kind;
  return {...item, dimensions: normalizeDimensionsForProfile(kind, item.dimensions)};
}

function deltas(required: Dimensions3D, available: Dimensions3D) {
  const deficitsMm = {
    lengthMm: Math.max(required.lengthMm - available.lengthMm, 0),
    widthMm: Math.max(required.widthMm - available.widthMm, 0),
    heightMm: Math.max(required.heightMm - available.heightMm, 0),
  };
  const extraRoomMm = {
    lengthMm: Math.max(available.lengthMm - required.lengthMm, 0),
    widthMm: Math.max(available.widthMm - required.widthMm, 0),
    heightMm: Math.max(available.heightMm - required.heightMm, 0),
  };
  return {deficitsMm, extraRoomMm};
}

function sum(values: AxisValues) {
  return values.lengthMm + values.widthMm + values.heightMm;
}

export function assessFit(item: ItemInput, available: Dimensions3D): FitAssessment {
  const candidateItem = normalizedItem(item);
  const candidates = enumerateOrientations(candidateItem).map((orientation, index) => {
    const requiredDimensions = packedEnvelope(candidateItem, orientation).dimensions;
    const {deficitsMm, extraRoomMm} = deltas(requiredDimensions, available);
    const fits = sum(deficitsMm) === 0;
    return {
      status: fits ? "fits" as const : "too-small" as const,
      fits,
      orientationId: orientation.id,
      requiredDimensions,
      deficitsMm,
      extraRoomMm,
      index,
    };
  });

  candidates.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    const primary = a.fits ? sum(a.extraRoomMm) - sum(b.extraRoomMm) : sum(a.deficitsMm) - sum(b.deficitsMm);
    return primary || a.index - b.index;
  });
  const selected = candidates[0];
  return {
    status: selected.status,
    fits: selected.fits,
    orientationId: selected.orientationId,
    requiredDimensions: selected.requiredDimensions,
    deficitsMm: selected.deficitsMm,
    extraRoomMm: selected.extraRoomMm,
  };
}

function orientationFor(item: ItemInput, orientationId?: string): {item: ItemInput; orientation: Orientation} {
  const candidateItem = normalizedItem(item);
  const orientations = enumerateOrientations(candidateItem);
  return {item: candidateItem, orientation: orientations.find((candidate) => candidate.id === orientationId) ?? orientations[0]};
}

export function protectedEnvelopeBreakdown(item: ItemInput, orientationId?: string): ProtectedEnvelopeBreakdown {
  const selected = orientationFor(item, orientationId);
  const envelope = packedEnvelope(selected.item, selected.orientation);
  const dimensions = selected.orientation.packageDimensions;
  return {
    orientationId: selected.orientation.id,
    dimensions: envelope.dimensions,
    axes: [
      {axis: "length", itemMm: dimensions.lengthMm, firstFacePaddingMm: envelope.faceGaps.leftMm, oppositeFacePaddingMm: envelope.faceGaps.rightMm, clearanceMm: selected.item.tolerance.lengthTotalMm, requiredMm: envelope.dimensions.lengthMm},
      {axis: "width", itemMm: dimensions.widthMm, firstFacePaddingMm: envelope.faceGaps.frontMm, oppositeFacePaddingMm: envelope.faceGaps.backMm, clearanceMm: selected.item.tolerance.widthTotalMm, requiredMm: envelope.dimensions.widthMm},
      {axis: "height", itemMm: dimensions.heightMm, firstFacePaddingMm: envelope.faceGaps.bottomMm, oppositeFacePaddingMm: envelope.faceGaps.topMm, clearanceMm: selected.item.tolerance.heightTotalMm, requiredMm: envelope.dimensions.heightMm},
    ],
  };
}

export function protectedEnvelopeCopy(breakdown: ProtectedEnvelopeBreakdown, unit: DisplayUnit): ProtectedEnvelopeCopy {
  const format = (valueMm: number) => formatLengthInput(valueMm, unit);
  return {
    legend: "item + padding at one face + padding at the opposite face + separate clearance",
    axes: breakdown.axes.map((axis) => ({
      axis: axis.axis,
      label: `Inside ${axis.axis}`,
      formula: `${format(axis.itemMm)} + ${format(axis.firstFacePaddingMm)} + ${format(axis.oppositeFacePaddingMm)} + ${format(axis.clearanceMm)} = ${format(axis.requiredMm)} ${unit}`,
    })),
  };
}
