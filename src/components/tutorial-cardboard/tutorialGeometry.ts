import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type TutorialFoldEdges = readonly [top: boolean, right: boolean, bottom: boolean, left: boolean];

export interface TutorialCardboardGeometryOptions {
  span: number;
  depth: number;
  thickness: number;
  fluteFrequency: number;
  folds: TutorialFoldEdges;
  hasFluteCore: boolean;
  translationY?: number;
}

type CacheEntry = {geometry: THREE.BufferGeometry; references: number};

const geometryCache = new Map<string, CacheEntry>();

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Tutorial cardboard ${label} must be a finite positive number.`);
  return value;
}

function cacheKey(options: TutorialCardboardGeometryOptions) {
  return [
    options.span,
    options.depth,
    options.thickness,
    options.fluteFrequency,
    options.folds.map(Number).join(""),
    options.hasFluteCore ? 1 : 0,
    options.translationY ?? 0,
  ].map((part) => typeof part === "number" ? part.toFixed(6) : part).join("|");
}

type FlapFreeEdge = {sign: 1 | -1; yEdge: number};

function getStrictFlapFreeEdge(depth: number, folds: TutorialFoldEdges): FlapFreeEdge {
  const isTopFlap = !folds[0] && !folds[1] && folds[2] && !folds[3];
  const isBottomFlap = folds[0] && !folds[1] && !folds[2] && !folds[3];
  if (!isTopFlap && !isBottomFlap) throw new Error("Tutorial flute cut face requires one unambiguous top or bottom flap free edge.");
  return isTopFlap ? {sign: 1, yEdge: 0.5 * depth} : {sign: -1, yEdge: -0.5 * depth};
}

/**
 * Physical alternating flute cut cells at the flap's free edge. They are part
 * of the same indexed BufferGeometry as the skins/core, never presentation lines.
 */
function createAlternatingFluteCutCells(span: number, thickness: number, fluteFrequency: number, freeEdge: FlapFreeEdge) {
  const segments = Math.max(1, Math.floor(5 * span));
  const {yEdge} = freeEdge;
  const vertexCount = 4 * segments;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(6 * segments);
  const profileAt = (x: number) => {
    const sine = Math.sin(fluteFrequency * x);
    return {
      sine,
      core: 0.5 * thickness * sine,
      low: -0.5 * thickness + 0.01 * sine,
      high: 0.5 * thickness + 0.01 * sine,
    };
  };

  for (let segment = 0; segment < segments; segment += 1) {
    const x0 = -0.5 * span + segment * span / segments;
    const x1 = -0.5 * span + (segment + 1) * span / segments;
    const start = profileAt(x0);
    const end = profileAt(x1);
    const upperCell = Math.sin(fluteFrequency * (x0 + x1) / 2) >= 0;
    const z0 = upperCell ? [start.core, start.high] : [start.low, start.core];
    const z1 = upperCell ? [end.core, end.high] : [end.low, end.core];
    const vertex = segment * 4;
    const u0 = (x0 + 0.5 * span) / span;
    const u1 = (x1 + 0.5 * span) / span;
    positions.set([x0, yEdge, z0[0], x0, yEdge, z0[1], x1, yEdge, z1[0], x1, yEdge, z1[1]], vertex * 3);
    uvs.set([u0, 0, u0, 1, u1, 0, u1, 1], vertex * 2);
    if (freeEdge.sign === 1) {
      indices.set([vertex, vertex + 3, vertex + 2, vertex, vertex + 1, vertex + 3], segment * 6);
    } else {
      indices.set([vertex, vertex + 2, vertex + 3, vertex, vertex + 3, vertex + 1], segment * 6);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 3).fill(0.55), 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  return geometry;
}

/** Source-equivalent layered cardboard geometry from the pinned tutorial. */
export function createTutorialCardboardGeometry(options: TutorialCardboardGeometryOptions) {
  const span = finitePositive(options.span, "span");
  const depth = finitePositive(options.depth, "depth");
  const thickness = finitePositive(options.thickness, "thickness");
  const fluteFrequency = finitePositive(options.fluteFrequency, "flute frequency");
  const baseGeometry = new THREE.PlaneGeometry(
    span,
    depth,
    Math.max(1, Math.floor(5 * span)),
    Math.max(1, Math.floor(0.2 * depth)),
  );
  const layers: THREE.BufferGeometry[] = [];
  const size: readonly [number, number] = [span, depth];
  const flapFreeEdge = options.hasFluteCore ? getStrictFlapFreeEdge(depth, options.folds) : undefined;
  const segments = Math.max(1, Math.floor(5 * span));
  // r185 cut-edge compatibility: recess only the liner boundary inside the
  // nominal flap, exposing the already-generated core without an outward reveal.
  const revealDepth = flapFreeEdge ? Math.min(depth / 4, Math.max(thickness, span / segments)) : 0;
  const applyFolds = (x: number, y: number, z: number) => {
    const modifier = (coordinate: number, side: number) => 1 - Math.pow(coordinate / (0.5 * side), 10);
    if ((x > 0 && options.folds[1]) || (x < 0 && options.folds[3])) z *= modifier(x, size[0]);
    if ((y > 0 && options.folds[0]) || (y < 0 && options.folds[2])) z *= modifier(y, size[1]);
    return z;
  };
  const layer = (offset: typeof Math.sin, recessFreeEdge = false) => {
    const geometry = baseGeometry.clone();
    const positions = geometry.getAttribute("position");
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3).fill(1), 3));
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = applyFolds(x, y, positions.getZ(index) + offset(x));
      const recessedY = recessFreeEdge && flapFreeEdge && Math.abs(y - flapFreeEdge.yEdge) < 0.000001
        ? y - flapFreeEdge.sign * revealDepth
        : y;
      positions.setXYZ(index, x, recessedY, z);
    }
    positions.needsUpdate = true;
    return geometry;
  };

  // These formulas intentionally mirror the tutorial: two skins everywhere,
  // with the sine-wave core only on folding flaps.
  layers.push(layer((x) => -0.5 * thickness + 0.01 * Math.sin(fluteFrequency * x), Boolean(flapFreeEdge)));
  layers.push(layer((x) => 0.5 * thickness + 0.01 * Math.sin(fluteFrequency * x), Boolean(flapFreeEdge)));
  if (options.hasFluteCore) {
    layers.push(layer((x) => 0.5 * thickness * Math.sin(fluteFrequency * x)));
    layers.push(createAlternatingFluteCutCells(span, thickness, fluteFrequency, flapFreeEdge!));
  }

  const merged = mergeGeometries(layers, false);
  baseGeometry.dispose();
  layers.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Tutorial cardboard layers could not be merged.");
  merged.computeVertexNormals();
  if (options.translationY) merged.translate(0, options.translationY, 0);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function acquireTutorialCardboardGeometry(options: TutorialCardboardGeometryOptions) {
  const key = cacheKey(options);
  let entry = geometryCache.get(key);
  if (!entry) {
    entry = {geometry: createTutorialCardboardGeometry(options), references: 0};
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

export function tutorialCardboardGeometryCacheSize() {
  return geometryCache.size;
}

export function tutorialCardboardGeometryResourceCount() {
  return [...geometryCache.values()].reduce((count, entry) => count + entry.references, 0);
}

export function disposeTutorialCardboardGeometryCache() {
  geometryCache.forEach(({geometry}) => geometry.dispose());
  geometryCache.clear();
}
