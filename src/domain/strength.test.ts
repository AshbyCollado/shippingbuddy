import {describe, expect, it} from "vitest";
import {assessParcelStrength} from "./strength";

describe("strength assessment", () => {
  const rating = {source: "BOX_MAKERS_CERTIFICATE" as const, exactBoxId: "CERT-123", maximumGrossWeightKg: 29.5};
  it("keeps fit separate from verification", () => {
    expect(assessParcelStrength({operation: "BUILD_FROM_FLAT_SHEET", condition: "NEW", itemWeightKg: 3, rating}).status).toBe("STRENGTH_UNVERIFIED");
  });
  it("verifies only an unchanged new exact box with measured weight", () => {
    expect(assessParcelStrength({operation: "USE_UNCHANGED", condition: "NEW", itemWeightKg: 3, finalMeasuredPackedWeightKg: 10, rating}).status).toBe("VERIFIED_WITH_PROVIDED_RATING");
  });
  it("blocks an exceeded rating", () => {
    const result = assessParcelStrength({operation: "USE_UNCHANGED", condition: "NEW", itemWeightKg: 3, finalMeasuredPackedWeightKg: 32, rating});
    expect(result.status).toBe("KNOWN_LIMIT_EXCEEDED");
    expect(result.blocking).toBe(true);
  });
});
