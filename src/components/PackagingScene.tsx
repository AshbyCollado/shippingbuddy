"use client";

import {Canvas} from "@react-three/fiber";
import {ContactShadows, Environment, Edges, Lightformer, Line, OrbitControls} from "@react-three/drei";
import {useMemo} from "react";
import * as THREE from "three";
import type {RscPlan, ScrapRegion, WrapPlan} from "@/domain/geometry";
import {getAnimationFrame} from "@/domain/animation";
import {foldNetAtProgress} from "@/domain/foldnet";
import SceneEffects from "@/components/SceneEffects";
import FoldNetScene from "@/components/FoldNetScene";

type DisplayPlan = WrapPlan | RscPlan;
type Unit = "in" | "mm";
type SceneProps = {plan: DisplayPlan; progress: number; unit: Unit};
const SHADOW_SETTINGS = {type: THREE.PCFShadowMap};

type Rect = {id: string; x: number; y: number; width: number; height: number; role: string};

function formatDimension(valueMm: number, unit: Unit) {
  return `${unit === "in" ? (valueMm / 25.4).toFixed(2).replace(/\.?(0+)$/, "") : Math.round(valueMm)} ${unit}`;
}

function bounds(rectangles: Rect[]) {
  return {
    minX: Math.min(...rectangles.map((rect) => rect.x)),
    minY: Math.min(...rectangles.map((rect) => rect.y)),
    maxX: Math.max(...rectangles.map((rect) => rect.x + rect.width)),
    maxY: Math.max(...rectangles.map((rect) => rect.y + rect.height)),
  };
}

function planRectangles(plan: WrapPlan, scale: number): Rect[] {
  const frame = bounds(plan.rectangles.map((rect) => ({id: rect.id, x: rect.xMm, y: rect.yMm, width: rect.widthMm, height: rect.heightMm, role: rect.role})));
  const centerX = (frame.minX + frame.maxX) / 2;
  const centerY = (frame.minY + frame.maxY) / 2;
  return plan.rectangles.map((rect) => ({
    id: rect.id,
    x: (rect.xMm - centerX) * scale,
    y: (rect.yMm - centerY) * scale,
    width: rect.widthMm * scale,
    height: rect.heightMm * scale,
    role: rect.role,
  }));
}

function scrapRectangles(plan: WrapPlan, scale: number): Rect[] {
  const all = plan.rectangles.map((rect) => ({id: rect.id, x: rect.xMm, y: rect.yMm, width: rect.widthMm, height: rect.heightMm, role: rect.role}));
  const frame = bounds(all);
  const centerX = (frame.minX + frame.maxX) / 2;
  const centerY = (frame.minY + frame.maxY) / 2;
  return plan.scrapRegions.map((region: ScrapRegion) => {
    const minX = Math.min(...region.points.map((point) => point.xMm));
    const minY = Math.min(...region.points.map((point) => point.yMm));
    const maxX = Math.max(...region.points.map((point) => point.xMm));
    const maxY = Math.max(...region.points.map((point) => point.yMm));
    return {id: region.id, x: (minX - centerX) * scale, y: (minY - centerY) * scale, width: (maxX - minX) * scale, height: (maxY - minY) * scale, role: "SCRAP"};
  });
}

function rectCenter(rect: Rect): [number, number] {
  return [rect.x + rect.width / 2, -(rect.y + rect.height / 2)];
}

function materialColor(role: string) {
  if (role === "FLAP") return "#f5c98f";
  if (role === "TAB") return "#e8b878";
  if (role === "SCRAP") return "#d8855e";
  return "#e9ad70";
}

let cardboardTexture: THREE.DataTexture | undefined;

function getCardboardTexture() {
  if (cardboardTexture) return cardboardTexture;
  const size = 128;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = Math.sin((x / size) * Math.PI * 24 + Math.sin(y * 0.08)) * 18;
      const crossGrain = Math.sin((y / size) * Math.PI * 4) * 8;
      data[y * size + x] = Math.max(0, Math.min(255, 128 + grain + crossGrain));
    }
  }
  cardboardTexture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  cardboardTexture.wrapS = THREE.RepeatWrapping;
  cardboardTexture.wrapT = THREE.RepeatWrapping;
  cardboardTexture.repeat.set(2.5, 2.5);
  cardboardTexture.needsUpdate = true;
  return cardboardTexture;
}

