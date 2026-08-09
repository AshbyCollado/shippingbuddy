import {describe, expect, it} from "vitest";
import {calculateFefco03Telescope, calculateRscSplice, resolveConservativePart, type ExternalSleeveSpliceInput, type Fefco03TelescopeInput, type InternalNestingSpliceInput} from "./telescope";

const identity = ["lengthMm", "widthMm", "heightMm"] as const;

function telescopeBase(): Fefco03TelescopeInput {
  return {
    body: {
      role: "BODY", styleReference: "FEFCO 0300 body", designBasis: "FEFCO_03", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT",
      measurement: {basis: "INSIDE", rawDimensions: {lengthMm: 500, widthMm: 400, heightMm: 300}, boardThicknessMm: 4, uncertaintyMm: 0.5},
      axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "INSIDE", depthMm: 300, closedEndWallCount: 1},
    },
    lid: {
      role: "LID", styleReference: "FEFCO 0300 lid", designBasis: "FEFCO_03", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT",
      measurement: {basis: "OUTSIDE", rawDimensions: {lengthMm: 520, widthMm: 420, heightMm: 200}, boardThicknessMm: 4, uncertaintyMm: 0.5},
      axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "OUTSIDE", depthMm: 200, closedEndWallCount: 1},
    },
    bodyAxisPermutation: identity, lidAxisPermutation: identity, targetAxis: "heightMm",
    targetInternal: {lengthMm: 500, widthMm: 400, heightMm: 420}, overlapMm: 50, minimumOverlapMm: 40, minimumClearancePerSideMm: 1,
  };
}

function protectedFitBase(): Fefco03TelescopeInput {
  const base = telescopeBase();
  return {
    ...base,
    body: {
      ...base.body,
      measurement: {...base.body.measurement, rawDimensions: {lengthMm: 406.4, widthMm: 406.4, heightMm: 300}},
    },
    lid: {
      ...base.lid,
      measurement: {...base.lid.measurement, rawDimensions: {lengthMm: 426.4, widthMm: 426.4, heightMm: 160.9}},
      axialMeasurement: {...base.lid.axialMeasurement, depthMm: 160.9},
    },
    targetInternal: {lengthMm: 406.4, widthMm: 406.4, heightMm: 406.4},
  };
}

