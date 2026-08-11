"use client";

import {useThree} from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import * as THREE from "three";
import {
  acquireCanonicalFaceGeometry,
  acquireCanonicalScrapGeometry,
  canonicalCardboardGeometryCacheSize,
  canonicalCardboardGeometryLiveReferenceCount,
  resolveCutFaceIds,
  type CanonicalCardboardGeometryHandle,
} from "./canonicalCardboardGeometry";
import {ConstructionTools} from "./ConstructionTools";
import type {
  ConstructionChoreographyReady,
  ConstructionFrame,
} from "@/domain/constructionChoreography";
import type {FoldNetTransform} from "@/domain/foldnet";
import type {WrapPlan} from "@/domain/geometry";

type GeometrySet = {
  readonly net: WrapPlan["foldNet"];
  readonly faces: ReadonlyMap<string, THREE.BufferGeometry>;
  readonly scraps: ReadonlyMap<string, THREE.BufferGeometry>;
  readonly triangleCount: number;
  readonly cardboardDrawCalls: number;
  readonly release: () => void;
};

export interface ConstructionResourceState {
  readonly ready: boolean;
  readonly generation: number;
  readonly cacheSize: number;
  readonly liveReferences: number;
  readonly faceGeometries: number;
  readonly scrapGeometries: number;
  readonly triangles: number;
  readonly cardboardDrawCalls: number;
  readonly materials: number;
  readonly textures: number;
  readonly error: string | null;
}

export const INITIAL_CONSTRUCTION_RESOURCES: ConstructionResourceState = {
  ready: false,
  generation: 0,
  cacheSize: 0,
  liveReferences: 0,
  faceGeometries: 0,
  scrapGeometries: 0,
  triangles: 0,
  cardboardDrawCalls: 0,
  materials: 0,
  textures: 0,
  error: null,
};

function triangleCount(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  return geometry.index
    ? geometry.index.count / 3
    : (position?.count ?? 0) / 3;
}

function drawCallCount(geometry: THREE.BufferGeometry) {
  return geometry.groups.filter((group) => group.count > 0).length || 1;
}

function useCanonicalGeometrySet(
  plan: WrapPlan,
  flutePitchMm: number,
  setResources: Dispatch<SetStateAction<ConstructionResourceState>>,
) {
  const [geometrySet, setGeometrySet] = useState<GeometrySet | null>(null);
  const {invalidate} = useThree();
  const thicknessMm = plan.profile.thicknessMm;

  useEffect(() => {
    const handles: CanonicalCardboardGeometryHandle[] = [];
    let active = true;
    try {
      const faceEntries = plan.foldNet.faces.map((face) => {
        const handle = acquireCanonicalFaceGeometry(plan.foldNet, face.id, {
          thicknessMm,
          flutePitchMm,
        });
        handles.push(handle);
        return [face.id, handle.geometry] as const;
      });
      const scrapEntries = plan.foldNet.scraps.map((scrap) => {
        const handle = acquireCanonicalScrapGeometry(plan.foldNet, scrap.id, {
          thicknessMm,
          flutePitchMm,
        });
        handles.push(handle);
        return [scrap.id, handle.geometry] as const;
      });
      const geometries = [...faceEntries, ...scrapEntries].map(([, geometry]) => geometry);
      const acquired: GeometrySet = {
        net: plan.foldNet,
        faces: new Map(faceEntries),
        scraps: new Map(scrapEntries),
        triangleCount: geometries.reduce(
          (total, geometry) => total + triangleCount(geometry),
          0,
        ),
        cardboardDrawCalls: geometries.reduce(
          (total, geometry) => total + drawCallCount(geometry),
          0,
        ),
        release: () => handles.forEach((handle) => handle.release()),
      };
      queueMicrotask(() => {
        if (!active) return;
        setGeometrySet(acquired);
        setResources((current) => ({
          ready: true,
          generation: current.generation + 1,
          cacheSize: canonicalCardboardGeometryCacheSize(),
          liveReferences: canonicalCardboardGeometryLiveReferenceCount(),
          faceGeometries: faceEntries.length,
          scrapGeometries: scrapEntries.length,
          triangles: acquired.triangleCount,
          cardboardDrawCalls: acquired.cardboardDrawCalls,
          materials: 1,
          textures: 0,
          error: null,
        }));
        invalidate();
      });
      return () => {
        active = false;
        acquired.release();
      };
    } catch (error) {
      handles.forEach((handle) => handle.release());
      const message =
        error instanceof Error
          ? error.message
          : "Canonical cardboard geometry could not be created.";
      queueMicrotask(() => {
        if (!active) return;
        setGeometrySet(null);
        setResources((current) => ({
          ...INITIAL_CONSTRUCTION_RESOURCES,
          generation: current.generation + 1,
          cacheSize: canonicalCardboardGeometryCacheSize(),
          liveReferences: canonicalCardboardGeometryLiveReferenceCount(),
          error: message,
        }));
        invalidate();
      });
      return () => {
        active = false;
      };
    }
  }, [flutePitchMm, invalidate, plan, setResources, thicknessMm]);

  return geometrySet?.net === plan.foldNet ? geometrySet : null;
}

