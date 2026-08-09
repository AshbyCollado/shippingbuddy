"use client";

import {useEffect, useMemo} from "react";
import type {ThreeElements} from "@react-three/fiber";
import * as THREE from "three";

export type CorrugatedQuality = "low" | "medium" | "high";
export type CorrugatedHingeEdge = "top" | "right" | "bottom" | "left";
export type CorrugatedFluteAxis = "x" | "y";

export interface CorrugatedPanelOptions {
  /** Panel dimensions in the scene's world units. */
  width: number;
  height: number;
  /** Cardboard thickness in the same units as width and height. */
  thickness?: number;
  /** Flute cycles per world unit along `fluteAxis`. */
  fluteFrequency?: number;
  fluteAxis?: CorrugatedFluteAxis;
  quality?: CorrugatedQuality;
  /** Edge where the panel is hinged. Corrugation fades into that crease. */
  hingeEdge?: CorrugatedHingeEdge;
  hingeWidth?: number;
  /** 0 leaves the corrugation unchanged; 1 removes it at the hinge edge. */
  hingeAttenuation?: number;
  phase?: number;
}

type MeshTransformProps = Pick<ThreeElements["mesh"], "position" | "rotation" | "scale">;

export interface CorrugatedPanelProps extends CorrugatedPanelOptions, MeshTransformProps {
  material?: THREE.Material | THREE.Material[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

type NormalizedOptions = Required<Omit<CorrugatedPanelOptions, "hingeEdge">> & {
  hingeEdge?: CorrugatedHingeEdge;
};

type QualityPreset = {
  axisSegmentsPerCycle: number;
  crossSegments: number;
  layers: 2 | 3;
  waveScale: number;
};

const DEFAULT_OPTIONS: Required<Omit<CorrugatedPanelOptions, "hingeEdge" | "hingeWidth">> & {hingeWidth?: number; hingeEdge?: CorrugatedHingeEdge} = {
  width: 1,
  height: 1,
  thickness: 0.06,
  fluteFrequency: 5,
  fluteAxis: "x",
  quality: "medium",
  hingeEdge: undefined,
  hingeWidth: undefined,
  hingeAttenuation: 0.9,
  phase: 0,
};

const QUALITY_PRESETS: Record<CorrugatedQuality, QualityPreset> = {
  low: {axisSegmentsPerCycle: 1, crossSegments: 1, layers: 2, waveScale: 0},
  medium: {axisSegmentsPerCycle: 2, crossSegments: 4, layers: 2, waveScale: 0.7},
  high: {axisSegmentsPerCycle: 4, crossSegments: 8, layers: 3, waveScale: 1},
};

type CacheEntry = {geometry: THREE.BufferGeometry; references: number};
const geometryCache = new Map<string, CacheEntry>();

function finitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Corrugated cardboard ${name} must be greater than zero.`);
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOptions(options: CorrugatedPanelOptions): NormalizedOptions {
  const width = finitePositive("width", options.width);
  const height = finitePositive("height", options.height);
  const thickness = finitePositive("thickness", options.thickness ?? DEFAULT_OPTIONS.thickness);
  const fluteFrequency = finitePositive("flute frequency", options.fluteFrequency ?? DEFAULT_OPTIONS.fluteFrequency);
  const quality = options.quality ?? DEFAULT_OPTIONS.quality;
  const fluteAxis = options.fluteAxis ?? DEFAULT_OPTIONS.fluteAxis;
  const hingeAttenuation = clamp(options.hingeAttenuation ?? DEFAULT_OPTIONS.hingeAttenuation, 0, 1);
  const defaultHingeWidth = Math.max(Math.min(width, height) * 0.12, thickness * 2);
  const hingeWidth = options.hingeWidth === undefined ? defaultHingeWidth : finitePositive("hinge width", options.hingeWidth);
  const phase = Number.isFinite(options.phase ?? DEFAULT_OPTIONS.phase) ? options.phase ?? DEFAULT_OPTIONS.phase : 0;
  return {width, height, thickness, fluteFrequency, fluteAxis, quality, hingeEdge: options.hingeEdge, hingeWidth, hingeAttenuation, phase};
}

function keyFor(options: NormalizedOptions) {
  return [
    options.width,
    options.height,
    options.thickness,
    options.fluteFrequency,
    options.fluteAxis,
    options.quality,
    options.hingeEdge ?? "none",
    options.hingeWidth,
    options.hingeAttenuation,
    options.phase,
  ].map((value) => typeof value === "number" ? value.toFixed(6) : value).join("|");
}

function smoothStep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hingeFade(x: number, y: number, options: NormalizedOptions) {
  if (!options.hingeEdge || options.hingeAttenuation <= 0) return 1;
  const distance = options.hingeEdge === "top" ? options.height / 2 - y
    : options.hingeEdge === "right" ? options.width / 2 - x
      : options.hingeEdge === "bottom" ? y + options.height / 2
        : x + options.width / 2;
  const awayFromHinge = smoothStep(distance / options.hingeWidth);
  return 1 - options.hingeAttenuation * (1 - awayFromHinge);
}

function buildCorrugatedGeometry(options: NormalizedOptions) {
  if (options.quality === "low") {
    const geometry = new THREE.BoxGeometry(options.width, options.height, options.thickness);
    geometry.userData.corrugated = {...options, lowDetail: true};
    return geometry;
  }

  const preset = QUALITY_PRESETS[options.quality];
  const fluteSpan = options.fluteAxis === "x" ? options.width : options.height;
  const cycles = clamp(Math.round(options.fluteFrequency * fluteSpan), 1, 192);
  const axisSegments = Math.max(1, cycles * preset.axisSegmentsPerCycle);
  const xSegments = options.fluteAxis === "x" ? axisSegments : preset.crossSegments;
  const ySegments = options.fluteAxis === "y" ? axisSegments : preset.crossSegments;
  const amplitude = options.thickness * 0.16 * preset.waveScale;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const layerGrids: number[][] = [];

  const layers = preset.layers === 3
    ? [
      {offset: options.thickness * 0.5, waveScale: 0.72, front: true},
      {offset: 0, waveScale: 1, front: true},
      {offset: -options.thickness * 0.5, waveScale: 0.72, front: false},
    ]
    : [
      {offset: options.thickness * 0.5, waveScale: 0.72, front: true},
      {offset: -options.thickness * 0.5, waveScale: 0.72, front: false},
    ];

  const addLayer = (layer: typeof layers[number]) => {
    const grid: number[] = [];
    for (let iy = 0; iy <= ySegments; iy += 1) {
      const y = (iy / ySegments - 0.5) * options.height;
      for (let ix = 0; ix <= xSegments; ix += 1) {
        const x = (ix / xSegments - 0.5) * options.width;
        const waveCoordinate = options.fluteAxis === "x" ? (x / options.width + 0.5) : (y / options.height + 0.5);
        const wave = Math.sin(waveCoordinate * cycles * Math.PI * 2 + options.phase);
        const z = layer.offset + amplitude * layer.waveScale * wave * hingeFade(x, y, options);
        grid.push(positions.length / 3);
        positions.push(x, y, z);
        uvs.push(ix / xSegments, iy / ySegments);
      }
    }
    for (let iy = 0; iy < ySegments; iy += 1) {
      for (let ix = 0; ix < xSegments; ix += 1) {
        const a = grid[iy * (xSegments + 1) + ix];
        const b = grid[iy * (xSegments + 1) + ix + 1];
        const c = grid[(iy + 1) * (xSegments + 1) + ix];
        const d = grid[(iy + 1) * (xSegments + 1) + ix + 1];
        if (layer.front) indices.push(a, b, d, a, d, c);
        else indices.push(a, d, b, a, c, d);
      }
    }
    layerGrids.push(grid);
  };

  layers.forEach(addLayer);

  const front = layerGrids[0];
  const back = layerGrids[layerGrids.length - 1];
  const row = (grid: number[], iy: number, ix: number) => grid[iy * (xSegments + 1) + ix];
  const connect = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  for (let ix = 0; ix < xSegments; ix += 1) {
    connect(row(front, 0, ix), row(front, 0, ix + 1), row(back, 0, ix + 1), row(back, 0, ix));
    connect(row(front, ySegments, ix + 1), row(front, ySegments, ix), row(back, ySegments, ix), row(back, ySegments, ix + 1));
  }
  for (let iy = 0; iy < ySegments; iy += 1) {
    connect(row(front, iy + 1, 0), row(front, iy, 0), row(back, iy, 0), row(back, iy + 1, 0));
    connect(row(front, iy, xSegments), row(front, iy + 1, xSegments), row(back, iy + 1, xSegments), row(back, iy, xSegments));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.corrugated = {...options, fluteCycles: cycles, xSegments, ySegments, lowDetail: false};
  return geometry;
}

/** Build an uncached geometry for callers that own its disposal. */
export function createCorrugatedPanelGeometry(options: CorrugatedPanelOptions) {
  return buildCorrugatedGeometry(normalizeOptions(options));
}

/** Acquire a shared geometry. Call `release` when the mesh is unmounted. */
export function acquireCorrugatedPanelGeometry(options: CorrugatedPanelOptions) {
  const normalized = normalizeOptions(options);
  const key = keyFor(normalized);
  let entry = geometryCache.get(key);
  if (!entry) {
    entry = {geometry: buildCorrugatedGeometry(normalized), references: 0};
    geometryCache.set(key, entry);
  }
  entry.references += 1;
  let released = false;
  return {
    geometry: entry.geometry,
    release: () => {
      if (released) return;
      released = true;
      const current = geometryCache.get(key);
      if (!current) return;
      current.references -= 1;
      if (current.references <= 0) {
        current.geometry.dispose();
        geometryCache.delete(key);
      }
    },
  };
}

/** Explicitly clear all cached geometries during a scene teardown. */
export function disposeCorrugatedGeometryCache() {
  geometryCache.forEach(({geometry}) => geometry.dispose());
  geometryCache.clear();
}

export function corrugatedGeometryCacheSize() {
  return geometryCache.size;
}

/**
 * R3F-ready panel. The generated geometry is shared and reference-counted;
 * caller-provided materials are never disposed by this component.
 */
export function CorrugatedPanel({
  material,
  castShadow = true,
  receiveShadow = true,
  position,
  rotation,
  scale,
  ...options
}: CorrugatedPanelProps) {
  const geometryOptions = useMemo(() => ({
    width: options.width,
    height: options.height,
    thickness: options.thickness,
    fluteFrequency: options.fluteFrequency,
    fluteAxis: options.fluteAxis,
    quality: options.quality,
    hingeEdge: options.hingeEdge,
    hingeWidth: options.hingeWidth,
    hingeAttenuation: options.hingeAttenuation,
    phase: options.phase,
  }), [
    options.width,
    options.height,
    options.thickness,
    options.fluteFrequency,
    options.fluteAxis,
    options.quality,
    options.hingeEdge,
    options.hingeWidth,
    options.hingeAttenuation,
    options.phase,
  ]);
  const acquired = useMemo(() => acquireCorrugatedPanelGeometry(geometryOptions), [geometryOptions]);
  const fallbackMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#b87945",
    roughness: 0.84,
    metalness: 0,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => () => acquired.release(), [acquired]);
  useEffect(() => () => fallbackMaterial.dispose(), [fallbackMaterial]);

  return <mesh geometry={acquired.geometry} material={material ?? fallbackMaterial} position={position} rotation={rotation} scale={scale} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
