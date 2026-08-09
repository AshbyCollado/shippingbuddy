import {ceilToQuarterInchMm, inchesToMm, NUMERIC_EPSILON_MM} from "./measurements";
import {foldNetFromWrapPlan, type FoldNet} from "./foldnet";

export type Axis = "length" | "width" | "height";
export type Fragility = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
export type ProtectionGoal = 1 | 2 | 3 | 4 | 5;
export type ItemShapeKind = "RECTANGULAR_BOX" | "CYLINDER_TUBE" | "ROUNDED_FORM" | "L_U_MEASURED";

export interface ItemShapeProfile {
  kind: ItemShapeKind;
  /** Optional measured radius for cylindrical/rounded objects. */
  radiusMm?: number;
  /** Optional tube wall diameter; the dimensions remain the safe outer envelope. */
  tubeDiameterMm?: number;
  note?: string;
}

export const PROTECTION_GOAL_MM: Record<ProtectionGoal, number> = {
  1: 12.7,
  2: 25.4,
  3: 38.1,
  4: 50.8,
  5: 76.2,
};

export function protectionGoalToMm(goal: ProtectionGoal): number {
  return PROTECTION_GOAL_MM[goal];
}

export function protectionGoalFromMm(valueMm: number): ProtectionGoal {
  return (Object.entries(PROTECTION_GOAL_MM) as [string, number][]).reduce((closest, [key, value]) => {
    const candidate = Number(key) as ProtectionGoal;
    return Math.abs(value - valueMm) < Math.abs(PROTECTION_GOAL_MM[closest] - valueMm) ? candidate : closest;
  }, 1 as ProtectionGoal);
}