function useCardboardMaterial() {
  const [material, setMaterial] = useState<THREE.MeshLambertMaterial | null>(null);
  const {invalidate} = useThree();

  useEffect(() => {
    // MeshStandardMaterial in Three r185 unconditionally uploads the shared
    // DFG_LUT texture. Matte Lambert lighting keeps this texture-free scene's
    // taupe, vertex-colored cardboard response without an environment lookup.
    const nextMaterial = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x9c8d7b),
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setMaterial(nextMaterial);
      invalidate();
    });
    return () => {
      active = false;
      nextMaterial.dispose();
    };
  }, [invalidate]);

  return material;
}

export function matrixFromFoldTransform(transform: FoldNetTransform) {
  return new THREE.Matrix4().set(
    transform.xAxis.xMm,
    transform.yAxis.xMm,
    transform.zAxis.xMm,
    transform.origin.xMm,
    transform.xAxis.yMm,
    transform.yAxis.yMm,
    transform.zAxis.yMm,
    transform.origin.yMm,
    transform.xAxis.zMm,
    transform.yAxis.zMm,
    transform.zAxis.zMm,
    transform.origin.zMm,
    0,
    0,
    0,
    1,
  );
}

function flatNetFrame(plan: WrapPlan) {
  const xValues = plan.foldNet.vertices.map((vertex) => vertex.xMm);
  const yValues = plan.foldNet.vertices.map((vertex) => vertex.yMm);
  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumY = Math.max(...yValues);
  const widthMm = Math.max(1, maximumX - minimumX);
  const heightMm = Math.max(1, maximumY - minimumY);
  const scale = 80 / Math.max(widthMm, heightMm, plan.requiredInternal.heightMm, 1);
  return {
    centerX: (minimumX + maximumX) / 2,
    centerY: (minimumY + maximumY) / 2,
    widthMm,
    heightMm,
    scale,
  };
}

function faceCenter(plan: WrapPlan, faceId: string) {
  const vertices = new Map(plan.foldNet.vertices.map((vertex) => [vertex.id, vertex]));
  const face = plan.foldNet.faces.find((candidate) => candidate.id === faceId);
  const points = face?.vertexIds.map((id) => vertices.get(id)).filter(Boolean) ?? [];
  if (!points.length) return {xMm: 0, yMm: 0};
  return {
    xMm: points.reduce((sum, point) => sum + point!.xMm, 0) / points.length,
    yMm: points.reduce((sum, point) => sum + point!.yMm, 0) / points.length,
  };
}

