export type AnimationRecipe = "wrap" | "rsc" | "existing";

export type WrapAnimationStage =
  | "reveal"
  | "envelope"
  | "scores"
  | "cuts"
  | "cutting"
  | "scrap"
  | "tabs"
  | "walls"
  | "top"
  | "seal"
  | "present";

export type RscAnimationStage = "knocked-down" | "square-tube" | "bottom" | "bottom-tape" | "place-item" | "top" | "top-tape" | "present";
export type AnimationStage = WrapAnimationStage | RscAnimationStage;

export interface AnimationFrame {
  progress: number;
  stage: AnimationStage;
  stageProgress: number;
  reveal: number;
  envelope: number;
  scores: number;
  cuts: number;
  cutting: number;
  scrap: number;
  tabs: number;
  walls: number;
  top: number;
  seal: number;
  present: number;
  label: string;
  checkpointIndex: number;
  stageCount: number;
}

export type WrapAnimationFrame = AnimationFrame;

interface StageDefinition<T extends AnimationStage = AnimationStage> {
  id: T;
  start: number;
  end: number;
  label: string;
}

export const WRAP_ANIMATION_STAGES: readonly StageDefinition<WrapAnimationStage>[] = [
  {id: "reveal", start: 0, end: 0.08, label: "Reveal the sheet and item"},
  {id: "envelope", start: 0.08, end: 0.14, label: "Show the protected envelope"},
  {id: "scores", start: 0.14, end: 0.22, label: "Mark score lines"},
  {id: "cuts", start: 0.22, end: 0.30, label: "Trace the cut boundaries"},
  {id: "cutting", start: 0.30, end: 0.38, label: "Cut the net"},
  {id: "scrap", start: 0.38, end: 0.44, label: "Clear the scrap"},
  {id: "tabs", start: 0.44, end: 0.54, label: "Fold the joining tabs"},
  {id: "walls", start: 0.54, end: 0.72, label: "Raise the side walls"},
  {id: "top", start: 0.72, end: 0.90, label: "Close the top flaps"},
  {id: "seal", start: 0.90, end: 0.97, label: "Tape the centre seam"},
  {id: "present", start: 0.97, end: 1, label: "Finished calculated package"},
];

export const RSC_ANIMATION_STAGES: readonly StageDefinition<RscAnimationStage>[] = [
  {id: "knocked-down", start: 0, end: 0.15, label: "Show the unchanged RSC"},
  {id: "square-tube", start: 0.15, end: 0.30, label: "Square the connected walls"},
  {id: "bottom", start: 0.30, end: 0.48, label: "Close the bottom flaps"},
  {id: "bottom-tape", start: 0.48, end: 0.56, label: "Tape the bottom seam"},
  {id: "place-item", start: 0.56, end: 0.66, label: "Place the protected item"},
  {id: "top", start: 0.66, end: 0.84, label: "Close the top flaps"},
  {id: "top-tape", start: 0.84, end: 0.96, label: "Tape the centre seam"},
  {id: "present", start: 0.96, end: 1, label: "Finished unchanged RSC"},
];

/** An existing box is already erected, so its walkthrough starts with the user's box. */
export const EXISTING_BOX_ANIMATION_STAGES: readonly StageDefinition<RscAnimationStage>[] = [
  {id: "knocked-down", start: 0, end: 0.24, label: "Show your existing box"},
  {id: "place-item", start: 0.24, end: 0.48, label: "Place the protected item"},
  {id: "top", start: 0.48, end: 0.72, label: "Close the top flaps"},
  {id: "top-tape", start: 0.72, end: 0.90, label: "Tape the centre seam"},
  {id: "present", start: 0.90, end: 1, label: "Finished existing box"},
];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function segmentProgress(progress: number, start: number, end: number) {
  if (end <= start) return progress >= end ? 1 : 0;
  return clamp((progress - start) / (end - start));
}

