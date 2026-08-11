import {describe, expect, it} from "vitest";
import * as THREE from "three";
import {
  fitTutorialCamera,
  tutorialCameraModeForProgress,
  TUTORIAL_CAMERA_FOV_DEGREES,
  TUTORIAL_CAMERA_OCCUPANCY,
  TUTORIAL_THREE_QUARTER_DIRECTION,
  TUTORIAL_TOP_DOWN_DIRECTION,
  type TutorialCameraFit,
} from "./tutorialCamera";

function cornersOf(bounds: THREE.Box3) {
  const {min, max} = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function expectFiniteFit(fit: TutorialCameraFit) {
  expect([
    fit.transition,
    fit.target.x,
    fit.target.y,
    fit.target.z,
    fit.position.x,
    fit.position.y,
    fit.position.z,
    fit.distance,
    fit.occupancy,
    fit.azimuth,
    fit.polar,
  ].every(Number.isFinite)).toBe(true);
}

function projectedCorners(bounds: THREE.Box3, aspect: number, fit: TutorialCameraFit) {
  const camera = new THREE.PerspectiveCamera(TUTORIAL_CAMERA_FOV_DEGREES, aspect, 0.1, 10_000);
  camera.position.copy(fit.position);
  camera.lookAt(fit.target);
  camera.updateMatrixWorld(true);
  const projected = cornersOf(bounds).map((corner) => corner.clone().project(camera));
  expect(new Set(projected.map((corner) => corner.toArray().join("|"))).size).toBe(8);
  expect(projected.every((corner) => corner.toArray().every(Number.isFinite))).toBe(true);
  expect(projected.every((corner) => corner.z >= -1 && corner.z <= 1)).toBe(true);
  return projected;
}

function projectedCornerOccupancy(bounds: THREE.Box3, aspect: number, fit: TutorialCameraFit) {
  return Math.max(...projectedCorners(bounds, aspect, fit).flatMap((corner) => [Math.abs(corner.x), Math.abs(corner.y)]));
}

function projectedSpanCoverage(bounds: THREE.Box3, aspect: number, fit: TutorialCameraFit) {
  const projected = projectedCorners(bounds, aspect, fit);
  const x = projected.map((corner) => corner.x);
  const y = projected.map((corner) => corner.y);
  return Math.max(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)) / 2;
}

