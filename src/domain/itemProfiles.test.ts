import {describe, expect, it} from "vitest";
import {ITEM_PROFILE_DEFINITIONS, ITEM_PROFILES, normalizeDimensionsForProfile, updateProfileDimension} from "./itemProfiles";

describe("measured item profiles", () => {
  it("defines the four customer-visible shapes and their measurement fields", () => {
    expect(ITEM_PROFILES.map((profile) => profile.kind)).toEqual([
      "RECTANGULAR_BOX",
      "CYLINDER_TUBE",
      "ROUNDED_FORM",
      "L_U_MEASURED",
    ]);
    expect(ITEM_PROFILE_DEFINITIONS.RECTANGULAR_BOX.fields.map((field) => field.label)).toEqual(["Outside length", "Outside width", "Outside height"]);
    expect(ITEM_PROFILE_DEFINITIONS.CYLINDER_TUBE.fields.map((field) => field.label)).toEqual(["Tube length", "Outside diameter"]);
    expect(ITEM_PROFILE_DEFINITIONS.ROUNDED_FORM.fields.map((field) => field.label)).toEqual(["Longest diameter", "Side diameter", "Top diameter"]);
    expect(ITEM_PROFILE_DEFINITIONS.L_U_MEASURED.warning).toContain("overall rectangular envelope");
  });

  it("keeps a tube diameter synchronized through the pure profile helpers", () => {
    const dimensions = {lengthMm: 200, widthMm: 40, heightMm: 60};
    expect(normalizeDimensionsForProfile("CYLINDER_TUBE", dimensions)).toEqual({lengthMm: 200, widthMm: 60, heightMm: 60});
    expect(updateProfileDimension({dimensions, shapeProfile: {kind: "CYLINDER_TUBE"}}, "widthMm", 72)).toEqual({lengthMm: 200, widthMm: 72, heightMm: 72});
    expect(updateProfileDimension({dimensions, shapeProfile: {kind: "CYLINDER_TUBE"}}, "heightMm", 88)).toEqual({lengthMm: 200, widthMm: 88, heightMm: 88});
  });

  it("preserves the conservative three-axis envelope for rounded and L/U profiles", () => {
    const dimensions = {lengthMm: 201, widthMm: 139, heightMm: 87};
    expect(normalizeDimensionsForProfile("ROUNDED_FORM", dimensions)).toEqual(dimensions);
    expect(normalizeDimensionsForProfile("L_U_MEASURED", dimensions)).toEqual(dimensions);
  });
});