function CardboardMaterial({role, opacity = 1, interior = false}: {role: string; opacity?: number; interior?: boolean}) {
  const texture = useMemo(() => getCardboardTexture(), []);
  return <meshPhysicalMaterial color={interior ? "#c98953" : materialColor(role)} roughness={interior ? 0.92 : 0.82} metalness={0} clearcoat={0.05} bumpMap={texture} bumpScale={interior ? 0.028 : 0.014} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />;
}

function StudioLighting() {
  return <>
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3.2} position={[4, 6, 5]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 4, 1]} />
      <Lightformer form="rect" intensity={1.8} position={[-5, 2, -3]} rotation={[0, Math.PI / 2, 0]} scale={[3, 5, 1]} />
      <Lightformer form="ring" intensity={1.1} position={[0, 2, 4]} scale={2.5} />
    </Environment>
    <directionalLight castShadow position={[4, 6, 7]} intensity={3.2} shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.00025} shadow-normalBias={0.035} />
    <directionalLight position={[-4, 2, -5]} intensity={0.65} color="#b9ded3" />
  </>;
}

function FlatPanel({rect, opacity, z = 0}: {rect: Rect; opacity: number; z?: number}) {
  const [x, y] = rectCenter(rect);
  return <mesh position={[x, y, z]} castShadow receiveShadow>
    <boxGeometry args={[rect.width, rect.height, rect.role === "TAB" ? 0.045 : 0.07]} />
    <CardboardMaterial role={rect.role} opacity={opacity} interior={rect.role === "FLAP"} />
  </mesh>;
}

type FoldAxis = "x" | "y";

/** Render a plan rectangle as a rigid panel rotating around its actual net hinge. */
function RigidPanel({rect, pivot, axis, fold, direction, opacity}: {rect: Rect; pivot: [number, number]; axis: FoldAxis; fold: number; direction: 1 | -1; opacity: number}) {
  const [centerX, centerY] = rectCenter(rect);
  const localCenter: [number, number, number] = [centerX - pivot[0], centerY - pivot[1], 0];
  const angle = Math.max(0, Math.min(1, fold)) * Math.PI / 2 * direction;
  const rotation: [number, number, number] = axis === "x" ? [angle, 0, 0] : [0, angle, 0];
  return <group position={[pivot[0], pivot[1], 0]} rotation={rotation}>
    <mesh position={localCenter} castShadow receiveShadow>
      <boxGeometry args={[rect.width, rect.height, rect.role === "TAB" ? 0.045 : 0.07]} />
      <CardboardMaterial role={rect.role} opacity={opacity} interior={rect.role === "FLAP"} />
      <Edges color="#a36540" linewidth={0.45} />
    </mesh>
  </group>;
}

function sourcePoint(xMm: number, yMm: number, centerX: number, centerY: number, scale: number): [number, number] {
  return [(xMm - centerX) * scale, -(yMm - centerY) * scale];
}

function panelById(rectangles: Rect[], id: string) {
  return rectangles.find((rect) => rect.id === id);
}

