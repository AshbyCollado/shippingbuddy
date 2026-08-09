export type DisplayUnit = "in" | "mm";

export const MM_PER_INCH = 25.4;
export const LB_PER_KG = 2.2046226218;
export const QUARTER_INCH_MM = 6.35;
export const NUMERIC_EPSILON_MM = 1e-7;

function cleanNumber(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function inchesToMm(value: number) {
  return cleanNumber(value * MM_PER_INCH, 2);
}

export function mmToInches(value: number) {
  return value / MM_PER_INCH;
}

export function poundsToKg(value: number) {
  return cleanNumber(value / LB_PER_KG, 4);
}

export function kgToPounds(value: number) {
  return value * LB_PER_KG;
}

export function lengthStep(unit: DisplayUnit) {
  return unit === "in" ? 0.25 : 1;
}

export function lengthStepMm(unit: DisplayUnit) {
  return unit === "in" ? QUARTER_INCH_MM : 1;
}

export function weightStep(unit: DisplayUnit) {
  return unit === "in" ? 0.25 : 0.1;
}

export function weightSuffix(unit: DisplayUnit) {
  return unit === "in" ? "lb" : "kg";
}

export function toDisplayLength(valueMm: number, unit: DisplayUnit) {
  return unit === "in" ? mmToInches(valueMm) : valueMm;
}

export function fromDisplayLength(value: number, unit: DisplayUnit) {
  return unit === "in" ? inchesToMm(value) : cleanNumber(value, 2);
}

export function toDisplayWeight(valueKg: number, unit: DisplayUnit) {
  return unit === "in" ? kgToPounds(valueKg) : valueKg;
}

export function fromDisplayWeight(value: number, unit: DisplayUnit) {
  return unit === "in" ? poundsToKg(value) : cleanNumber(value, 4);
}

function trimZeros(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function formatInches(value: number) {
  const rounded = cleanNumber(value, 2);
  const quarter = Math.round(rounded * 4) / 4;
  if (Math.abs(rounded - quarter) < 0.000001) {
    const whole = Math.floor(quarter);
    const fraction = Math.round((quarter - whole) * 100);
    if (fraction === 0) return String(whole);
    return `${whole}.${String(fraction).padStart(2, "0")}`;
  }
  return trimZeros(rounded.toFixed(2));
}

export function formatLengthInput(valueMm: number, unit: DisplayUnit) {
  if (unit === "in") return formatInches(mmToInches(valueMm));
  return trimZeros(cleanNumber(valueMm, 2).toFixed(2));
}

export function formatLengthDisplay(valueMm: number, unit: DisplayUnit) {
  return `${formatLengthInput(valueMm, unit)} ${unit}`;
}

export function formatWeightInput(valueKg: number, unit: DisplayUnit) {
  const value = unit === "in" ? kgToPounds(valueKg) : valueKg;
  return trimZeros(cleanNumber(value, 2).toFixed(2));
}

export function formatDimensions(values: [number, number, number], unit: DisplayUnit) {
  return `${values.map((value) => formatLengthInput(value, unit)).join(" × ")} ${unit}`;
}

export function formatPair(values: [number, number], unit: DisplayUnit) {
  return `${values.map((value) => formatLengthInput(value, unit)).join(" × ")} ${unit}`;
}

export function parseDraft(text: string, unit: DisplayUnit) {
  const normalized = text.trim().replace(/,/g, "");
  if (!normalized || normalized === "." || normalized === "-") return undefined;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return fromDisplayLength(value, unit);
}

export function parseWeightDraft(text: string, unit: DisplayUnit) {
  const normalized = text.trim().replace(/,/g, "");
  if (!normalized || normalized === "." || normalized === "-") return undefined;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return fromDisplayWeight(value, unit);
}

export function nextLengthCheckpoint(valueMm: number, unit: DisplayUnit, direction: -1 | 1) {
  const stepMm = lengthStepMm(unit);
  const quotient = valueMm / stepMm;
  const aligned = Math.abs(quotient - Math.round(quotient)) < 0.000001;
  const next = direction > 0 ? (aligned ? Math.round(quotient) + 1 : Math.ceil(quotient)) : (aligned ? Math.round(quotient) - 1 : Math.floor(quotient));
  return Math.max(0, cleanNumber(next * stepMm, 2));
}

export function nextWeightCheckpoint(value: number, unit: DisplayUnit, direction: -1 | 1) {
  const step = weightStep(unit);
  const quotient = value / step;
  const aligned = Math.abs(quotient - Math.round(quotient)) < 0.000001;
  const next = direction > 0 ? (aligned ? Math.round(quotient) + 1 : Math.ceil(quotient)) : (aligned ? Math.round(quotient) - 1 : Math.floor(quotient));
  return Math.max(0, cleanNumber(next * step, unit === "in" ? 2 : 1));
}

export function ceilToQuarterInchMm(valueMm: number) {
  if (!Number.isFinite(valueMm)) return valueMm;
  return cleanNumber(Math.ceil((valueMm - NUMERIC_EPSILON_MM) / QUARTER_INCH_MM) * QUARTER_INCH_MM, 2);
}

export function isQuarterInch(valueMm: number) {
  const quotient = valueMm / QUARTER_INCH_MM;
  return Math.abs(quotient - Math.round(quotient)) < 0.000001;
}
