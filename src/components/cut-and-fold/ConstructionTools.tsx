"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import * as THREE from "three";
import type {
  ConstructionChoreographyReady,
  ConstructionFrame,
  ConstructionLiftOperation,
  ConstructionPathFrame,
  ConstructionPathSegment,
  ConstructionPoint3,
} from "@/domain/constructionChoreography";

type PointTuple = readonly [number, number, number];
type LineSegment = readonly [PointTuple, PointTuple];

function pointTuple(
  point: ConstructionPoint3,
  zOffset = 0,
): PointTuple {
  return [point.xMm, point.yMm, point.zMm + zOffset];
}

function partialEndpoint(
  from: ConstructionPoint3,
  to: ConstructionPoint3,
  progress: number,
  zOffset: number,
): PointTuple {
  return [
    from.xMm + (to.xMm - from.xMm) * progress,
    from.yMm + (to.yMm - from.yMm) * progress,
    from.zMm + (to.zMm - from.zMm) * progress + zOffset,
  ];
}

function transformPoint(point: PointTuple, matrix: THREE.Matrix4): PointTuple {
  const elements = matrix.elements;
  const [x, y, z] = point;
  return [
    elements[0] * x + elements[4] * y + elements[8] * z + elements[12],
    elements[1] * x + elements[5] * y + elements[9] * z + elements[13],
    elements[2] * x + elements[6] * y + elements[10] * z + elements[14],
  ];
}

function tangentAngle(tangent: ConstructionPoint3 | null) {
  if (!tangent || Math.hypot(tangent.xMm, tangent.yMm) <= Number.EPSILON)
    return 0;
  return Math.atan2(tangent.yMm, tangent.xMm);
}

