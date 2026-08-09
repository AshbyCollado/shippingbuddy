"use client";

import {Line} from "@react-three/drei";
import {useMemo} from "react";
import * as THREE from "three";
import type {AnimationFrame} from "@/domain/animation";
import {foldNetAtProgress, type FoldFacePose, type FoldNet} from "@/domain/foldnet";
import type {WrapPlan} from "@/domain/geometry";
import {CorrugatedPanel, type CorrugatedQuality} from "./corrugatedCardboard";

type Props = {plan: WrapPlan; frame: AnimationFrame; quality?: CorrugatedQuality};
type ScenePoint = [number, number, number];

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }

function scenePoint(point: {xMm: number; yMm: number; zMm: number}, centerX: number, centerY: number, scale: number): ScenePoint {
  return [(point.xMm - centerX) * scale, -(point.yMm - centerY) * scale, point.zMm * scale];
}

function faceBounds(face: FoldFacePose, scale: number, centerX: number, centerY: number) {
  const points = face.vertices.map((point) => scenePoint(point, centerX, centerY, scale));
  const p0 = points[0] ?? [0, 0, 0];
  const p1 = points[1] ?? p0;
  const p2 = points[2] ?? p1;
  const p3 = points[3] ?? p0;
  const xAxis = new THREE.Vector3(...p1).sub(new THREE.Vector3(...p0)).normalize();
  const yAxis = new THREE.Vector3(...p3).sub(new THREE.Vector3(...p0)).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const center = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]] as ScenePoint, [0, 0, 0]);
  center[0] /= points.length || 1;
  center[1] /= points.length || 1;
  center[2] /= points.length || 1;
  const width = Math.max(0.01, new THREE.Vector3(...p1).distanceTo(new THREE.Vector3(...p0)));
  const height = Math.max(0.01, new THREE.Vector3(...p2).distanceTo(new THREE.Vector3(...p1)));
  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  return {points, center, width, height, quaternion};
}

function cutPolyline(plan: WrapPlan, scale: number, centerX: number, centerY: number, progress: number) {
  const lengths = plan.cuts.map((cut) => Math.hypot(cut.to.xMm - cut.from.xMm, cut.to.yMm - cut.from.yMm));
  const total = Math.max(0.0001, lengths.reduce((sum, value) => sum + value, 0));
  let remaining = clamp(progress) * total;
  let cursor: ScenePoint = [0, 0, 0.14];
  const completed: ScenePoint[][] = [];
  plan.cuts.forEach((cut, index) => {
    const from: ScenePoint = [(cut.from.xMm - centerX) * scale, -(cut.from.yMm - centerY) * scale, 0.12];
    const to: ScenePoint = [(cut.to.xMm - centerX) * scale, -(cut.to.yMm - centerY) * scale, 0.12];
    const length = lengths[index];
    if (remaining >= length) {
      completed.push([from, to]);
      remaining -= length;
      cursor = to;
      return;
    }
    const t = Math.max(0, Math.min(1, remaining / Math.max(length, 0.0001)));
    if (remaining > 0) completed.push([from, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0.12]]);
    cursor = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0.15];
    remaining = 0;
  });
  return {completed, cursor};
}

