import {describe, expect, it} from "vitest";
import {getAnimationFrame, getWrapAnimationFrame, nextAnimationCheckpoint, EXISTING_BOX_ANIMATION_STAGES, RSC_ANIMATION_STAGES, WRAP_ANIMATION_STAGES} from "./animation";

describe("wrap animation stages", () => {
  it("covers the entire playhead without gaps", () => {
    expect(WRAP_ANIMATION_STAGES[0].start).toBe(0);
    expect(WRAP_ANIMATION_STAGES[WRAP_ANIMATION_STAGES.length - 1].end).toBe(1);
    for (let index = 1; index < WRAP_ANIMATION_STAGES.length; index += 1) {
      expect(WRAP_ANIMATION_STAGES[index].start).toBe(WRAP_ANIMATION_STAGES[index - 1].end);
    }
  });

  it("keeps all stage channels monotonic", () => {
    const samples = Array.from({length: 101}, (_, index) => getWrapAnimationFrame(index / 100));
    for (const stage of WRAP_ANIMATION_STAGES) {
      let previous = 0;
      for (const sample of samples) {
        const value = sample[stage.id];
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
      expect(previous).toBe(1);
    }
  });

  it("maps the major user-visible steps to truthful labels", () => {
    expect(getWrapAnimationFrame(0).label).toBe("Reveal the sheet and item");
    expect(getWrapAnimationFrame(0.25).stage).toBe("cuts");
    expect(getWrapAnimationFrame(0.50).stage).toBe("tabs");
    expect(getWrapAnimationFrame(0.68).stage).toBe("walls");
    expect(getWrapAnimationFrame(0.82).stage).toBe("top");
    expect(getWrapAnimationFrame(1).label).toBe("Finished calculated package");
  });

  it("uses the next stage at exact boundaries", () => {
    expect(getWrapAnimationFrame(0.08).stage).toBe("envelope");
    expect(getWrapAnimationFrame(0.30).stage).toBe("cutting");
  });

  it("moves Previous and Next through semantic checkpoints", () => {
    expect(nextAnimationCheckpoint(0, "wrap", 1)).toBe(0.08);
    expect(nextAnimationCheckpoint(0.25, "wrap", 1)).toBe(0.30);
    expect(nextAnimationCheckpoint(0.90, "wrap", 1)).toBe(1);
    expect(nextAnimationCheckpoint(0.25, "wrap", -1)).toBe(0.22);
    expect(nextAnimationCheckpoint(1, "wrap", 1)).toBe(1);
  });

  it("keeps RSC playback free of cutting stages", () => {
    expect(RSC_ANIMATION_STAGES.map((stage) => stage.id as string)).not.toContain("cutting");
    expect(getAnimationFrame(0.4, "rsc").label).toBe("Close the bottom flaps");
    expect(getAnimationFrame(0.4, "rsc").cuts).toBe(0);
  });

  it("uses a short packing walkthrough for an existing box", () => {
    expect(EXISTING_BOX_ANIMATION_STAGES.map((stage) => stage.id)).not.toContain("square-tube");
    expect(getAnimationFrame(0, "existing").label).toBe("Show your existing box");
    expect(getAnimationFrame(0.6, "existing").stage).toBe("top");
    expect(getAnimationFrame(0.95, "existing").label).toBe("Finished existing box");
    expect(getAnimationFrame(0.6, "existing").cuts).toBe(0);
  });
});