/** One committed, preallocated WebGL line resource for an entire semantic layer. */
function BatchedLineSegments({
  segments,
  capacity,
  color,
  opacity = 1,
  name,
}: {
  segments: readonly LineSegment[];
  capacity: number;
  color: THREE.ColorRepresentation;
  opacity?: number;
  name: string;
}) {
  const [resource, setResource] = useState<{
    geometry: THREE.BufferGeometry;
    material: THREE.LineBasicMaterial;
    positions: Float32Array;
  } | null>(null);

  useEffect(() => {
    const positions = new Float32Array(Math.max(1, capacity) * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const acquired = {geometry, material, positions};
    let active = true;
    queueMicrotask(() => {
      if (active) setResource(acquired);
    });
    return () => {
      active = false;
      geometry.dispose();
      material.dispose();
    };
  }, [capacity, color, opacity]);

  useLayoutEffect(() => {
    if (!resource) return;
    const count = Math.min(capacity, segments.length);
    for (let index = 0; index < count; index += 1) {
      const segment = segments[index];
      const offset = index * 6;
      resource.positions.set(segment[0], offset);
      resource.positions.set(segment[1], offset + 3);
    }
    const position = resource.geometry.getAttribute("position");
    position.needsUpdate = true;
    resource.geometry.setDrawRange(0, count * 2);
    resource.geometry.computeBoundingSphere();
  }, [capacity, resource, segments]);

  return resource ? (
    <lineSegments
      geometry={resource.geometry}
      material={resource.material}
      frustumCulled={false}
      userData={{constructionLineBatch: name}}
    />
  ) : null;
}

/** A single physical, texture-free tape ribbon with authoritative endpoints. */
function PhysicalTapeRibbon({
  segments,
  capacity,
  widthMm,
  zOffsetMm,
}: {
  segments: readonly LineSegment[];
  capacity: number;
  widthMm: number;
  zOffsetMm: number;
}) {
  const [resource, setResource] = useState<{
    geometry: THREE.BufferGeometry;
    material: THREE.MeshLambertMaterial;
    positions: Float32Array;
  } | null>(null);

  useEffect(() => {
    const safeCapacity = Math.max(1, capacity);
    const positions = new Float32Array(safeCapacity * 4 * 3);
    const normals = new Float32Array(safeCapacity * 4 * 3);
    const indices = new Uint16Array(safeCapacity * 6);
    for (let index = 0; index < safeCapacity; index += 1) {
      const vertexOffset = index * 4;
      const indexOffset = index * 6;
      indices.set(
        [
          vertexOffset,
          vertexOffset + 2,
          vertexOffset + 3,
          vertexOffset,
          vertexOffset + 3,
          vertexOffset + 1,
        ],
        indexOffset,
      );
      for (let vertex = 0; vertex < 4; vertex += 1)
        normals.set([0, 0, 1], (vertexOffset + vertex) * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color("#e4c56e"),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
      depthTest: true,
      depthWrite: false,
    });
    const acquired = {geometry, material, positions};
    let active = true;
    queueMicrotask(() => {
      if (active) setResource(acquired);
    });
    return () => {
      active = false;
      geometry.dispose();
      material.dispose();
    };
  }, [capacity]);

  useLayoutEffect(() => {
    if (!resource) return;
    const count = Math.min(capacity, segments.length);
    for (let index = 0; index < count; index += 1) {
      const [from, to] = segments[index];
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const dz = to[2] - from[2];
      const length = Math.max(Number.EPSILON, Math.hypot(dx, dy, dz));
      const tangent = [dx / length, dy / length, dz / length] as const;
      let widthX = -tangent[1];
      let widthY = tangent[0];
      let widthZ = 0;
      let widthLength = Math.hypot(widthX, widthY);
      if (widthLength <= Number.EPSILON) {
        widthX = tangent[2];
        widthY = 0;
        widthZ = -tangent[0];
        widthLength = Math.max(Number.EPSILON, Math.hypot(widthX, widthZ));
      }
      const halfWidth = widthMm / 2;
      widthX = (widthX / widthLength) * halfWidth;
      widthY = (widthY / widthLength) * halfWidth;
      widthZ = (widthZ / widthLength) * halfWidth;
      const offset = index * 12;
      resource.positions.set(
        [
          from[0] - widthX,
          from[1] - widthY,
          from[2] - widthZ + zOffsetMm,
          from[0] + widthX,
          from[1] + widthY,
          from[2] + widthZ + zOffsetMm,
          to[0] - widthX,
          to[1] - widthY,
          to[2] - widthZ + zOffsetMm,
          to[0] + widthX,
          to[1] + widthY,
          to[2] + widthZ + zOffsetMm,
        ],
        offset,
      );
    }
    resource.geometry.getAttribute("position").needsUpdate = true;
    resource.geometry.setDrawRange(0, count * 6);
    resource.geometry.computeBoundingSphere();
  }, [capacity, resource, segments, widthMm, zOffsetMm]);

  return resource ? (
    <mesh
      geometry={resource.geometry}
      material={resource.material}
      frustumCulled={false}
      userData={{constructionTapeRibbon: true, widthMm}}
    />
  ) : null;
}

function ScoreWheel({
  position,
  tangent,
  thicknessMm,
  visualUnitMm,
}: {
  position: ConstructionPoint3;
  tangent: ConstructionPoint3 | null;
  thicknessMm: number;
  visualUnitMm: number;
}) {
  const angle = tangentAngle(tangent);
  return (
    <group
      position={[
        position.xMm,
        position.yMm,
        thicknessMm / 2 + 1.4 * visualUnitMm,
      ]}
      rotation={[0, 0, angle]}
      userData={{constructionTool: "score-wheel"}}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[
            1.15 * visualUnitMm,
            1.15 * visualUnitMm,
            0.45 * visualUnitMm,
            24,
          ]}
        />
        <meshLambertMaterial color="#42504b" />
      </mesh>
      <mesh position={[-4.5 * visualUnitMm, 0, 0]}>
        <boxGeometry
          args={[
            7 * visualUnitMm,
            1.25 * visualUnitMm,
            0.8 * visualUnitMm,
          ]}
        />
        <meshLambertMaterial color="#d7a74f" />
      </mesh>
    </group>
  );
}