// Once the generated panels meet, this compact closure shell keeps the top-fold and
// final-seal frames readable while the generated net remains the source of truth.
function AssemblyWall({side, length, width, height, progress, opacity}: {side: "front" | "back" | "left" | "right"; length: number; width: number; height: number; progress: number; opacity: number}) {
  const p = Math.max(0, Math.min(1, progress));
  const thickness = 0.1;
  if (side === "front" || side === "back") {
    const front = side === "front";
    return <mesh position={[0, (front ? -1 : 1) * (width / 2 + (1 - p) * height / 2), p * height / 2]} rotation={[(front ? 1 : -1) * (1 - p) * Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[length, thickness, height]} />
      <CardboardMaterial role="PANEL" opacity={opacity} />
    </mesh>;
  }
  const left = side === "left";
  return <mesh position={[(left ? -1 : 1) * (length / 2 + (1 - p) * height / 2), 0, p * height / 2]} rotation={[0, (left ? -1 : 1) * (1 - p) * Math.PI / 2, 0]} castShadow receiveShadow>
    <boxGeometry args={[thickness, width, height]} />
    <CardboardMaterial role="PANEL" opacity={opacity} />
  </mesh>;
}

function AssemblyFlap({front, length, width, height, progress}: {front: boolean; length: number; width: number; height: number; progress: number}) {
  const p = Math.max(0, Math.min(1, progress));
  return <mesh position={[0, (front ? -1 : 1) * (width * (0.5 + (1 - p) * 0.12)), height + (1 - p) * 0.08]} rotation={[(front ? -1 : 1) * (1 - p) * Math.PI / 2, 0, 0]} castShadow receiveShadow>
    <boxGeometry args={[length * 0.94, width * 0.48, 0.08]} />
    <CardboardMaterial role="FLAP" opacity={Math.max(0.05, p)} interior />
  </mesh>;
}

/** A compact, closed presentation of the generated carton after the top seam is sealed. */
function SealedPackage({length, width, height, opacity}: {length: number; width: number; height: number; opacity: number}) {
  const thickness = 0.1;
  const wallOpacity = Math.max(0.05, opacity);
  return <group>
    <mesh position={[0, 0, height / 2]} castShadow receiveShadow>
      <boxGeometry args={[length, width, height]} />
      <CardboardMaterial role="PANEL" opacity={wallOpacity} />
      <Edges color="#925b3b" linewidth={1} />
    </mesh>
    <mesh position={[0, width / 2 + 0.018, height / 2]} renderOrder={20} castShadow receiveShadow>
      <boxGeometry args={[length * 0.985, 0.035, height * 0.985]} />
      <meshPhysicalMaterial color="#b56d37" roughness={0.84} metalness={0} clearcoat={0.04} depthTest={false} />
      <Edges color="#925b3b" linewidth={1} />
    </mesh>
    <mesh position={[0, 0, thickness / 2]} castShadow receiveShadow>
      <boxGeometry args={[length, width, thickness]} />
      <CardboardMaterial role="PANEL" opacity={wallOpacity} />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[0, -width / 2 + thickness / 2, height / 2]} castShadow receiveShadow>
      <boxGeometry args={[length, thickness, height]} />
      <CardboardMaterial role="PANEL" opacity={wallOpacity} />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[0, width / 2 - thickness / 2, height / 2]} castShadow receiveShadow>
      <boxGeometry args={[length, thickness, height]} />
      <CardboardMaterial role="PANEL" opacity={wallOpacity} />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[-length / 2 + thickness / 2, 0, height / 2]} castShadow receiveShadow>
      <boxGeometry args={[thickness, width - thickness * 2, height]} />
      <CardboardMaterial role="PANEL" opacity={wallOpacity} />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[length / 2 - thickness / 2, 0, height / 2]} castShadow receiveShadow>
      <boxGeometry args={[thickness, width - thickness * 2, height]} />
      <CardboardMaterial role="PANEL" opacity={wallOpacity} />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[0, -width / 4, height + thickness / 2]} castShadow receiveShadow>
      <boxGeometry args={[length - thickness * 2, width / 2 - thickness * 1.2, thickness]} />
      <CardboardMaterial role="FLAP" opacity={wallOpacity} interior />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[0, width / 4, height + thickness / 2]} castShadow receiveShadow>
      <boxGeometry args={[length - thickness * 2, width / 2 - thickness * 1.2, thickness]} />
      <CardboardMaterial role="FLAP" opacity={wallOpacity} interior />
      <Edges color="#925b3b" linewidth={0.9} />
    </mesh>
    <mesh position={[0, 0, height + thickness + 0.015]} castShadow receiveShadow>
      <boxGeometry args={[length * 0.46, 0.085, 0.035]} />
      <meshPhysicalMaterial color="#f7f0d8" roughness={0.68} metalness={0} clearcoat={0.08} transparent opacity={wallOpacity} />
    </mesh>
  </group>;
}

