export type MethodFeasibility = "FEASIBLE" | "NEEDS_RECIPE" | "INFEASIBLE";

export interface MethodRankingInput {
  id: string;
  feasibility: MethodFeasibility;
  confidence?: number;
  totalDeficitMm?: number;
  complexity?: number;
  cuts?: number;
  wasteMm2?: number;
}

function finiteOrUndefined(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function compareOptionalAscending(left: number | undefined, right: number | undefined) {
  const a = finiteOrUndefined(left);
  const b = finiteOrUndefined(right);
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

export function rankMethods<T extends MethodRankingInput>(methods: readonly T[]): T[] {
  return [...methods].sort((a, b) => {
    const feasibility = Number(b.feasibility === "FEASIBLE") - Number(a.feasibility === "FEASIBLE");
    if (feasibility) return feasibility;
    const aConfidence = finiteOrUndefined(a.confidence);
    const bConfidence = finiteOrUndefined(b.confidence);
    if (aConfidence === undefined && bConfidence !== undefined) return 1;
    if (aConfidence !== undefined && bConfidence === undefined) return -1;
    if (aConfidence !== undefined && bConfidence !== undefined && aConfidence !== bConfidence) return bConfidence - aConfidence;
    return compareOptionalAscending(a.totalDeficitMm, b.totalDeficitMm)
      || compareOptionalAscending(a.complexity, b.complexity)
      || compareOptionalAscending(a.cuts, b.cuts)
      || compareOptionalAscending(a.wasteMm2, b.wasteMm2)
      || a.id.localeCompare(b.id);
  });
}

export function needsRecipe(id: string, confidence?: number): MethodRankingInput {
  return {id, feasibility: "NEEDS_RECIPE", confidence};
}