export function CutAndFoldScene({
  plan,
  choreography,
  frame,
  subjectRef,
  setResources,
}: {
  plan: WrapPlan;
  choreography: ConstructionChoreographyReady;
  frame: ConstructionFrame;
  subjectRef: MutableRefObject<THREE.Group | null>;
  setResources: Dispatch<SetStateAction<ConstructionResourceState>>;
}) {
  const thicknessMm = plan.profile.thicknessMm;
  const flutePitchMm = Math.max(1, thicknessMm * 1.5);
  const geometrySet = useCanonicalGeometrySet(plan, flutePitchMm, setResources);
  const cardboardMaterial = useCardboardMaterial();
  const modelFrame = useMemo(() => flatNetFrame(plan), [plan]);
  const poseMatrices = useMemo(
    () =>
      new Map(
        frame.fold.pose.faces.map((face) => [
          face.faceId,
          matrixFromFoldTransform(face.transform),
        ]),
      ),
    [frame.fold.pose.faces],
  );
  const cutOwnerFaceIds = useMemo(
    () =>
      new Map(
        plan.foldNet.cuts.flatMap((cut) => {
          const owner = resolveCutFaceIds(plan.foldNet, cut.id)[0];
          return owner ? [[cut.id, owner] as const] : [];
        }),
      ),
    [plan],
  );
  const bottomCenter = useMemo(
    () => faceCenter(plan, plan.foldNet.rootFaceId),
    [plan],
  );
  const itemDimensions = plan.packedEnvelope.orientation.packageDimensions;
  const itemPosition: [number, number, number] = [
    bottomCenter.xMm + plan.packedEnvelope.offsetMm.xMm,
    bottomCenter.yMm + plan.packedEnvelope.offsetMm.yMm,
    thicknessMm / 2 +
      plan.packedEnvelope.faceGaps.bottomMm +
      itemDimensions.heightMm / 2,
  ];
  const rootPoseMatrix =
    poseMatrices.get(plan.foldNet.rootFaceId) ?? new THREE.Matrix4();
  const scrapExitDistance = Math.max(modelFrame.widthMm, modelFrame.heightMm) * 0.28;
  const itemVisible =
    frame.stage.id === "envelope" ||
    frame.stage.id === "tabs" ||
    frame.stage.id === "walls" ||
    frame.stage.id === "top" ||
    frame.stage.id === "seal" ||
    frame.stage.id === "present";

  return (
    <group
      position={[
        -modelFrame.centerX * modelFrame.scale,
        -modelFrame.centerY * modelFrame.scale,
        0,
      ]}
      scale={modelFrame.scale}
      userData={{constructionTransform: "uniform-center-scale"}}
    >
      <group ref={subjectRef} userData={{constructionSubject: true}}>
        {geometrySet && cardboardMaterial
          ? plan.foldNet.faces.map((face) => {
              const geometry = geometrySet.faces.get(face.id);
              const matrix = poseMatrices.get(face.id);
              return geometry && matrix ? (
                <mesh
                  key={face.id}
                  geometry={geometry}
                  material={[cardboardMaterial, cardboardMaterial]}
                  matrix={matrix}
                  matrixAutoUpdate={false}
                  userData={{
                    constructionFaceId: face.id,
                    constructionFaceRole: face.role,
                  }}
                />
              ) : null;
            })
          : null}

        {geometrySet && cardboardMaterial
          ? frame.scraps.map((scrap) => {
              const geometry = geometrySet.scraps.get(scrap.id);
              if (!geometry || scrap.removalProgress >= 1) return null;
              const directionLength = Math.max(
                Number.EPSILON,
                Math.hypot(scrap.exitDirection[0], scrap.exitDirection[1]),
              );
              const distance = scrapExitDistance * scrap.removalProgress;
              return (
                <mesh
                  key={scrap.id}
                  geometry={geometry}
                  material={[cardboardMaterial, cardboardMaterial]}
                  position={[
                    (scrap.exitDirection[0] / directionLength) * distance,
                    (scrap.exitDirection[1] / directionLength) * distance,
                    thicknessMm * 3 * scrap.removalProgress,
                  ]}
                  visible={scrap.ready || scrap.removalProgress === 0}
                  userData={{
                    constructionScrapId: scrap.id,
                    constructionScrapReady: scrap.ready,
                  }}
                />
              );
            })
          : null}

        {itemVisible ? (
          <group matrix={rootPoseMatrix} matrixAutoUpdate={false}>
            <mesh
              position={itemPosition}
              userData={{constructionItem: "measured-outer-envelope"}}
            >
              <boxGeometry
                args={[
                  itemDimensions.lengthMm,
                  itemDimensions.widthMm,
                  itemDimensions.heightMm,
                ]}
              />
              <meshLambertMaterial
                color="#627c70"
              />
            </mesh>
          </group>
        ) : null}
      </group>

      <ConstructionTools
        choreography={choreography}
        frame={frame}
        thicknessMm={thicknessMm}
        cutOwnerFaceIds={cutOwnerFaceIds}
        poseMatrices={poseMatrices}
      />
    </group>
  );
}