function CutPath({plan, scale, progress}: {plan: WrapPlan; scale: number; progress: number}) {
  const all = plan.rectangles.map((rect) => ({id: rect.id, x: rect.xMm, y: rect.yMm, width: rect.widthMm, height: rect.heightMm, role: rect.role}));
  const frame = bounds(all);
  const centerX = (frame.minX + frame.maxX) / 2;
  const centerY = (frame.minY + frame.maxY) / 2;
  const lengths = plan.cuts.map((cut) => Math.hypot(cut.to.xMm - cut.from.xMm, cut.to.yMm - cut.from.yMm));
  const totalLength = Math.max(0.0001, lengths.reduce((sum, length) => sum + length, 0));
  let remaining = Math.max(0, Math.min(1, progress)) * totalLength;
  let cutterPoint: [number, number, number] = [0, 0, 0.12];
  const completed = plan.cuts.map((cut, index) => {
    const length = lengths[index];
    const local = Math.max(0, Math.min(1, remaining / Math.max(length, 0.0001)));
    remaining -= length;
    const from: [number, number, number] = [(cut.from.xMm - centerX) * scale, -(cut.from.yMm - centerY) * scale, 0.08];
    const to: [number, number, number] = [(cut.to.xMm - centerX) * scale, -(cut.to.yMm - centerY) * scale, 0.08];
    if (progress > 0 && progress < 1 && local > 0 && local < 1) cutterPoint = [from[0] + (to[0] - from[0]) * local, from[1] + (to[1] - from[1]) * local, 0.12];
    return {cut, from, to, progress: local};
  });
  return <>
    {completed.map(({cut, from, to, progress: local}) => <Line key={cut.id} points={[from, to]} color="#df765c" lineWidth={2.5} transparent opacity={local >= 1 ? 1 : local} />)}
    {progress > 0 && progress < 1 && <mesh position={cutterPoint} castShadow>
      <boxGeometry args={[0.22, 0.1, 0.12]} />
      <meshPhysicalMaterial color="#477167" roughness={0.3} metalness={0.35} />
    </mesh>}
  </>;
}