function easeInOutCubic(value: number) {
  const t = clamp(value);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function stageProgress(progress: number, stage: AnimationStage, start: number, end: number) {
  const value = segmentProgress(progress, start, end);
  return stage === "tabs" || stage === "walls" || stage === "top" || stage === "seal" ? easeInOutCubic(value) : value;
}

function stagesFor(recipe: AnimationRecipe) {
  if (recipe === "wrap") return WRAP_ANIMATION_STAGES;
  return recipe === "existing" ? EXISTING_BOX_ANIMATION_STAGES : RSC_ANIMATION_STAGES;
}

function frameFor(progress: number, recipe: AnimationRecipe): AnimationFrame {
  const normalized = clamp(Number.isFinite(progress) ? progress : 0);
  const stages = stagesFor(recipe);
  const stageIndex = Math.min(stages.length - 1, stages.findIndex((candidate) => normalized < candidate.end && normalized >= candidate.start) < 0 ? stages.length - 1 : stages.findIndex((candidate) => normalized < candidate.end && normalized >= candidate.start));
  const stage = stages[stageIndex];
  const values = Object.fromEntries(stages.map((candidate) => [candidate.id, stageProgress(normalized, candidate.id, candidate.start, candidate.end)]));
  if (recipe === "wrap") {
    return {
      progress: normalized, stage: stage.id, stageProgress: stageProgress(normalized, stage.id, stage.start, stage.end), reveal: values.reveal ?? 0, envelope: values.envelope ?? 0, scores: values.scores ?? 0, cuts: values.cuts ?? 0, cutting: values.cutting ?? 0, scrap: values.scrap ?? 0, tabs: values.tabs ?? 0, walls: values.walls ?? 0, top: values.top ?? 0, seal: values.seal ?? 0, present: values.present ?? 0, label: stage.label, checkpointIndex: stageIndex, stageCount: stages.length,
    };
  }
  return {
    progress: normalized, stage: stage.id, stageProgress: stageProgress(normalized, stage.id, stage.start, stage.end), reveal: values["knocked-down"] ?? 0, envelope: values["place-item"] ?? 0, scores: 0, cuts: 0, cutting: 0, scrap: 0, tabs: values.bottom ?? 0, walls: Math.max(values["square-tube"] ?? 0, values.bottom ?? 0, values["bottom-tape"] ?? 0), top: Math.max(values.top ?? 0, values["top-tape"] ?? 0), seal: values["top-tape"] ?? 0, present: values.present ?? 0, label: stage.label, checkpointIndex: stageIndex, stageCount: stages.length,
  };
}

export function getAnimationFrame(progress: number, recipe: AnimationRecipe): AnimationFrame {
  return frameFor(progress, recipe);
}

export function getWrapAnimationFrame(progress: number): WrapAnimationFrame {
  return frameFor(progress, "wrap");
}

export function getAnimationCheckpoint(progress: number, recipe: AnimationRecipe) {
  const stages = stagesFor(recipe);
  const normalized = clamp(Number.isFinite(progress) ? progress : 0);
  const index = stages.reduce((best, stage, stageIndex) => stage.start <= normalized + 0.000001 ? stageIndex : best, 0);
  return {index, count: stages.length, label: stages[index].label};
}

export function nextAnimationCheckpoint(progress: number, recipe: AnimationRecipe, direction: -1 | 1) {
  const stages = stagesFor(recipe);
  const normalized = clamp(Number.isFinite(progress) ? progress : 0);
  const starts = stages.map((stage) => stage.start);
  if (direction > 0) {
    const next = starts.find((start) => start > normalized + 0.000001);
    // The presentation stage starts at the seal boundary, but its first
    // meaningful checkpoint is the completed package at 100%.
    if (next === stages[stages.length - 1]?.start) return 1;
    return next ?? 1;
  }
  const previous = starts.filter((start) => start < normalized - 0.000001);
  return previous.length ? previous[previous.length - 1] : 0;
}