function UtilityKnife({
  position,
  tangent,
  thicknessMm,
  visualUnitMm,
}: {
  position: ConstructionPoint3;
  tangent: ConstructionPoint3 | null;
  thicknessMm: number;
  visualUnitMm: number;
}) {
  const angle = tangentAngle(tangent);
  return (
    <group
      position={[
        position.xMm,
        position.yMm,
        position.zMm + thicknessMm / 2 + 0.9 * visualUnitMm,
      ]}
      rotation={[0, 0, angle]}
      userData={{constructionTool: "utility-knife"}}
    >
      <mesh position={[-8 * visualUnitMm, 0, 0]}>
        <boxGeometry
          args={[
            9 * visualUnitMm,
            2.6 * visualUnitMm,
            1.3 * visualUnitMm,
          ]}
        />
        <meshLambertMaterial color="#d7a63d" />
      </mesh>
      <mesh position={[-1.75 * visualUnitMm, 0, -0.25 * visualUnitMm]}>
        <boxGeometry
          args={[
            3.5 * visualUnitMm,
            0.7 * visualUnitMm,
            0.2 * visualUnitMm,
          ]}
        />
        <meshPhongMaterial color="#d7ddd9" shininess={55} />
      </mesh>
      <mesh position={[-6.2 * visualUnitMm, 0, 0.8 * visualUnitMm]}>
        <boxGeometry
          args={[
            2.1 * visualUnitMm,
            1.2 * visualUnitMm,
            0.35 * visualUnitMm,
          ]}
        />
        <meshLambertMaterial color="#37443f" />
      </mesh>
    </group>
  );
}

function liftSegments(
  operation: ConstructionLiftOperation,
  zOffset: number,
): LineSegment[] {
  const points = Array.from({length: 17}, (_, index) => {
    const progress = index / 16;
    return [
      operation.from.xMm +
        (operation.to.xMm - operation.from.xMm) * progress,
      operation.from.yMm +
        (operation.to.yMm - operation.from.yMm) * progress,
      zOffset + 4 * operation.heightMm * progress * (1 - progress),
    ] as PointTuple;
  });
  return points.slice(0, -1).map((point, index) => [point, points[index + 1]]);
}

function cumulativePathSegments(
  source: readonly ConstructionPathSegment[],
  path: ConstructionPathFrame,
  zOffset: number,
  ownerFaceIds?: ReadonlyMap<string, string>,
  poseMatrices?: ReadonlyMap<string, THREE.Matrix4>,
) {
  const completed = new Set(path.completedIds);
  return source.flatMap((segment) => {
    const progress = completed.has(segment.id)
      ? 1
      : path.activeId === segment.id
        ? path.activeProgress
        : 0;
    if (progress <= 0) return [];
    const start = pointTuple(segment.from, zOffset);
    const end = partialEndpoint(segment.from, segment.to, progress, zOffset);
    const ownerFaceId = ownerFaceIds?.get(segment.id);
    const poseMatrix = ownerFaceId ? poseMatrices?.get(ownerFaceId) : undefined;
    return [
      (poseMatrix
        ? [transformPoint(start, poseMatrix), transformPoint(end, poseMatrix)]
        : [start, end]) as LineSegment,
    ];
  });
}

function visualUnitForNet(choreography: ConstructionChoreographyReady) {
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  choreography.foldNet.vertices.forEach((vertex) => {
    minimumX = Math.min(minimumX, vertex.xMm);
    maximumX = Math.max(maximumX, vertex.xMm);
    minimumY = Math.min(minimumY, vertex.yMm);
    maximumY = Math.max(maximumY, vertex.yMm);
  });
  const maximumSpan = Math.max(maximumX - minimumX, maximumY - minimumY);
  return Number.isFinite(maximumSpan) && maximumSpan > 0
    ? maximumSpan / 80
    : 1;
}