// Legacy rectangle renderer kept as a rollback reference while FoldNet is the active path.
// eslint-disable-next-line no-unused-vars
function WrapModel({plan, frame}: {plan: WrapPlan; frame: ReturnType<typeof getAnimationFrame>}) {
  const scale = Math.min(4.4 / plan.metrics.netWidthMm, 3.25 / plan.metrics.netHeightMm);
  const rectangles = useMemo(() => planRectangles(plan, scale), [plan, scale]);
  const scraps = useMemo(() => scrapRectangles(plan, scale), [plan, scale]);
  const sourceBounds = bounds(plan.rectangles.map((rect) => ({id: rect.id, x: rect.xMm, y: rect.yMm, width: rect.widthMm, height: rect.heightMm, role: rect.role})));
  const sourceCenterX = (sourceBounds.minX + sourceBounds.maxX) / 2;
  const sourceCenterY = (sourceBounds.minY + sourceBounds.maxY) / 2;
  const base = rectangles.find((rect) => rect.id === "bottom");
  const rawRect = (id: string) => plan.rectangles.find((rect) => rect.id === id);
  const frontWall = panelById(rectangles, "front-wall");
  const backWall = panelById(rectangles, "back-wall");
  const leftWall = panelById(rectangles, "left-wall");
  const rightWall = panelById(rectangles, "right-wall");
  const walls = frame.walls;
  const top = frame.top;
  const cutProgress = frame.cutting > 0 ? frame.cutting : frame.cuts;
  const itemScale = Math.min(plan.requiredInternal.lengthMm, plan.requiredInternal.widthMm) * scale;
  const finalPresentation = frame.present > 0.01;
  return <>
    <StudioLighting />
    <ContactShadows position={[0, -1.55, 0]} scale={7} blur={2.6} far={4} opacity={0.28} frames={1} />
    <SceneEffects />
    <group rotation={[-0.18, 0.25, 0]} position={[0, -0.15, 0]}>
      <group visible={!finalPresentation}>
      <group visible={frame.walls < 0.68 && !finalPresentation}>
        <mesh position={[0, 0, -0.08]}>
          <planeGeometry args={[plan.metrics.requiredSheetWidthMm * scale, plan.metrics.requiredSheetHeightMm * scale]} />
          <meshStandardMaterial color="#dcefe9" transparent opacity={0.38} side={2} roughness={1} />
        </mesh>
        {rectangles.map((rect) => <FlatPanel key={`flat-${rect.id}`} rect={rect} opacity={Math.max(0, 1 - walls) * (rect.role === "TAB" ? frame.tabs : 1)} />)}
        {plan.scores.map((score) => {
          const pointA: [number, number, number] = [(score.from.xMm - sourceCenterX) * scale, -(score.from.yMm - sourceCenterY) * scale, 0.12];
          const pointB: [number, number, number] = [(score.to.xMm - sourceCenterX) * scale, -(score.to.yMm - sourceCenterY) * scale, 0.12];
          return <Line key={`score-${score.id}`} points={[pointA, pointB]} color="#328f76" lineWidth={1.2} dashed dashSize={0.08} gapSize={0.06} transparent opacity={frame.scores} />;
        })}
        <CutPath plan={plan} scale={scale} progress={cutProgress} />
        {scraps.map((scrap) => <FlatPanel key={scrap.id} rect={{...scrap, y: scrap.y - frame.scrap * 1.3}} opacity={frame.scrap > 0 ? Math.max(0, 1 - frame.scrap) : frame.cuts * 0.9} z={0.2} />)}
      </group>
      {base && <FlatPanel rect={base} opacity={finalPresentation ? 0 : 0.98} z={0.05} />}
      <group visible={walls > 0.18 && top < 0.02 && !finalPresentation}>
        {frontWall && rawRect("front-wall") && <RigidPanel rect={frontWall} pivot={sourcePoint(rawRect("front-wall")!.xMm + rawRect("front-wall")!.widthMm / 2, 0, sourceCenterX, sourceCenterY, scale)} axis="x" fold={walls} direction={1} opacity={Math.max(0.08, walls)} />}
        {backWall && rawRect("back-wall") && <RigidPanel rect={backWall} pivot={sourcePoint(rawRect("back-wall")!.xMm + rawRect("back-wall")!.widthMm / 2, rawRect("back-wall")!.yMm, sourceCenterX, sourceCenterY, scale)} axis="x" fold={walls} direction={-1} opacity={Math.max(0.08, walls)} />}
        {leftWall && rawRect("left-wall") && <RigidPanel rect={leftWall} pivot={sourcePoint(0, rawRect("left-wall")!.yMm + rawRect("left-wall")!.heightMm / 2, sourceCenterX, sourceCenterY, scale)} axis="y" fold={walls} direction={-1} opacity={Math.max(0.08, walls)} />}
        {rightWall && rawRect("right-wall") && <RigidPanel rect={rightWall} pivot={sourcePoint(rawRect("right-wall")!.xMm, rawRect("right-wall")!.yMm + rawRect("right-wall")!.heightMm / 2, sourceCenterX, sourceCenterY, scale)} axis="y" fold={walls} direction={1} opacity={Math.max(0.08, walls)} />}
        {rectangles.filter((rect) => rect.role === "TAB").map((tab) => {
          const source = rawRect(tab.id);
          if (!source) return null;
          const left = source.xMm < 0;
          const pivot = sourcePoint(left ? source.xMm + source.widthMm : source.xMm, source.yMm + source.heightMm / 2, sourceCenterX, sourceCenterY, scale);
          return <RigidPanel key={`tab-${tab.id}`} rect={tab} pivot={pivot} axis="y" fold={frame.tabs} direction={left ? 1 : -1} opacity={Math.max(0.08, frame.tabs)} />;
        })}
        <mesh position={[0, -itemScale * 0.43, itemScale * 0.42]}>
          <boxGeometry args={[itemScale * 0.08, itemScale * 0.08, itemScale * 0.6]} />
          <CardboardMaterial role="TAB" opacity={frame.tabs} />
        </mesh>
        <mesh position={[0, itemScale * 0.43, itemScale * 0.42]}>
          <boxGeometry args={[itemScale * 0.08, itemScale * 0.08, itemScale * 0.6]} />
          <CardboardMaterial role="TAB" opacity={frame.tabs} />
        </mesh>
        {top < 0.02 && <>
          <AssemblyFlap front length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={0} />
          <AssemblyFlap front={false} length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={0} />
        </>}
      </group>
      <group visible={top >= 0.02 && !finalPresentation}>
        <AssemblyWall side="front" length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={walls} opacity={Math.max(0.08, walls)} />
        <AssemblyWall side="back" length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={walls} opacity={Math.max(0.08, walls)} />
        <AssemblyWall side="left" length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={walls} opacity={Math.max(0.08, walls)} />
        <AssemblyWall side="right" length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={walls} opacity={Math.max(0.08, walls)} />
        <AssemblyFlap front length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={top} />
        <AssemblyFlap front={false} length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} progress={top} />
      </group>
      <mesh visible={!finalPresentation} position={[0, 0, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[itemScale * 0.92, itemScale * 0.78, 0.12]} />
        <CardboardMaterial role="PANEL" opacity={0.98} />
      </mesh>
      <mesh visible={!finalPresentation} position={[0, 0, itemScale * 0.42]} castShadow receiveShadow>
        <boxGeometry args={[itemScale * 0.72, itemScale * 0.62, itemScale * 0.72]} />
        <meshPhysicalMaterial color="#bfd8cf" transparent opacity={finalPresentation ? 0 : 0.92} roughness={0.86} metalness={0} clearcoat={0.02} />
      </mesh>
      <mesh position={[0, 0, itemScale * 0.4]} visible={walls > 0.18 && !finalPresentation} castShadow receiveShadow>
        <boxGeometry args={[itemScale * 1.12, itemScale, itemScale * 0.76]} />
        <meshPhysicalMaterial color="#c47e4b" wireframe transparent opacity={Math.max(0.08, walls * 0.24)} roughness={0.82} metalness={0} />
        <Edges color="#9b603d" linewidth={1.2} />
      </mesh>
      <Line visible={!finalPresentation} points={[[-itemScale * 0.36, -itemScale * 0.36, itemScale * 0.74], [itemScale * 0.36, -itemScale * 0.36, itemScale * 0.74], [itemScale * 0.36, itemScale * 0.36, itemScale * 0.74], [-itemScale * 0.36, itemScale * 0.36, itemScale * 0.74], [-itemScale * 0.36, -itemScale * 0.36, itemScale * 0.74]]} color="#477167" lineWidth={1.4} transparent opacity={frame.envelope} />
      {frame.seal > 0 && !finalPresentation && <mesh position={[0, 0, itemScale * 0.8]}>
        <boxGeometry args={[itemScale * 0.3 * frame.seal, itemScale * 0.08, 0.04]} />
        <meshPhysicalMaterial color="#f9f7ed" roughness={0.7} metalness={0} clearcoat={0.1} />
      </mesh>}
      </group>
      {finalPresentation && <SealedPackage length={itemScale * 1.12} width={itemScale} height={itemScale * 0.76} opacity={frame.present} />}
    </group>
    <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.7} maxPolarAngle={1.35} />
  </>;
}

