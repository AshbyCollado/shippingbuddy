import * as THREE from "three";
import {describe, expect, it} from "vitest";
import {constructionCameraFitProgress} from "./ConstructionCameraRig";
import {matrixFromFoldTransform} from "./CutAndFoldScene";
import type {FoldNetTransform} from "@/domain/foldnet";

describe("cut-and-fold transform and camera authorities", () => {
  it("maps p0 and p1 hinge fixture transforms into exact Three Matrix4 positions", () => {
    const p0: FoldNetTransform = {
      origin: {xMm: 10, yMm: 20, zMm: 30},
      xAxis: {xMm: 1, yMm: 0, zMm: 0}, yAxis: {xMm: 0, yMm: 1, zMm: 0}, zAxis: {xMm: 0, yMm: 0, zMm: 1},
    };
    const p1: FoldNetTransform = {
      origin: p0.origin,
      xAxis: {xMm: 0, yMm: 1, zMm: 0}, yAxis: {xMm: -1, yMm: 0, zMm: 0}, zAxis: {xMm: 0, yMm: 0, zMm: 1},
    };
    const local = new THREE.Vector3(2, 3, 4);

    expect(local.clone().applyMatrix4(matrixFromFoldTransform(p0))).toEqual(new THREE.Vector3(12, 23, 34));
    expect(local.clone().applyMatrix4(matrixFromFoldTransform(p1))).toEqual(new THREE.Vector3(7, 22, 34));
  });

  it("maps construction progress exactly through the top-down transition window", () => {
    expect(constructionCameraFitProgress(Number.NaN)).toBe(0);
    expect(constructionCameraFitProgress(0.44)).toBe(0);
    expect(constructionCameraFitProgress(0.53)).toBeCloseTo(0.41, 10);
    expect(constructionCameraFitProgress(0.62)).toBe(1);
  });
});