export function ConstructionTools({
  choreography,
  frame,
  thicknessMm,
  cutOwnerFaceIds,
  poseMatrices,
}: {
  choreography: ConstructionChoreographyReady;
  frame: ConstructionFrame;
  thicknessMm: number;
  cutOwnerFaceIds: ReadonlyMap<string, string>;
  poseMatrices: ReadonlyMap<string, THREE.Matrix4>;
}) {
  const lineOffset = thicknessMm / 2 + 0.45;
  const visualUnitMm = Math.max(thicknessMm, visualUnitForNet(choreography));
  const liftOperation =
    frame.operation?.kind === "LIFT" ? frame.operation : undefined;
  const activeLift =
    liftOperation
      ? frame.lifts.find(
          (lift) =>
            lift.fromCutId === liftOperation.fromCutId &&
            lift.toCutId === liftOperation.toCutId,
        )
      : undefined;
  const scoreWheelVisible =
    frame.stage.id === "scores" && frame.score.position !== null;
  const scoreSegments =
    frame.stage.id === "scores" ||
    frame.stage.id === "cuts" ||
    frame.stage.id === "cutting"
      ? cumulativePathSegments(
          choreography.scoreSegments,
          frame.score,
          lineOffset,
        )
      : [];
  const visibleTraceSegments =
    frame.stage.id === "cuts" || frame.stage.id === "cutting"
      ? cumulativePathSegments(
          choreography.cutSegments,
          frame.trace,
          lineOffset,
        )
      : [];
  const kerfSegments = frame.kerf.map((kerf) => {
    const ownerFaceId = cutOwnerFaceIds.get(kerf.cutId);
    const poseMatrix = ownerFaceId ? poseMatrices.get(ownerFaceId) : undefined;
    const start = pointTuple(kerf.from, lineOffset);
    const end = partialEndpoint(kerf.from, kerf.to, kerf.progress, lineOffset);
    return (poseMatrix
      ? [transformPoint(start, poseMatrix), transformPoint(end, poseMatrix)]
      : [start, end]) as LineSegment;
  });
  const activeLiftSegments = activeLift
    ? liftSegments(activeLift, lineOffset)
    : [];
  const tapeSegments = frame.tape.visible
    ? frame.tape.centerlines.map(
        (centerline) =>
          [
            pointTuple(centerline[0]),
            partialEndpoint(
              centerline[0],
              centerline[1],
              frame.tape.progress,
              0,
            ),
          ] as LineSegment,
      )
    : [];

  return (
    <group userData={{constructionLayer: "tools-and-marks"}}>
      <BatchedLineSegments
        name="scores"
        segments={scoreSegments}
        capacity={choreography.scoreSegments.length}
        color="#2d7462"
        opacity={0.86}
      />
      <BatchedLineSegments
        name="cut-trace"
        segments={visibleTraceSegments}
        capacity={choreography.cutSegments.length}
        color="#a74e32"
        opacity={0.72}
      />
      <BatchedLineSegments
        name="kerf"
        segments={kerfSegments}
        capacity={choreography.cutSegments.length}
        color="#191c1b"
      />
      <BatchedLineSegments
        name="knife-lift"
        segments={activeLiftSegments}
        capacity={16}
        color="#a74e32"
        opacity={0.86}
      />
      <PhysicalTapeRibbon
        segments={tapeSegments}
        capacity={Math.max(1, choreography.order.seamIds.length)}
        widthMm={10}
        zOffsetMm={thicknessMm / 2 + 0.4}
      />

      {scoreWheelVisible ? (
        <ScoreWheel
          position={frame.score.position!}
          tangent={frame.score.tangent}
          thicknessMm={thicknessMm}
          visualUnitMm={visualUnitMm}
        />
      ) : null}

      {frame.knife.visible && frame.knife.position ? (
        <UtilityKnife
          position={frame.knife.position}
          tangent={frame.knife.tangent}
          thicknessMm={thicknessMm}
          visualUnitMm={visualUnitMm}
        />
      ) : null}
    </group>
  );
}
