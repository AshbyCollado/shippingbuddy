import {describe, expect, it} from "vitest";
import {needsRecipe, rankMethods} from "./methodRanking";

describe("method ranking", () => {
  it("orders feasible methods by confidence, deficit, known work, waste, then id", () => {
    const ranked = rankMethods([
      {id: "zeta", feasibility: "FEASIBLE" as const, confidence: 0.9, totalDeficitMm: 0, complexity: 2, cuts: 4, wasteMm2: 20},
      {id: "alpha", feasibility: "FEASIBLE" as const, confidence: 0.9, totalDeficitMm: 0, complexity: 2, cuts: 4, wasteMm2: 20},
      {id: "lower-confidence", feasibility: "FEASIBLE" as const, confidence: 0.5, totalDeficitMm: 0},
      {id: "higher-deficit", feasibility: "FEASIBLE" as const, confidence: 0.9, totalDeficitMm: 2},
      {id: "infeasible", feasibility: "INFEASIBLE" as const, confidence: 1, totalDeficitMm: 0},
      {id: "recipe", feasibility: "NEEDS_RECIPE" as const, confidence: 1},
    ]);
    expect(ranked.map((method) => method.id)).toEqual(["alpha", "zeta", "higher-deficit", "lower-confidence", "infeasible", "recipe"]);
  });

  it("keeps unknown metrics unknown for methods that need a recipe", () => {
    expect(needsRecipe("folded-mailer", 0.7)).toEqual({id: "folded-mailer", feasibility: "NEEDS_RECIPE", confidence: 0.7});
    expect(needsRecipe("folded-mailer")).not.toHaveProperty("cuts");
    expect(needsRecipe("folded-mailer")).not.toHaveProperty("wasteMm2");
  });
});