function FaceMesh({net, faceId, pose, role, scale, centerX, centerY, material, quality}: {
  net: FoldNet;
  faceId: string;
  pose: FoldFacePose;
  role: string;
  scale: number;
  centerX: number;
  centerY: number;
  material: THREE.Material;
  quality: CorrugatedQuality;
}) {
  const sourceFace = net.faces.find((face) => face.id === faceId);
  const sourcePoints = (sourceFace?.vertexIds ?? []).map((id) => net.vertices.find((vertex) => vertex.id === id)).filter(Boolean) as {xMm: number; yMm: number}[];
  const sourceWidth = sourcePoints.length > 1 ? Math.hypot(sourcePoints[1].xMm - sourcePoints[0].xMm, sourcePoints[1].yMm - sourcePoints[0].yMm) * scale : 1;
  const sourceHeight = sourcePoints.length > 2 ? Math.hypot(sourcePoints[2].xMm - sourcePoints[1].xMm, sourcePoints[2].yMm - sourcePoints[1].yMm) * scale : 1;
  const dimensions = {...faceBounds(pose, scale, centerX, centerY), width: Math.max(0.01, sourceWidth), height: Math.max(0.01, sourceHeight)};
  const rectangular = sourceFace?.vertexIds.length === 4;
  const polygonGeometry = useMemo(() => {
    if (rectangular) return undefined;
    const points = (sourceFace?.vertexIds ?? []).map((id) => net.vertices.find((vertex) => vertex.id === id)).filter(Boolean).map((vertex) => [vertex!.xMm * scale, -vertex!.yMm * scale] as [number, number]);
    const center = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]] as [number, number], [0, 0]);
    center[0] /= points.length || 1; center[1] /= points.length || 1;
    const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point[0] - center[0], point[1] - center[1])));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.computeVertexNormals();
    return geometry;
  }, [net, rectangular, scale, sourceFace]);
  const opacity = role === "TAB" ? 0.96 : 1;
  return <group position={dimensions.center} quaternion={dimensions.quaternion}>
    {rectangular ? <CorrugatedPanel width={dimensions.width} height={dimensions.height} thickness={0.075} quality={quality} fluteFrequency={7} hingeAttenuation={0.82} material={material} castShadow receiveShadow /> : <mesh geometry={polygonGeometry} material={material} castShadow receiveShadow />}
    {opacity < 1 && <mesh visible={false} />}
  </group>;
}

function ItemEnvelope({plan, scale, visible}: {plan: WrapPlan; scale: number; visible: boolean}) {
  const dimensions = plan.requiredInternal;
  const length = dimensions.lengthMm * scale;
  const width = dimensions.widthMm * scale;
  const height = dimensions.heightMm * scale;
  const profile = plan.packedEnvelope.itemProfile.kind;
  const material = <meshPhysicalMaterial color="#b9d6cd" transparent opacity={0.82} roughness={0.86} metalness={0} clearcoat={0.02} />;
  return <group visible={visible} position={[(plan.packedEnvelope.offsetMm.xMm) * scale, -(plan.packedEnvelope.offsetMm.yMm) * scale, height * 0.5]}>
    {profile === "CYLINDER_TUBE" ? <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[Math.min(width, height) * 0.48, Math.min(width, height) * 0.48, length * 0.96, 32]} />{material}</mesh> : profile === "ROUNDED_FORM" ? <mesh castShadow receiveShadow scale={[length * 0.48, width * 0.48, height * 0.48]}><sphereGeometry args={[2, 24, 16]} />{material}</mesh> : profile === "L_U_MEASURED" ? <group>{<mesh position={[-length * 0.2, 0, 0]} castShadow receiveShadow><boxGeometry args={[length * 0.56, width * 0.94, height * 0.94]} />{material}</mesh>}<mesh position={[length * 0.2, width * 0.22, 0]} castShadow receiveShadow><boxGeometry args={[length * 0.56, width * 0.48, height * 0.94]} />{material}</mesh></group> : <mesh castShadow receiveShadow><boxGeometry args={[length * 0.96, width * 0.96, height * 0.96]} />{material}</mesh>}
  </group>;
}

/**
 * Tutorial-foundation renderer: faces come from the FoldNet, while each
 * rectangular face uses the shared layered corrugated geometry and all poses
 * come from the domain fold solver. No presentation-only sealed shell is used.
 */