function internalBase(): InternalNestingSpliceInput {
  return {
    mode: "INTERNAL_NESTING", arrangement: "PART_A_INTO_PART_B", targetAxis: "heightMm", partAAxisPermutation: identity, partBAxisPermutation: identity,
    targetInternal: {lengthMm: 300, widthMm: 200, heightMm: 190}, overlapMm: 30, minimumOverlapMm: 30, minimumClearancePerSideMm: 5,
    partA: {role: "PART_A", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT", axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "INSIDE", depthMm: 120, closedEndWallCount: 0}, measurement: {basis: "INSIDE", rawDimensions: {lengthMm: 300, widthMm: 200, heightMm: 120}, boardThicknessMm: 4, uncertaintyMm: 1}},
    partB: {role: "PART_B", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT", axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "INSIDE", depthMm: 100, closedEndWallCount: 0}, measurement: {basis: "INSIDE", rawDimensions: {lengthMm: 320, widthMm: 220, heightMm: 100}, boardThicknessMm: 4}},
  };
}

function sleeveBase(): ExternalSleeveSpliceInput {
  return {
    mode: "EXTERNAL_SLEEVE", arrangement: "OPEN_SLEEVE_AROUND_PARTS", targetAxis: "heightMm", partAAxisPermutation: identity, partBAxisPermutation: identity,
    targetInternal: {lengthMm: 300, widthMm: 200, heightMm: 230}, coverageAMm: 60, coverageBMm: 60, minimumCoverageMm: 60, seamIntrusionMm: 0, minimumClearancePerSideMm: 1,
    partA: {role: "PART_A", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT", axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "INSIDE", depthMm: 120, closedEndWallCount: 0}, measurement: {basis: "INSIDE", rawDimensions: {lengthMm: 300, widthMm: 200, heightMm: 120}, boardThicknessMm: 4}},
    partB: {role: "PART_B", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT", axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "INSIDE", depthMm: 120, closedEndWallCount: 0}, measurement: {basis: "INSIDE", rawDimensions: {lengthMm: 300, widthMm: 200, heightMm: 120}, boardThicknessMm: 4}},
    sleeve: {
      form: "OPEN", condition: "NEW", joint: "ADHESIVE", sourceState: "ORIGINAL_INTACT", axisPermutation: identity,
      crossMeasurement: {basis: "INSIDE", rawDimensions: {lengthMm: 310, widthMm: 210, heightMm: 1}, boardThicknessMm: 4}, axialLengthMm: 120,
    },
  };
}

const expectError = (result: ReturnType<typeof calculateFefco03Telescope> | ReturnType<typeof calculateRscSplice> | ReturnType<typeof resolveConservativePart>, code: string) => {
  expect("error" in result).toBe(true);
  if ("error" in result) expect(result.diagnostics[0].code).toBe(code);
};

describe("purpose-built FEFCO 03 telescope", () => {
  it("resolves the direct body/lid fixture conservatively and produces a frozen audit plan", () => {
    const result = calculateFefco03Telescope(telescopeBase());
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({
      id: "RSC_FEFCO_03_TELESCOPE_V1", status: "PROTOTYPE_ONLY", targetAxis: "heightMm",
      body: {outerDimensions: {lengthMm: 509, widthMm: 409, heightMm: 304.5}},
      lid: {internalDimensions: {lengthMm: 511, widthMm: 411, heightMm: 195.5}},
      clearancePerSideMm: [1, 1], finalInternal: {lengthMm: 500, widthMm: 400, heightMm: 445.5},
      overlapMm: 50, minimumOverlapMm: 40,
    });
    expect(result.styleReferences).toEqual({body: "FEFCO 0300 body", lid: "FEFCO 0300 lid"});
    expect(result.designBasis).toEqual({body: "FEFCO_03", lid: "FEFCO_03"});
    expect(result.sourceMetadata.body.axialMeasurement).toEqual({interfaceEndState: "FACTORY_OPEN", basis: "INSIDE", depthMm: 300, closedEndWallCount: 1});
    expect(result.playbook.map((step) => step.code)).toEqual([
      "VERIFY_PARTS",
      "MAP_AXES",
      "CHECK_CROSS_CLEARANCE",
      "MARK_OVERLAP",
      "ASSEMBLE",
      "REMEASURE_AND_TEST",
    ]);
    expect(result.playbook.at(-1)?.code).toBe("REMEASURE_AND_TEST");
    expect(result.warnings.join(" ")).toContain("does not certify retained strength, carrier acceptance, or manufacturing compliance");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.body)).toBe(true);
  });

  it("accepts an exact 445.5 mm target-axis extension", () => {
    const base = telescopeBase();
    const result = calculateFefco03Telescope({...base, targetInternal: {...base.targetInternal, heightMm: 445.5}});
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.finalInternal.heightMm).toBe(445.5);
  });

  it("keeps a 0314-style open sleeve's zero-wall outside axial depth unchanged", () => {
    const base = telescopeBase();
    const result = calculateFefco03Telescope({
      ...base,
      body: {
        ...base.body,
        styleReference: "FEFCO 0314 open sleeve",
        measurement: {...base.body.measurement, basis: "OUTSIDE", rawDimensions: {lengthMm: 509, widthMm: 409, heightMm: 300}},
        axialMeasurement: {interfaceEndState: "FACTORY_OPEN", basis: "OUTSIDE", depthMm: 300, closedEndWallCount: 0},
      },
      targetInternal: {...base.targetInternal, heightMm: 445.5},
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).toMatchObject({internalDimensions: {heightMm: 300}, outerDimensions: {heightMm: 300}});
    expect(result.finalInternal.heightMm).toBe(445.5);
    expect(result.sourceMetadata.body.axialMeasurement).toEqual({interfaceEndState: "FACTORY_OPEN", basis: "OUTSIDE", depthMm: 300, closedEndWallCount: 0});
  });

  it("contains an exact 16-inch protected-fit cube but rejects a 0.02 mm overage", () => {
    const base = protectedFitBase();
    const exact = calculateFefco03Telescope(base);
    expect("error" in exact).toBe(false);
    if (!("error" in exact)) {
      expect(exact.finalInternal).toEqual({lengthMm: 406.4, widthMm: 406.4, heightMm: 406.4});
      expect(exact.finalInternal.lengthMm - exact.targetInternal.lengthMm).toBe(0);
    }
    expectError(calculateFefco03Telescope({
      ...base,
      targetInternal: {...base.targetInternal, lengthMm: 406.42},
    }), "TARGET_DOES_NOT_FIT");
  });

  it("supports a deterministic cross-axis mapping and length extension", () => {
    const result = calculateFefco03Telescope({...telescopeBase(),
      bodyAxisPermutation: ["heightMm", "lengthMm", "widthMm"], lidAxisPermutation: ["heightMm", "lengthMm", "widthMm"], targetAxis: "lengthMm",
      targetInternal: {lengthMm: 420, widthMm: 500, heightMm: 400},
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result).toMatchObject({targetAxis: "lengthMm", crossAxes: ["widthMm", "heightMm"], clearancePerSideMm: [1, 1], finalInternal: {lengthMm: 445.5, widthMm: 500, heightMm: 400}});
  });

  it("rejects invalid mapping, role/reference, clearance/overlap, and target boundaries", () => {
    const base = telescopeBase();
    expectError(calculateFefco03Telescope({...base, bodyAxisPermutation: ["lengthMm", "lengthMm", "heightMm"] as unknown as typeof identity}), "INVALID_AXIS_PERMUTATION");
    expectError(calculateFefco03Telescope({...base, targetAxis: "diagonal" as "heightMm"}), "INVALID_TARGET_AXIS");
    expectError(calculateFefco03Telescope({...base, body: {...base.body, role: "LID"}}), "PART_ROLE_MISMATCH");
    expectError(calculateFefco03Telescope({...base, lid: {...base.lid, styleReference: "generic lid"}}), "STYLE_REFERENCE_INVALID");
    expectError(calculateFefco03Telescope({...base, lid: {...base.lid, measurement: {...base.lid.measurement, rawDimensions: {lengthMm: 519.97, widthMm: 420, heightMm: 200}}}}), "CLEARANCE_TOO_SMALL");
    expectError(calculateFefco03Telescope({...base, overlapMm: 39.98}), "INSUFFICIENT_OVERLAP");
    expectError(calculateFefco03Telescope({...base, overlapMm: 196}), "INVALID_OVERLAP");
    expectError(calculateFefco03Telescope({...base, targetInternal: {...base.targetInternal, heightMm: 445.52}}), "TARGET_DOES_NOT_FIT");
  });

  it("returns a diagnostic instead of throwing when either part axis permutation is missing", () => {
    const base = telescopeBase();
    const missingBody = {...base, bodyAxisPermutation: undefined as unknown as typeof base.bodyAxisPermutation};
    const missingLid = {...base, lidAxisPermutation: undefined as unknown as typeof base.lidAxisPermutation};
    expect(() => calculateFefco03Telescope(missingBody)).not.toThrow();
    expectError(calculateFefco03Telescope(missingBody), "INVALID_AXIS_PERMUTATION");
    expect(() => calculateFefco03Telescope(missingLid)).not.toThrow();
    expectError(calculateFefco03Telescope(missingLid), "INVALID_AXIS_PERMUTATION");
  });

  it("requires resolved, measured, verified sources while allowing a tape manufacturer seam", () => {
    const base = telescopeBase();
    expect("error" in calculateFefco03Telescope({...base, body: {...base.body, joint: "TAPE"}})).toBe(false);
    expectError(resolveConservativePart({basis: "NOT_SURE", rawDimensions: {lengthMm: 1, widthMm: 1, heightMm: 1}, boardThicknessMm: 4}), "MEASUREMENT_REQUIRED");
    expectError(resolveConservativePart({basis: "INSIDE", rawDimensions: {lengthMm: 1, widthMm: 1, heightMm: 1}}), "BOARD_THICKNESS_REQUIRED");
    expectError(resolveConservativePart({basis: "INSIDE", rawDimensions: {lengthMm: 1, widthMm: 1, heightMm: 1}, boardThicknessMm: 4, uncertaintyMm: -1}), "INVALID_MEASUREMENTS");
    expectError(calculateFefco03Telescope({...base, body: {...base.body, condition: "DAMAGED"}}), "DAMAGED_SOURCE");
    expectError(calculateFefco03Telescope({...base, body: {...base.body, joint: "UNKNOWN"}}), "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError(calculateFefco03Telescope({...base, body: {...base.body, sourceState: "MODIFIED_UNVERIFIED"}}), "SOURCE_NOT_INTACT");
    expectError(calculateFefco03Telescope({...base, body: {...base.body, axialMeasurement: undefined as unknown as typeof base.body.axialMeasurement}}), "AXIAL_MEASUREMENT_REQUIRED");
    expectError(calculateFefco03Telescope({
      ...base,
      body: {...base.body, axialMeasurement: {...base.body.axialMeasurement, interfaceEndState: "CLOSED"}},
    }), "AXIAL_OPENING_REQUIRED");
    expectError(calculateFefco03Telescope({
      ...base,
      body: {...base.body, axialMeasurement: {...base.body.axialMeasurement, interfaceEndState: "UNVERIFIED"}},
    }), "AXIAL_OPENING_REQUIRED");
    expectError(calculateFefco03Telescope({
      ...base,
      body: {...base.body, axialMeasurement: {...base.body.axialMeasurement, closedEndWallCount: 2 as 0}},
    }), "AXIAL_TOPOLOGY_UNSUPPORTED");
    expectError(calculateFefco03Telescope({
      ...base,
      body: {...base.body, axialMeasurement: {...base.body.axialMeasurement, interfaceEndState: "OPENED_REMEASURED"}},
    }), "AXIAL_OPENING_REQUIRED");
  });
});

describe("distinct RSC splice prototypes", () => {
  it("calculates internal nesting exactly and rejects arrangement, interface, target, and source errors", () => {
    const base = internalBase();
    const result = calculateRscSplice(base);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result).toMatchObject({mode: "INTERNAL_NESTING", clearancePerSideMm: [5, 5], overlapMm: 30, finalInternal: {lengthMm: 300, widthMm: 200, heightMm: 190}});
      expect(result.playbook.map((step) => step.code)).toEqual([
        "VERIFY_PARTS",
        "MAP_AXES",
        "CHECK_INTERFACE",
        "MARK_COVERAGE",
        "ASSEMBLE",
        "REMEASURE_AND_TEST",
      ]);
      expect(result.playbook.at(-1)?.code).toBe("REMEASURE_AND_TEST");
    }
    expectError(calculateRscSplice({...base, arrangement: "SIDE_BY_SIDE"}), "SIDE_BY_SIDE_JOIN_UNSUPPORTED");
    expectError(calculateRscSplice({...base, arrangement: "TAPE_ONLY"}), "TAPE_ONLY_JOIN_UNSUPPORTED");
    expectError(calculateRscSplice({...base, partB: {...base.partB, measurement: {...base.partB.measurement, rawDimensions: {lengthMm: 309, widthMm: 220, heightMm: 100}}}}), "CROSS_AXIS_INTERFERENCE");
    expectError(calculateRscSplice({...base, overlapMm: 100}), "INVALID_OVERLAP");
    expectError(calculateRscSplice({...base, targetInternal: {...base.targetInternal, heightMm: 190.02}}), "TARGET_DOES_NOT_FIT");
    expectError(calculateRscSplice({...base, partA: {...base.partA, sourceState: "MODIFIED_UNVERIFIED"}}), "SOURCE_NOT_INTACT");
    expectError(calculateRscSplice({
      ...base,
      partA: {...base.partA, axialMeasurement: {...base.partA.axialMeasurement, interfaceEndState: "CLOSED"}},
    }), "AXIAL_OPENING_REQUIRED");
    expectError(calculateRscSplice({
      ...base,
      partA: {...base.partA, axialMeasurement: {...base.partA.axialMeasurement, interfaceEndState: "UNVERIFIED"}},
    }), "AXIAL_OPENING_REQUIRED");
    expectError(calculateRscSplice({
      ...base,
      partA: {...base.partA, axialMeasurement: {...base.partA.axialMeasurement, interfaceEndState: "OPENED_REMEASURED"}},
    }), "AXIAL_OPENING_REQUIRED");
  });

  it("returns diagnostics instead of throwing when part or sleeve axis permutations are missing", () => {
    const internal = internalBase();
    const missingPartA = {...internal, partAAxisPermutation: undefined as unknown as typeof internal.partAAxisPermutation};
    const missingPartB = {...internal, partBAxisPermutation: undefined as unknown as typeof internal.partBAxisPermutation};
    expect(() => calculateRscSplice(missingPartA)).not.toThrow();
    expectError(calculateRscSplice(missingPartA), "INVALID_AXIS_PERMUTATION");
    expect(() => calculateRscSplice(missingPartB)).not.toThrow();
    expectError(calculateRscSplice(missingPartB), "INVALID_AXIS_PERMUTATION");

    const external = sleeveBase();
    const missingSleeve = {
      ...external,
      sleeve: {...external.sleeve, axisPermutation: undefined as unknown as typeof external.sleeve.axisPermutation},
    };
    expect(() => calculateRscSplice(missingSleeve)).not.toThrow();
    expectError(calculateRscSplice(missingSleeve), "INVALID_AXIS_PERMUTATION");
  });

  it("calculates external sleeve coverage from direct axial length without cut geometry", () => {
    const base = sleeveBase();
    const result = calculateRscSplice(base);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({mode: "EXTERNAL_SLEEVE", targetAxis: "heightMm", coverageAMm: 60, coverageBMm: 60, finalInternal: {lengthMm: 300, widthMm: 200, heightMm: 240}, clearancePerSideMm: [1, 1]});
    expect(result.sleeve).toMatchObject({axialLengthMm: 120, usableAxialLengthMm: 120, axialLengthUncertaintyMm: 0});
    expect(result.partA.outerDimensions.heightMm).toBe(120);
    expect(result.sourceMetadata.partA.axialMeasurement.closedEndWallCount).toBe(0);
    expect(result).not.toHaveProperty("operations");
    expect(result).not.toHaveProperty("cuts");
    expect(result.playbook.at(-1)?.code).toBe("REMEASURE_AND_TEST");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("enforces sleeve form, coverage, direct usable length, seam, cross-basis, and arrangement bounds", () => {
    const base = sleeveBase();
    expectError(calculateRscSplice({...base, arrangement: "SIDE_BY_SIDE"}), "SIDE_BY_SIDE_JOIN_UNSUPPORTED");
    expectError(calculateRscSplice({...base, arrangement: "TAPE_ONLY"}), "TAPE_ONLY_JOIN_UNSUPPORTED");
    expectError(calculateRscSplice({...base, sleeve: {...base.sleeve, form: "CLOSED" as "OPEN"}}), "SLEEVE_FORM_UNSUPPORTED");
    expectError(calculateRscSplice({...base, coverageAMm: 59.98}), "INSUFFICIENT_COVERAGE");
    expectError(calculateRscSplice({...base, coverageAMm: 121}), "INSUFFICIENT_COVERAGE");
    expectError(calculateRscSplice({...base, sleeve: {...base.sleeve, axialLengthMm: 119}}), "INSUFFICIENT_SLEEVE_LENGTH");
    const uncertain = calculateRscSplice({...base, sleeve: {...base.sleeve, axialLengthMm: 121, axialLengthUncertaintyMm: 1}});
    expect("error" in uncertain).toBe(false);
    if (!("error" in uncertain)) expect(uncertain.sleeve).toMatchObject({axialLengthMm: 121, axialLengthUncertaintyMm: 1, usableAxialLengthMm: 120});
    expectError(calculateRscSplice({...base, seamIntrusionMm: 120}), "INVALID_SEAM_INTRUSION");
    expectError(calculateRscSplice({...base, sleeve: {...base.sleeve, crossMeasurement: {basis: "OUTSIDE", rawDimensions: {lengthMm: 317, widthMm: 217, heightMm: 9}, boardThicknessMm: 4}}}), "CLEARANCE_TOO_SMALL");
  });
});