/** The generated FoldNet renderer is the authoritative flat-sheet scene. */
function GeneratedWrapModel({plan, frame}: {plan: WrapPlan; frame: ReturnType<typeof getAnimationFrame>}) {
  // The tutorial geometry remains layered on desktop, but medium is the
  // default interactive tier so checkpoint controls never compete with a
  // continuously-rendered postprocess pass. Low tier is selected on phones.
  const quality = (typeof window !== "undefined" && window.innerWidth <= 600 ? "low" : "medium") as "low" | "medium" | "high";
  return <>
    <StudioLighting />
    <ContactShadows position={[0, -1.55, 0]} scale={7} blur={2.6} far={4} opacity={0.28} frames={1} />
    <FoldNetScene plan={plan} frame={frame} quality={quality} />
    <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.7} maxPolarAngle={1.35} />
  </>;
}

function RscModel({plan, frame}: {plan: RscPlan; frame: ReturnType<typeof getAnimationFrame>}) {
  const scale = 3 / Math.max(plan.finalInternal.lengthMm, plan.finalInternal.widthMm, plan.finalInternal.heightMm);
  const length = plan.finalInternal.lengthMm * scale;
  const width = plan.finalInternal.widthMm * scale;
  const height = plan.finalInternal.heightMm * scale;
  const walls = Math.max(frame.walls, frame.present);
  const top = Math.max(frame.top, frame.present);
  return <>
    <StudioLighting />
    <ContactShadows position={[0, -1.55, 0]} scale={6} blur={2.4} far={4} opacity={0.24} frames={1} />
    <SceneEffects />
    <group rotation={[-0.3, 0.45, 0]}>
      <mesh position={[0, 0, height * 0.48]} castShadow receiveShadow>
        <boxGeometry args={[length, width, height]} />
        <CardboardMaterial role="PANEL" opacity={Math.max(0.12, walls)} />
      </mesh>
      <mesh position={[0, 0, height * (0.97 + top * 0.12)]} rotation={[-Math.PI / 2 * (1 - top), 0, 0]} castShadow receiveShadow>
        <planeGeometry args={[length * 0.92, width * 0.92]} />
        <CardboardMaterial role="FLAP" opacity={Math.max(0.1, top)} interior />
      </mesh>
      <mesh position={[0, 0, height * 0.56]} castShadow receiveShadow>
        <boxGeometry args={[length * 0.7, width * 0.7, height * 0.7]} />
        <meshPhysicalMaterial color="#bfd8cf" transparent opacity={0.9} roughness={0.86} metalness={0} />
      </mesh>
    </group>
    <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.7} maxPolarAngle={1.35} />
  </>;
}