export default function FoldNetScene({plan, frame, quality = "high"}: Props) {
  const net = plan.foldNet;
  const sourcePoints = net.vertices;
  const minX = Math.min(...sourcePoints.map((point) => point.xMm));
  const maxX = Math.max(...sourcePoints.map((point) => point.xMm));
  const minY = Math.min(...sourcePoints.map((point) => point.yMm));
  const maxY = Math.max(...sourcePoints.map((point) => point.yMm));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = Math.min(4.35 / Math.max(1, maxX - minX), 3.1 / Math.max(1, maxY - minY));
  const pose = foldNetAtProgress(net, frame.progress);
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({color: "#bd7845", roughness: 0.82, metalness: 0, clearcoat: 0.04, side: THREE.DoubleSide}), []);
  const cut = useMemo(() => cutPolyline(plan, scale, centerX, centerY, frame.cutting > 0 ? frame.cutting : frame.cuts), [centerX, centerY, frame.cuts, frame.cutting, plan, scale]);
  const faceVisible = frame.present >= 0 || frame.reveal >= 0;
  const tapeVisible = frame.seal >= 1;
  const topZ = Math.max(...pose.faces.flatMap((face) => face.vertices.map((point) => point.zMm))) * scale;
  return <group rotation={[-0.18, 0.25, 0]} position={[0, -0.15, 0]}>
    <mesh visible={frame.scrap < 0.98 && (frame.reveal < 1 || frame.walls < 0.35)} position={[0, 0, -0.09]}>
      <planeGeometry args={[plan.metrics.requiredSheetWidthMm * scale, plan.metrics.requiredSheetHeightMm * scale]} />
      <meshStandardMaterial color="#dcefe9" transparent opacity={0.3} roughness={1} side={THREE.DoubleSide} />
    </mesh>
    <group visible={faceVisible}>
      {pose.faces.map((face) => <FaceMesh key={face.faceId} net={net} faceId={face.faceId} pose={face} role={net.faces.find((candidate) => candidate.id === face.faceId)?.role ?? "PANEL"} scale={scale} centerX={centerX} centerY={centerY} material={material} quality={quality} />)}
    </group>
    <ItemEnvelope plan={plan} scale={scale} visible={frame.envelope > 0 && (frame.walls < 0.74 || frame.top < 0.4)} />
    {net.steps.length > 0 && plan.scores.map((score) => <Line key={`score-${score.id}`} points={[[ (score.from.xMm - centerX) * scale, -(score.from.yMm - centerY) * scale, 0.13], [(score.to.xMm - centerX) * scale, -(score.to.yMm - centerY) * scale, 0.13]]} color="#3a9c7c" lineWidth={1.15} dashed dashSize={0.08} gapSize={0.06} transparent opacity={frame.scores * Math.max(0, 1 - frame.walls)} />)}
    {net.scraps?.map((scrap) => {
      const drift = frame.scrap * 1.35;
      const points = scrap.points.map((point) => scenePoint({xMm: point.xMm + scrap.exitDirection[0] * drift / Math.max(scale, 0.001), yMm: point.yMm + scrap.exitDirection[1] * drift / Math.max(scale, 0.001), zMm: 0.08}, centerX, centerY, scale));
      return <Line key={`scrap-${scrap.id}`} points={[...points, points[0]]} color="#d8855e" lineWidth={1.35} transparent opacity={Math.max(0, 0.75 * (1 - frame.scrap))} />;
    })}
    {cut.completed.map((points, index) => <Line key={`cut-${index}`} points={points} color="#df765c" lineWidth={2.1} transparent opacity={Math.max(0, 1 - frame.scrap) * (frame.cutting > 0 || frame.cuts > 0 ? 1 : 0)} />)}
    {frame.cutting > 0 && frame.cutting < 1 && <mesh position={cut.cursor} castShadow><sphereGeometry args={[0.085, 12, 8]} /><meshStandardMaterial color="#477167" roughness={0.35} metalness={0.25} /></mesh>}
    {tapeVisible && <mesh position={[0, 0, topZ + 0.04]} renderOrder={10}><boxGeometry args={[Math.max(0.2, plan.requiredInternal.lengthMm * scale * 0.42), 0.08, 0.035]} /><meshPhysicalMaterial color="#f7f0d8" roughness={0.68} metalness={0} clearcoat={0.08} /></mesh>}
  </group>;
}