export interface Dimensions3D {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface Cushioning {
  leftMm: number;
  rightMm: number;
  frontMm: number;
  backMm: number;
  bottomMm: number;
  topMm: number;
}

export interface FitTolerance {
  lengthTotalMm: number;
  widthTotalMm: number;
  heightTotalMm: number;
}

export interface ItemInput {
  dimensions: Dimensions3D;
  /** Optional shape metadata. Dimensions remain the measured outer envelope. */
  shapeProfile?: ItemShapeProfile;
  /** Alias used by integrations that call the measured form a profile. */
  profile?: ItemShapeProfile;
  weightKg: number;
  fragility: Fragility;
  cushioning: Cushioning;
  tolerance: FitTolerance;
  allowRotation: boolean;
  keepUpright: boolean;
}

export interface Point2D { xMm: number; yMm: number; }

export interface ScrapRegion {
  id: string;
  points: Point2D[];
}

export interface Rect2D {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  role: "PANEL" | "FLAP" | "TAB";
}

export interface WrapProfile {
  thicknessMm: number;
  preferredTabProjectionMm: number;
  minimumTabProjectionMm: number;
  tabEndClearanceMm: number;
  topSeamGapMm: number;
  minimumCutGapMm: number;
  topFlapSideClearanceMm: number;
  sheetEdgeMarginMm: number;
}

export const PROTOTYPE_PROFILE: WrapProfile = {
  thicknessMm: 4,
  preferredTabProjectionMm: 40,
  minimumTabProjectionMm: 32,
  tabEndClearanceMm: 8,
  topSeamGapMm: 4,
  minimumCutGapMm: 3,
  topFlapSideClearanceMm: 1,
  sheetEdgeMarginMm: 5,
};

export interface Orientation {
  id: string;
  packageDimensions: Dimensions3D;
  packageAxes: [string, string, string];
  upright: boolean;
}

export interface PackedEnvelope {
  dimensions: Dimensions3D;
  offsetMm: Point2D;
  faceGaps: Cushioning;
  itemProfile: ItemShapeProfile;
}

export interface WrapMetrics {
  netWidthMm: number;
  netHeightMm: number;
  requiredSheetWidthMm: number;
  requiredSheetHeightMm: number;
  materialAreaMm2: number;
  scrapAreaMm2: number;
  cutCount: number;
  scoreCount: number;
  foldCount: number;
  cutLengthMm: number;
}

export interface WrapPlan {
  id: "WRAP_BOX_V1";
  patternId: "WRAP_BOX_V1" | "MAILER_BOX_V1" | "TAB_INSERT_V1";
  requiredInternal: Dimensions3D;
  packedEnvelope: PackedEnvelope;
  profile: WrapProfile;
  rectangles: Rect2D[];
  scrapRegions: ScrapRegion[];
  cuts: { id: string; from: Point2D; to: Point2D }[];
  scores: { id: string; from: Point2D; to: Point2D }[];
  metrics: WrapMetrics;
  warnings: string[];
  foldNet: FoldNet;
}

export interface CommonBoxEntry {
  id: string;
  name: string;
  internalDimensions: Dimensions3D;
  note: string;
}

export interface RscPlan {
  id: "RSC_0201";
  sourceMode: "COMMON_BOX" | "EXISTING_BOX";
  name: string;
  requiredInternal: Dimensions3D;
  finalInternal: Dimensions3D;
  externalDimensions: Dimensions3D;
  materialAreaMm2: number;
  userCuts: number;
  userScores: number;
  warnings: string[];
  orientationId: string;
}

function defineCommonBoxInches(id: string, name: string, dimensions: [number, number, number], note: string): CommonBoxEntry {
  return {id, name, internalDimensions: {lengthMm: inchesToMm(dimensions[0]), widthMm: inchesToMm(dimensions[1]), heightMm: inchesToMm(dimensions[2])}, note};
}

export const COMMON_BOXES: CommonBoxEntry[] = [
  defineCommonBoxInches("RSC-01", "Representative RSC · Small", [11, 9, 6], "Nominal prototype size; verify the actual box."),
  defineCommonBoxInches("RSC-02", "Representative RSC · Medium", [18, 17, 16], "Nominal prototype size; verify the actual box."),
  defineCommonBoxInches("RSC-03", "Representative RSC · Shallow", [20, 15, 4], "Nominal prototype size; verify the actual box."),
  defineCommonBoxInches("RSC-04", "Representative RSC · Large", [24, 20, 17], "Nominal prototype size; verify the actual box."),
  defineCommonBoxInches("RSC-05", "Representative RSC · Long", [30, 10, 9], "Nominal prototype size; verify the actual box."),
];

export const FRAGILITY_PRESETS: Record<Fragility, number> = {
  LOW: 12.7,
  MODERATE: 25.4,
  HIGH: 50.8,
  VERY_HIGH: 76.2,
};

const EPSILON_MM = NUMERIC_EPSILON_MM;

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateItem(input: ItemInput): string[] {
  const errors: string[] = [];
  for (const [label, value] of Object.entries(input.dimensions)) {
    if (!positive(value)) errors.push(`${label} must be greater than zero.`);
  }
  if (!positive(input.weightKg)) errors.push("Weight must be greater than zero.");
  for (const [label, value] of Object.entries(input.cushioning)) {
    if (!Number.isFinite(value) || value < 0) errors.push(`${label} cushioning cannot be negative.`);
  }
  for (const [label, value] of Object.entries(input.tolerance)) {
    if (!Number.isFinite(value) || value < 0) errors.push(`${label} clearance cannot be negative.`);
  }
  return errors;
}

export function enumerateOrientations(input: ItemInput): Orientation[] {
  const {lengthMm: L, widthMm: W, heightMm: H} = input.dimensions;
  const all: Orientation[] = [
    {id: "LWH", packageDimensions: {lengthMm: L, widthMm: W, heightMm: H}, packageAxes: ["+L", "+W", "+H"], upright: true},
    {id: "LHW", packageDimensions: {lengthMm: L, widthMm: H, heightMm: W}, packageAxes: ["+L", "+H", "−W"], upright: false},
    {id: "WLH", packageDimensions: {lengthMm: W, widthMm: L, heightMm: H}, packageAxes: ["+W", "−L", "+H"], upright: true},
    {id: "WHL", packageDimensions: {lengthMm: W, widthMm: H, heightMm: L}, packageAxes: ["+W", "+H", "+L"], upright: false},
    {id: "HLW", packageDimensions: {lengthMm: H, widthMm: L, heightMm: W}, packageAxes: ["+H", "+L", "+W"], upright: false},
    {id: "HWL", packageDimensions: {lengthMm: H, widthMm: W, heightMm: L}, packageAxes: ["+H", "+W", "−L"], upright: false},
  ];
  const allowed = !input.allowRotation ? all.slice(0, 1) : input.keepUpright ? all.filter((o) => o.upright) : all;
  const seen = new Set<string>();
  return allowed.filter((orientation) => {
    const key = Object.values(orientation.packageDimensions).join("/");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orientedCushioning(id: string, c: Cushioning): Cushioning {
  const byAxis: Record<string, [number, number]> = {
    L: [c.leftMm, c.rightMm], W: [c.frontMm, c.backMm], H: [c.bottomMm, c.topMm],
  };
  const signs = id.split("").map((axis) => byAxis[axis]);
  return {leftMm: signs[0][0], rightMm: signs[0][1], frontMm: signs[1][0], backMm: signs[1][1], bottomMm: signs[2][0], topMm: signs[2][1]};
}

export function getItemShapeProfile(input: Pick<ItemInput, "shapeProfile" | "profile">): ItemShapeProfile {
  return input.shapeProfile ?? input.profile ?? {kind: "RECTANGULAR_BOX", note: "Measured rectangular envelope."};
}

export function packedEnvelope(input: ItemInput, orientation: Orientation): PackedEnvelope {
  const c = orientedCushioning(orientation.id, input.cushioning);
  const t = input.tolerance;
  const dimensions = {
    lengthMm: orientation.packageDimensions.lengthMm + c.leftMm + c.rightMm + t.lengthTotalMm,
    widthMm: orientation.packageDimensions.widthMm + c.frontMm + c.backMm + t.widthTotalMm,
    heightMm: orientation.packageDimensions.heightMm + c.bottomMm + c.topMm + t.heightTotalMm,
  };
  return {
    dimensions,
    offsetMm: {xMm: (c.leftMm - c.rightMm) / 2, yMm: (c.frontMm - c.backMm) / 2},
    faceGaps: c,
    itemProfile: getItemShapeProfile(input),
  };
}

function rect(id: string, xMm: number, yMm: number, widthMm: number, heightMm: number, role: Rect2D["role"]): Rect2D {
  return {id, xMm, yMm, widthMm, heightMm, role};
}

function line(id: string, from: Point2D, to: Point2D) { return {id, from, to}; }

type Edge = {axis: "h" | "v"; coordinate: number; start: number; end: number; from: Point2D; to: Point2D};

function rectangleEdges(item: Rect2D): Edge[] {
  const left = item.xMm;
  const right = item.xMm + item.widthMm;
  const top = item.yMm;
  const bottom = item.yMm + item.heightMm;
  return [
    {axis: "h", coordinate: top, start: left, end: right, from: {xMm: left, yMm: top}, to: {xMm: right, yMm: top}},
    {axis: "h", coordinate: bottom, start: left, end: right, from: {xMm: left, yMm: bottom}, to: {xMm: right, yMm: bottom}},
    {axis: "v", coordinate: left, start: top, end: bottom, from: {xMm: left, yMm: top}, to: {xMm: left, yMm: bottom}},
    {axis: "v", coordinate: right, start: top, end: bottom, from: {xMm: right, yMm: top}, to: {xMm: right, yMm: bottom}},
  ];
}

/** Derive only exposed net edges; shared rectangle edges are score/hinge boundaries. */
function exposedCutSegments(rectangles: Rect2D[]) {
  const edges = rectangles.flatMap(rectangleEdges);
  const cuts: {id: string; from: Point2D; to: Point2D}[] = [];
  edges.forEach((edge, edgeIndex) => {
    const breakpoints = new Set([edge.start, edge.end]);
    edges.forEach((other, otherIndex) => {
      if (edgeIndex === otherIndex || other.axis !== edge.axis || Math.abs(other.coordinate - edge.coordinate) > EPSILON_MM) return;
      const overlapStart = Math.max(edge.start, other.start);
      const overlapEnd = Math.min(edge.end, other.end);
      if (overlapEnd > overlapStart + EPSILON_MM) {
        breakpoints.add(overlapStart);
        breakpoints.add(overlapEnd);
      }
    });
    const points = [...breakpoints].sort((a, b) => a - b);
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end - start <= EPSILON_MM) continue;
      const midpoint = (start + end) / 2;
      const covered = edges.some((other, otherIndex) => otherIndex !== edgeIndex && other.axis === edge.axis && Math.abs(other.coordinate - edge.coordinate) <= EPSILON_MM && other.start <= midpoint + EPSILON_MM && other.end >= midpoint - EPSILON_MM);
      if (covered) continue;
      const from = edge.axis === "h" ? {xMm: start, yMm: edge.coordinate} : {xMm: edge.coordinate, yMm: start};
      const to = edge.axis === "h" ? {xMm: end, yMm: edge.coordinate} : {xMm: edge.coordinate, yMm: end};
      cuts.push(line(`cut-${cuts.length + 1}`, from, to));
    }
  });
  return cuts;
}

export type WrapPatternId = "WRAP_BOX_V1" | "MAILER_BOX_V1" | "TAB_INSERT_V1";

export function generateWrapPlan(envelope: PackedEnvelope, profile: WrapProfile = PROTOTYPE_PROFILE, patternId: WrapPatternId = "WRAP_BOX_V1"): WrapPlan | {error: string} {
  const {lengthMm: L, widthMm: W, heightMm: H} = envelope.dimensions;
  const t = profile.thicknessMm;
  const a = t / 2;
  const T = Math.min(profile.preferredTabProjectionMm, 0.25 * Math.min(L, W));
  const Tref = T + a;
  const BL = L + t;
  const BW = W + 3 * t;
  const WH = H + t;
  const G = Math.max(profile.topSeamGapMm, t, 2);
  const F = (BW - G) / 2;
  const Cz = Math.max(profile.tabEndClearanceMm, 2 * t, 4);
  const D = a + Cz;
  const TH = H - 2 * Cz;
  const S = Math.max(profile.minimumCutGapMm, t + 2 * profile.topFlapSideClearanceMm);
  const Q = S / 2;
  const patternLabel = patternId === "MAILER_BOX_V1" ? "mailer/tuck-end" : patternId === "TAB_INSERT_V1" ? "tab-insert/partition" : "one-piece wrap";
  const warnings = [`${patternLabel} dimensions and score allowances require physical validation for the selected board.`];
  if (T < profile.minimumTabProjectionMm) return {error: `This box is too small for the minimum ${profile.minimumTabProjectionMm} mm corner-tab geometry.`};
  if (TH < 50) return {error: "The wall height leaves less than 50 mm of usable corner-tab bond."};
  if (BW <= G || F <= 0 || BL <= 2 * Q) return {error: "The top-flap clearance leaves no valid closure."};

  const rectangles: Rect2D[] = [
    rect("bottom", 0, 0, BL, BW, "PANEL"),
    rect("front-wall", a, -WH, BL - 2 * a, WH, "PANEL"),
    rect("back-wall", a, BW, BL - 2 * a, WH, "PANEL"),
    rect("left-wall", -WH, 0, WH, BW, "PANEL"),
    rect("right-wall", BL, 0, WH, BW, "PANEL"),
    rect("front-flap", Q, -WH - F, BL - 2 * Q, F, "FLAP"),
    rect("back-flap", Q, BW + WH, BL - 2 * Q, F, "FLAP"),
    rect("left-front-tab", -WH + D, -Tref, TH, Tref, "TAB"),
    rect("left-back-tab", -WH + D, BW, TH, Tref, "TAB"),
    rect("right-front-tab", BL + D, -Tref, TH, Tref, "TAB"),
    rect("right-back-tab", BL + D, BW, TH, Tref, "TAB"),
  ];
  const cuts = exposedCutSegments(rectangles);
  const scores = [
    line("front-bottom-hinge", {xMm: 0, yMm: 0}, {xMm: BL, yMm: 0}),
    line("back-bottom-hinge", {xMm: 0, yMm: BW}, {xMm: BL, yMm: BW}),
    line("left-bottom-hinge", {xMm: 0, yMm: 0}, {xMm: 0, yMm: BW}),
    line("right-bottom-hinge", {xMm: BL, yMm: 0}, {xMm: BL, yMm: BW}),
    line("front-top-hinge", {xMm: Q, yMm: -WH}, {xMm: BL - Q, yMm: -WH}),
    line("back-top-hinge", {xMm: Q, yMm: BW + WH}, {xMm: BL - Q, yMm: BW + WH}),
  ];
  const profileScores = patternId === "TAB_INSERT_V1"
    ? [...scores, line("partition-score", {xMm: BL / 2, yMm: 0}, {xMm: BL / 2, yMm: BW}), line("partition-lock-score", {xMm: BL * 0.22, yMm: BW / 2}, {xMm: BL * 0.78, yMm: BW / 2})]
    : patternId === "MAILER_BOX_V1"
      ? [...scores, line("mailer-tuck-score", {xMm: Q, yMm: BW + WH - F * 0.22}, {xMm: BL - Q, yMm: BW + WH - F * 0.22})]
      : scores;
  const profileCuts = patternId === "MAILER_BOX_V1"
    ? [...cuts, line("mailer-lock-cut", {xMm: BL * 0.12, yMm: BW + WH - F * 0.42}, {xMm: BL * 0.88, yMm: BW + WH - F * 0.42})]
    : patternId === "TAB_INSERT_V1"
      ? [...cuts, line("partition-relief-cut", {xMm: BL / 2 - 8, yMm: 0}, {xMm: BL / 2 - 8, yMm: BW})]
      : cuts;
  const netWidthMm = BL + 2 * WH;
  const netHeightMm = BW + 2 * Math.max(WH + F, Tref);
  const minX = Math.min(...rectangles.map((item) => item.xMm));
  const minY = Math.min(...rectangles.map((item) => item.yMm));
  const maxX = Math.max(...rectangles.map((item) => item.xMm + item.widthMm));
  const maxY = Math.max(...rectangles.map((item) => item.yMm + item.heightMm));
  const sx = minX - profile.sheetEdgeMarginMm;
  const sy = minY - profile.sheetEdgeMarginMm;
  const ex = maxX + profile.sheetEdgeMarginMm;
  const ey = maxY + profile.sheetEdgeMarginMm;
  const scrapRegions: ScrapRegion[] = [
    {id: "scrap-left", points: [{xMm: sx, yMm: sy}, {xMm: minX, yMm: sy}, {xMm: minX, yMm: ey}, {xMm: sx, yMm: ey}]},
    {id: "scrap-right", points: [{xMm: maxX, yMm: sy}, {xMm: ex, yMm: sy}, {xMm: ex, yMm: ey}, {xMm: maxX, yMm: ey}]},
    {id: "scrap-top", points: [{xMm: minX, yMm: sy}, {xMm: maxX, yMm: sy}, {xMm: maxX, yMm: minY}, {xMm: minX, yMm: minY}]},
    {id: "scrap-bottom", points: [{xMm: minX, yMm: maxY}, {xMm: maxX, yMm: maxY}, {xMm: maxX, yMm: ey}, {xMm: minX, yMm: ey}]},
  ];
  const materialAreaMm2 = rectangles.reduce((sum, item) => sum + item.widthMm * item.heightMm, 0);
  const metrics: WrapMetrics = {
    netWidthMm, netHeightMm,
    requiredSheetWidthMm: netWidthMm + 2 * profile.sheetEdgeMarginMm,
    requiredSheetHeightMm: netHeightMm + 2 * profile.sheetEdgeMarginMm,
    materialAreaMm2,
    scrapAreaMm2: Math.max(0, (netWidthMm + 2 * profile.sheetEdgeMarginMm) * (netHeightMm + 2 * profile.sheetEdgeMarginMm) - materialAreaMm2),
    cutCount: profileCuts.length,
    scoreCount: profileScores.length,
    foldCount: rectangles.length - 1,
    cutLengthMm: profileCuts.reduce((sum, item) => sum + Math.hypot(item.to.xMm - item.from.xMm, item.to.yMm - item.from.yMm), 0),
  };
  const basePlan = {id: "WRAP_BOX_V1" as const, patternId, requiredInternal: envelope.dimensions, packedEnvelope: envelope, profile, rectangles, scrapRegions, cuts: profileCuts, scores: profileScores, metrics, warnings};
  return {...basePlan, foldNet: foldNetFromWrapPlan(basePlan)};
}

/** Generate one of the supported parametric construction profiles. The same
 * FoldNet authority drives every profile; legacy rectangle fields remain for
 * SVG/test compatibility. */
export function generatePatternPlan(envelope: PackedEnvelope, pattern: WrapPatternId, profile: WrapProfile = PROTOTYPE_PROFILE): WrapPlan | {error: string} {
  return generateWrapPlan(envelope, profile, pattern);
}

export const generateMailerPlan = (envelope: PackedEnvelope, profile: WrapProfile = PROTOTYPE_PROFILE) => generatePatternPlan(envelope, "MAILER_BOX_V1", profile);
export const generateTabInsertPlan = (envelope: PackedEnvelope, profile: WrapProfile = PROTOTYPE_PROFILE) => generatePatternPlan(envelope, "TAB_INSERT_V1", profile);

/** Choose the orientation that fits the current stock with the least growth;
 * when several are equal, preserve the customer's original L/W/H order. */
export function chooseWrapOrientation(input: ItemInput, sheet: {lengthMm: number; widthMm: number}, pattern: WrapPatternId = "WRAP_BOX_V1"): Orientation {
  const candidates = enumerateOrientations(input);
  const scored = candidates.map((orientation, index) => {
    const result = generatePatternPlan(packedEnvelope(input, orientation), pattern);
    if ("error" in result) return {orientation, index, fits: false, area: Number.POSITIVE_INFINITY, growth: Number.POSITIVE_INFINITY};
    const fit = fitsSheet(result, sheet);
    const fitted = autoFitSheet(result, sheet);
    const growth = fitted.lengthMm * fitted.widthMm - sheet.lengthMm * sheet.widthMm;
    return {orientation, index, fits: fit.fits, area: result.metrics.requiredSheetWidthMm * result.metrics.requiredSheetHeightMm, growth};
  });
  scored.sort((a, b) => Number(b.fits) - Number(a.fits) || a.growth - b.growth || a.area - b.area || a.index - b.index);
  return scored[0]?.orientation ?? candidates[0];
}

export function fitsSheet(plan: WrapPlan, sheet: {lengthMm: number; widthMm: number}): {fits: boolean; shortfall: {lengthMm: number; widthMm: number}; rotatedFits: boolean} {
  const a = plan.metrics.requiredSheetWidthMm;
  const b = plan.metrics.requiredSheetHeightMm;
  const direct = a <= sheet.lengthMm + EPSILON_MM && b <= sheet.widthMm + EPSILON_MM;
  const rotated = b <= sheet.lengthMm + EPSILON_MM && a <= sheet.widthMm + EPSILON_MM;
  const directShortfall = {lengthMm: Math.max(0, a - sheet.lengthMm), widthMm: Math.max(0, b - sheet.widthMm)};
  const rotatedShortfall = {lengthMm: Math.max(0, b - sheet.lengthMm), widthMm: Math.max(0, a - sheet.widthMm)};
  const shortfall = direct ? {lengthMm: 0, widthMm: 0} : rotated ? {lengthMm: 0, widthMm: 0} : (directShortfall.lengthMm + directShortfall.widthMm <= rotatedShortfall.lengthMm + rotatedShortfall.widthMm ? directShortfall : rotatedShortfall);
  return {fits: direct || rotated, shortfall, rotatedFits: rotated};
}

export function autoFitSheet(plan: WrapPlan, current: {lengthMm: number; widthMm: number}): {lengthMm: number; widthMm: number; orientation: "direct" | "rotated" | "unchanged"} {
  const fit = fitsSheet(plan, current);
  const directFits = plan.metrics.requiredSheetWidthMm <= current.lengthMm + EPSILON_MM && plan.metrics.requiredSheetHeightMm <= current.widthMm + EPSILON_MM;
  if (fit.fits) return {...current, orientation: directFits ? "unchanged" : "rotated"};
  const requiredLength = ceilToQuarterInchMm(plan.metrics.requiredSheetWidthMm);
  const requiredWidth = ceilToQuarterInchMm(plan.metrics.requiredSheetHeightMm);
  const candidates = [
    {lengthMm: Math.max(current.lengthMm, requiredLength), widthMm: Math.max(current.widthMm, requiredWidth), orientation: "direct" as const},
    {lengthMm: Math.max(current.lengthMm, requiredWidth), widthMm: Math.max(current.widthMm, requiredLength), orientation: "rotated" as const},
  ];
  const areaIncrease = (candidate: typeof candidates[number]) => (candidate.lengthMm * candidate.widthMm) - (current.lengthMm * current.widthMm);
  candidates.sort((a, b) => areaIncrease(a) - areaIncrease(b) || Math.max(a.lengthMm - current.lengthMm, a.widthMm - current.widthMm) - Math.max(b.lengthMm - current.lengthMm, b.widthMm - current.widthMm) || (a.lengthMm - current.lengthMm + a.widthMm - current.widthMm) - (b.lengthMm - current.lengthMm + b.widthMm - current.widthMm) || (a.orientation === "direct" ? -1 : 1));
  return candidates[0];
}

export function generateCommonBoxPlan(input: ItemInput, sourceMode: "COMMON_BOX" | "EXISTING_BOX", source?: CommonBoxEntry): RscPlan | {error: string} {
  const candidates = enumerateOrientations(input).map((orientation) => ({orientation, envelope: packedEnvelope(input, orientation)}));
  const box = source ?? COMMON_BOXES.find((candidate) => candidates.some((candidatePlan) => fitsDimensions(candidatePlan.envelope.dimensions, candidate.internalDimensions)));
  if (!box) return {error: "No unchanged catalog box contains the packed envelope. Try less cushioning or a custom sheet."};
  const selected = candidates.find((candidate) => fitsDimensions(candidate.envelope.dimensions, box.internalDimensions));
  if (!selected) return {error: `${box.name} is too small for the packed envelope in every allowed orientation.`};
  const {orientation, envelope} = selected;
  const {lengthMm: L, widthMm: W, heightMm: H} = box.internalDimensions;
  return {
    id: "RSC_0201",
    sourceMode,
    name: box.name,
    requiredInternal: envelope.dimensions,
    finalInternal: box.internalDimensions,
    externalDimensions: {lengthMm: L + 8, widthMm: W + 8, heightMm: H + 16},
    materialAreaMm2: 2 * (L * W + L * H + W * H),
    userCuts: 0,
    userScores: 0,
    warnings: ["Catalog dimensions are representative. Verify the actual box's internal dimensions before packing.", "Strength is unverified without exact-box evidence and a completed parcel weight."],
    orientationId: orientation.id,
  };
}

export function fitsDimensions(required: Dimensions3D, available: Dimensions3D): boolean {
  return required.lengthMm <= available.lengthMm + EPSILON_MM && required.widthMm <= available.widthMm + EPSILON_MM && required.heightMm <= available.heightMm + EPSILON_MM;
}

export function renderWrapSvg(plan: WrapPlan): string {
  const minX = Math.min(...plan.foldNet.vertices.map((item) => item.xMm));
  const minY = Math.min(...plan.foldNet.vertices.map((item) => item.yMm));
  const maxX = Math.max(...plan.foldNet.vertices.map((item) => item.xMm));
  const maxY = Math.max(...plan.foldNet.vertices.map((item) => item.yMm));
  const padding = 26;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const tx = -minX + padding;
  const ty = -minY + padding;
  const polygons = plan.foldNet.faces.map((face) => {
    const points = face.vertexIds.map((id) => plan.foldNet.vertices.find((vertex) => vertex.id === id)).filter(Boolean).map((point) => `${point!.xMm},${point!.yMm}`).join(" ");
    return `<polygon points="${points}" class="${face.role.toLowerCase()}" data-face="${face.id}"/>`;
  }).join("");
  const scores = plan.scores.map((item) => `<line x1="${item.from.xMm}" y1="${item.from.yMm}" x2="${item.to.xMm}" y2="${item.to.yMm}" class="score"/>`).join("");
  const cuts = plan.cuts.map((item) => `<line x1="${item.from.xMm}" y1="${item.from.yMm}" x2="${item.to.xMm}" y2="${item.to.yMm}" class="cut"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><title>Shipping Buddy wrap box cutting layout</title><desc>Millimetre cutting layout. Use the calibration bar and verify actual material before cutting.</desc><style>.panel{fill:#dff3eb;stroke:#8bcab5;stroke-width:1}.flap{fill:#fff1de;stroke:#e7b778;stroke-width:1}.tab{fill:#f7e1cc;stroke:#dc9c62;stroke-width:1}.score{stroke:#379e7e;stroke-width:1.7;stroke-dasharray:8 6}.cut{stroke:#e17e62;stroke-width:2}</style><g transform="translate(${tx} ${ty})">${polygons}${scores}${cuts}<line x1="${maxX - 126}" y1="${maxY + 14}" x2="${maxX - 26}" y2="${maxY + 14}" stroke="#17222b" stroke-width="2"/><text x="${maxX - 126}" y="${maxY + 27}" font-family="monospace" font-size="9">100 mm calibration bar</text></g></svg>`;
}

export function mm(value: number): string { return `${Math.round(value)} mm`; }