export default function PackagingScene({plan, progress, unit}: SceneProps) {
  const frame = getAnimationFrame(progress, plan.id === "WRAP_BOX_V1" ? "wrap" : plan.sourceMode === "EXISTING_BOX" ? "existing" : "rsc");
  const foldDiagnostics = plan.id === "WRAP_BOX_V1" ? foldNetAtProgress(plan.foldNet, progress).diagnostics : undefined;
  const invalidFold = Boolean(foldDiagnostics && (foldDiagnostics.nonFiniteValues || foldDiagnostics.detachedFaceIds.length > 0 || foldDiagnostics.maxHingeGapMm > 0.5 || foldDiagnostics.maxEdgeStretchMm > 0.5));
  const caption = frame.label;
  const label = `${plan.id === "WRAP_BOX_V1" ? "3D packaging preview" : plan.sourceMode === "EXISTING_BOX" ? "Existing box packing preview" : "RSC assembly"} at ${Math.round(frame.progress * 100)} percent`;
  const cutProgress = frame.cutting > 0 ? frame.cutting : frame.cuts;
  return <div className="scene-stage scene-stage-3d" role="img" aria-label={label} data-animation-stage={frame.stage} data-pattern-id={plan.id === "WRAP_BOX_V1" ? plan.patternId : plan.id} data-fold-face-count={plan.id === "WRAP_BOX_V1" ? plan.foldNet.faces.length : 0} data-cut-progress={cutProgress.toFixed(3)} data-seal-progress={frame.seal.toFixed(3)} data-panel-count={plan.id === "WRAP_BOX_V1" ? plan.rectangles.length : 0} data-scrap-count={plan.id === "WRAP_BOX_V1" ? plan.scrapRegions.length : 0} data-cut-count={plan.id === "WRAP_BOX_V1" ? plan.cuts.length : 0} data-sealed-seam={frame.seal >= 1 ? "visible" : "hidden"} data-final-closed={frame.present > 0.01 && !foldDiagnostics?.nonFiniteValues ? "true" : "false"} data-detached-panels={foldDiagnostics?.detachedFaceIds.length ?? 0} data-hinge-gap-mm={(foldDiagnostics?.maxHingeGapMm ?? 0).toFixed(3)} data-edge-stretch-mm={(foldDiagnostics?.maxEdgeStretchMm ?? 0).toFixed(3)}>
    <Canvas orthographic shadows={SHADOW_SETTINGS} camera={{position: [5, 5, 7], zoom: 95}} dpr={[1, 1.5]} gl={{antialias: false, alpha: true, powerPreference: "high-performance"}} onCreated={({gl}) => { gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.08; }}>
      {plan.id === "WRAP_BOX_V1" ? <GeneratedWrapModel plan={plan} frame={frame} /> : <RscModel plan={plan} frame={frame} />}
    </Canvas>
    <div className="scene-caption"><span className="live-dot" /> {caption}</div>
    {invalidFold && <div className="scene-diagnostics" role="status"><strong>Preview warning</strong><span>This fold stage has a measured geometry gap. Treat it as a prototype and validate the cut on real board.</span></div>}
    <div className="scene-dimension-badge">{plan.id === "WRAP_BOX_V1" ? `${formatDimension(plan.requiredInternal.lengthMm, unit)} internal` : `${formatDimension(plan.finalInternal.lengthMm, unit)} internal`}</div>
  </div>;
}