describe("tutorial camera authority", () => {
  it("uses a predominantly +Z flat direction and a smooth .30-.52 transition to the pinned three-quarter vector", () => {
    expect(TUTORIAL_TOP_DOWN_DIRECTION.x).toBe(0);
    expect(TUTORIAL_TOP_DOWN_DIRECTION.z).toBeGreaterThan(0.99);
    expect(TUTORIAL_TOP_DOWN_DIRECTION.z).toBeGreaterThan(8 * Math.abs(TUTORIAL_TOP_DOWN_DIRECTION.y));

    const sampleProgress = Array.from({length: 23}, (_, index) => 0.3 + index * 0.01);
    const samples = sampleProgress.map(tutorialCameraModeForProgress);
    expect(samples[0].mode).toBe("TOP_DOWN");
    expect(samples[0].transition).toBe(0);
    expect(tutorialCameraModeForProgress(0.41).mode).toBe("TRANSITION");
    expect(tutorialCameraModeForProgress(0.41).transition).toBeCloseTo(0.5, 12);
    expect(samples.at(-1)!.mode).toBe("THREE_QUARTER");
    expect(samples.at(-1)!.transition).toBe(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].transition).toBeGreaterThan(samples[index - 1].transition);
      expect(samples[index - 1].direction.angleTo(samples[index].direction)).toBeLessThan(0.06);
    }

    const expectedFinal = new THREE.Vector3(40, 90, 110).normalize();
    expect(TUTORIAL_THREE_QUARTER_DIRECTION.clone().cross(expectedFinal).length()).toBeLessThan(1e-12);
    expect(samples.at(-1)!.direction.dot(expectedFinal)).toBeCloseTo(1, 12);
    expect(tutorialCameraModeForProgress(1).direction.dot(expectedFinal)).toBeCloseTo(1, 12);
  });

  it("fits all eight Box3 corners deterministically across dimensions, aspects, and camera modes", () => {
    const fixtures = [
      new THREE.Box3(new THREE.Vector3(-40, -20, -10), new THREE.Vector3(40, 20, 10)),
      new THREE.Box3(new THREE.Vector3(-5, -80, -10), new THREE.Vector3(10, 20, 50)),
      new THREE.Box3(new THREE.Vector3(-100, -1, -50), new THREE.Vector3(50, 2, 10)),
      new THREE.Box3(new THREE.Vector3(130, -35, 900), new THREE.Vector3(470, 215, 980)),
    ];
    const aspects = [0.5, 1, 16 / 9, 3];
    const progresses = [0, 0.185, 0.3, 0.41, 0.52, 0.63, 1];

    for (const bounds of fixtures) {
      const originalMin = bounds.min.clone();
      const originalMax = bounds.max.clone();
      for (const aspect of aspects) {
        for (const progress of progresses) {
          const first = fitTutorialCamera(bounds, aspect, progress);
          const second = fitTutorialCamera(bounds.clone(), aspect, progress);
          expect(first.valid).toBe(true);
          expectFiniteFit(first);
          expect(second).toEqual(first);
          expect(bounds.min).toEqual(originalMin);
          expect(bounds.max).toEqual(originalMax);
          expect(first.position.distanceTo(first.target)).toBeCloseTo(first.distance, 12);
          expect(first.position.clone().sub(first.target).normalize().dot(tutorialCameraModeForProgress(progress).direction)).toBeCloseTo(1, 12);
          expect(first.occupancy).toBeCloseTo(TUTORIAL_CAMERA_OCCUPANCY, 12);
          const projectedOccupancy = projectedCornerOccupancy(bounds, aspect, first);
          expect(projectedOccupancy).toBeLessThanOrEqual(TUTORIAL_CAMERA_OCCUPANCY + 1e-10);
          expect(projectedOccupancy).toBeGreaterThan(0.55);
        }
      }
    }
  });

  it("centers the bounds and holds target and initial occupancy near 72 percent", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-80, -27, -45), new THREE.Vector3(80, 27, 45));
    for (const progress of [0, 0.185, 0.444, 0.63, 0.833, 1]) {
      const fit = fitTutorialCamera(bounds, 16 / 9, progress);
      expect(fit.target.toArray()).toEqual(bounds.getCenter(new THREE.Vector3()).toArray());
      expect(fit.occupancy).toBeCloseTo(TUTORIAL_CAMERA_OCCUPANCY, 12);
      expect(fit.occupancy).toBeGreaterThanOrEqual(0.65);
      expect(fit.occupancy).toBeLessThanOrEqual(0.8);
    }

    const shallowInitialBounds = [
      new THREE.Box3(new THREE.Vector3(-53.5, -35.25, -1.2), new THREE.Vector3(53.5, 35.25, 1.2)),
      new THREE.Box3(new THREE.Vector3(-80, -40, -0.3), new THREE.Vector3(80, 40, 0.3)),
      new THREE.Box3(new THREE.Vector3(-20, -80, -0.3), new THREE.Vector3(20, 80, 0.3)),
    ];
    for (const initialBounds of shallowInitialBounds) {
      for (const aspect of [9 / 16, 1, 16 / 9, 2]) {
        const coverage = projectedSpanCoverage(initialBounds, aspect, fitTutorialCamera(initialBounds, aspect, 0));
        expect(coverage).toBeGreaterThanOrEqual(0.65);
        expect(coverage).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it("returns one deterministic all-finite fallback for malformed bounds, every non-finite coordinate, and invalid fit parameters", () => {
    const validBounds = new THREE.Box3(new THREE.Vector3(-1, -2, -3), new THREE.Vector3(4, 5, 6));
    const fallback = fitTutorialCamera(new THREE.Box3(), 16 / 9, 0);
    expect(fallback).toEqual({
      valid: false,
      mode: "TOP_DOWN",
      transition: 0,
      target: new THREE.Vector3(),
      position: new THREE.Vector3(),
      distance: 0,
      occupancy: 0,
      azimuth: 0,
      polar: 0,
    });
    expectFiniteFit(fallback);

    const invalidCalls: Array<() => TutorialCameraFit> = [
      () => fitTutorialCamera(null as unknown as THREE.Box3, 1, 0),
      () => fitTutorialCamera({} as THREE.Box3, 1, 0),
      () => fitTutorialCamera(new THREE.Box3(), 1, 0),
      () => fitTutorialCamera(validBounds, 0, 0),
      () => fitTutorialCamera(validBounds, -1, 0),
      () => fitTutorialCamera(validBounds, Number.NaN, 0),
      () => fitTutorialCamera(validBounds, Number.POSITIVE_INFINITY, 0),
      () => fitTutorialCamera(validBounds, 1, 0, 0),
      () => fitTutorialCamera(validBounds, 1, 0, 180),
      () => fitTutorialCamera(validBounds, 1, 0, Number.NaN),
      () => fitTutorialCamera(validBounds, 1, 0, Number.POSITIVE_INFINITY),
      () => fitTutorialCamera(validBounds, 1, 0, 45, 0),
      () => fitTutorialCamera(validBounds, 1, 0, 45, 1),
      () => fitTutorialCamera(validBounds, 1, 0, 45, Number.NaN),
      () => fitTutorialCamera(validBounds, 1, 0, 45, Number.POSITIVE_INFINITY),
    ];
    for (const coordinate of ["x", "y", "z"] as const) {
      for (const endpoint of ["min", "max"] as const) {
        for (const value of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
          invalidCalls.push(() => {
            const bounds = validBounds.clone();
            bounds[endpoint][coordinate] = value;
            return fitTutorialCamera(bounds, 1, 0);
          });
        }
      }
    }

    for (const invoke of invalidCalls) {
      expect(invoke).not.toThrow();
      const fit = invoke();
      expect(fit.valid).toBe(false);
      expectFiniteFit(fit);
      expect(fit).toEqual(fallback);
    }
  });

  it("rejects zero-diagonal points, accepts flat positive-diagonal bounds, and sanitizes non-finite progress", () => {
    const validBounds = new THREE.Box3(new THREE.Vector3(-1, -2, -3), new THREE.Vector3(4, 5, 6));
    const point = new THREE.Vector3(7, -3, 11);
    const degenerate = fitTutorialCamera(new THREE.Box3(point.clone(), point.clone()), 1, 0);
    expect(degenerate.valid).toBe(false);
    expectFiniteFit(degenerate);
    expect(degenerate.target.toArray()).toEqual([0, 0, 0]);
    expect(degenerate.distance).toBe(0);
    expect(degenerate.occupancy).toBe(0);

    for (const bounds of [
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 5, 0)),
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 5, 0)),
    ]) {
      const fit = fitTutorialCamera(bounds, 1, 0);
      expect(fit.valid).toBe(true);
      expectFiniteFit(fit);
    }

    for (const progress of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      const fit = fitTutorialCamera(validBounds, 1, progress);
      expect(fit.valid).toBe(true);
      expect(fit.mode).toBe("TOP_DOWN");
      expect(fit.transition).toBe(0);
      expectFiniteFit(fit);
    }
  });
});
