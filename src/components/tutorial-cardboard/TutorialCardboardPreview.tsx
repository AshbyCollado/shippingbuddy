"use client";

import {OrbitControls} from "@react-three/drei";
import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {gsap} from "gsap";
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type Dispatch, type MutableRefObject, type SetStateAction} from "react";
import * as THREE from "three";
import type {Dimensions3D} from "@/domain/geometry";
import {
  acquireTutorialCardboardGeometry,
  tutorialCardboardGeometryCacheSize,
  tutorialCardboardGeometryResourceCount,
  type TutorialCardboardGeometryOptions,
} from "./tutorialGeometry";
import {fitTutorialCamera, type TutorialCameraFit} from "./tutorialCamera";

const FOUNDATION_COMMIT = "ba9e8b6b73044d48e4c362ecfbe1a3ffe504adf8";
const LEGACY_LIGHT_SCALE = Math.PI;
const PANEL_IDS = [
  "backHalf-width-side", "backHalf-width-top", "backHalf-width-bottom",
  "backHalf-length-side", "backHalf-length-top", "backHalf-length-bottom",
  "frontHalf-width-side", "frontHalf-width-top", "frontHalf-width-bottom",
  "frontHalf-length-side", "frontHalf-length-top", "frontHalf-length-bottom",
] as const;

type Half = "backHalf" | "frontHalf";
type Side = "width" | "length";
type Flap = "top" | "bottom";
type AnimatedBox = {
  openingAngle: number;
  flapAngles: Record<Half, Record<Side, Record<Flap, number>>>;
};

type TutorialDimensions = {
  width: number;
  length: number;
  depth: number;
  thickness: number;
  fluteFrequency: number;
  flapGap: number;
};

type GeometrySet = {
  sideLength: THREE.BufferGeometry;
  sideWidth: THREE.BufferGeometry;
  topLength: THREE.BufferGeometry;
  bottomLength: THREE.BufferGeometry;
  topWidth: THREE.BufferGeometry;
  bottomWidth: THREE.BufferGeometry;
  release: () => void;
};

type ResourceState = {cacheSize: number; resourceCount: number};
type RendererMetrics = {drawCalls: number; triangles: number; geometries: number; textures: number};
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
type CameraState = Pick<TutorialCameraFit, "mode" | "occupancy" | "azimuth" | "polar" | "transition" | "valid"> & {distance: number};

const INITIAL_CAMERA_STATE: CameraState = {mode: "TOP_DOWN", occupancy: 0, azimuth: 0, polar: 0, transition: 0, valid: false, distance: 0};
const INITIAL_RENDERER_METRICS: RendererMetrics = {drawCalls: 0, triangles: 0, geometries: 0, textures: 0};

const INITIAL_ANIMATION = (): AnimatedBox => ({
  openingAngle: 0.02 * Math.PI,
  flapAngles: {
    backHalf: {width: {top: 0, bottom: 0}, length: {top: 0, bottom: 0}},
    frontHalf: {width: {top: 0, bottom: 0}, length: {top: 0, bottom: 0}},
  },
});

function normalizeDimensions(dimensions: Dimensions3D): TutorialDimensions {
  const largest = Math.max(dimensions.lengthMm, dimensions.widthMm, dimensions.heightMm, 1);
  const scale = 80 / largest;
  const width = dimensions.widthMm * scale;
  const length = dimensions.lengthMm * scale;
  const depth = dimensions.heightMm * scale;
  return {
    width,
    length,
    depth,
    thickness: 0.6,
    fluteFrequency: 5,
    flapGap: Math.min(1, 0.45 * Math.min(width, length)),
  };
}

function stageForProgress(progress: number) {
  const timelineTime = progress * 2.7;
  if (timelineTime < 0.9) return "OPENING";
  if (timelineTime < 1.4) return "LOWER_FLAPS";
  if (timelineTime < 1.8) return "UPPER_FLAPS";
  return "CLOSURE";
}

function geometryOptions(span: number, depth: number, dimensions: TutorialDimensions, folds: TutorialCardboardGeometryOptions["folds"], hasFluteCore: boolean, translationY = 0): TutorialCardboardGeometryOptions {
  return {span, depth, thickness: dimensions.thickness, fluteFrequency: dimensions.fluteFrequency, folds, hasFluteCore, translationY};
}

function useTutorialGeometrySet(dimensions: TutorialDimensions, setResources: Dispatch<SetStateAction<ResourceState>>) {
  const flapHeight = 0.5 * dimensions.width - 0.75 * dimensions.flapGap;
  const lengthFlapWidth = dimensions.length - 2 * dimensions.flapGap;
  const widthFlapWidth = dimensions.width - 2 * dimensions.flapGap;
  const [geometry, setGeometry] = useState<GeometrySet | null>(null);

  useEffect(() => {
    const entries = [
      acquireTutorialCardboardGeometry(geometryOptions(dimensions.length, dimensions.depth, dimensions, [true, true, true, true], false)),
      acquireTutorialCardboardGeometry(geometryOptions(dimensions.width, dimensions.depth, dimensions, [true, true, true, true], false)),
      acquireTutorialCardboardGeometry(geometryOptions(lengthFlapWidth, flapHeight, dimensions, [false, false, true, false], true, 0.5 * flapHeight)),
      acquireTutorialCardboardGeometry(geometryOptions(lengthFlapWidth, flapHeight, dimensions, [true, false, false, false], true, -0.5 * flapHeight)),
      acquireTutorialCardboardGeometry(geometryOptions(widthFlapWidth, flapHeight, dimensions, [false, false, true, false], true, 0.5 * flapHeight)),
      acquireTutorialCardboardGeometry(geometryOptions(widthFlapWidth, flapHeight, dimensions, [true, false, false, false], true, -0.5 * flapHeight)),
    ];
    const acquired = {
      sideLength: entries[0].geometry,
      sideWidth: entries[1].geometry,
      topLength: entries[2].geometry,
      bottomLength: entries[3].geometry,
      topWidth: entries[4].geometry,
      bottomWidth: entries[5].geometry,
      release: () => entries.forEach((entry) => entry.release()),
    } satisfies GeometrySet;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setGeometry(acquired);
      setResources({cacheSize: tutorialCardboardGeometryCacheSize(), resourceCount: tutorialCardboardGeometryResourceCount()});
    });
    return () => {
      active = false;
      acquired.release();
    };
  }, [dimensions, flapHeight, lengthFlapWidth, setResources, widthFlapWidth]);
  return geometry;
}

function CameraRelativeLights() {
  const holder = useRef<THREE.Group>(null);
  const {camera} = useThree();
  useLayoutEffect(() => { holder.current?.quaternion.copy(camera.quaternion); }, [camera]);
  useFrame(() => holder.current?.quaternion.copy(camera.quaternion));
  return <>
    <ambientLight intensity={0.5 * LEGACY_LIGHT_SCALE} />
    <group ref={holder}>
      <pointLight position={[-30, 300, 0]} intensity={0.5 * LEGACY_LIGHT_SCALE} decay={0} />
      <pointLight position={[50, 0, 150]} intensity={0.7 * LEGACY_LIGHT_SCALE} decay={0} />
    </group>
  </>;
}

function RendererMetricsProbe({setMetrics}: {setMetrics: Dispatch<SetStateAction<RendererMetrics>>}) {
  const signature = useRef("");
  const committed = useRef(false);
  useLayoutEffect(() => {
    committed.current = true;
    return () => {
      committed.current = false;
    };
  }, []);
  useFrame(({gl}) => {
    const next = {
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    };
    const nextSignature = `${next.drawCalls}:${next.triangles}:${next.geometries}:${next.textures}`;
    if (signature.current === nextSignature) return;
    signature.current = nextSignature;
    queueMicrotask(() => {
      if (committed.current) setMetrics(next);
    });
  });
  return null;
}

function cameraStateFromFit(fit: TutorialCameraFit): CameraState {
  return {mode: fit.mode, occupancy: fit.occupancy, azimuth: fit.azimuth, polar: fit.polar, transition: fit.transition, valid: fit.valid, distance: fit.distance};
}

function cameraStateFromControls(controls: OrbitControlsImpl, current: CameraState): CameraState {
  const offset = controls.object.position.clone().sub(controls.target);
  const distance = offset.length();
  return {
    ...current,
    distance,
    azimuth: Math.atan2(offset.x, offset.z),
    polar: Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(distance, Number.EPSILON), -1, 1)),
  };
}

function TutorialCameraRig({subjectRef, progress, dimensionsKey, resetGeneration, setCameraState}: {
  subjectRef: MutableRefObject<THREE.Group | null>;
  progress: number;
  dimensionsKey: string;
  resetGeneration: number;
  setCameraState: Dispatch<SetStateAction<CameraState>>;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const canonicalPending = useRef(true);
  const {size, invalidate} = useThree();

  const reportControls = useCallback(() => {
    const control = controls.current;
    if (!control) return;
    setCameraState((current) => cameraStateFromControls(control, current));
  }, [setCameraState]);

  useEffect(() => {
    canonicalPending.current = true;
    invalidate();
  }, [dimensionsKey, invalidate, progress, resetGeneration, size.height, size.width]);

  useFrame(() => {
    if (!canonicalPending.current) return;
    const subject = subjectRef.current;
    const control = controls.current;
    if (!subject || !control || size.width <= 0 || size.height <= 0) return;
    subject.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(subject);
    const fit = fitTutorialCamera(bounds, size.width / size.height, progress);
    if (!fit.valid) {
      canonicalPending.current = false;
      setCameraState(cameraStateFromFit(fit));
      return;
    }
    const dampingWasEnabled = control.enableDamping;
    control.enableDamping = false;
    control.update();
    control.object.position.copy(fit.position);
    control.object.near = 0.1;
    control.object.far = Math.max(1000, fit.distance * 4);
    control.object.updateProjectionMatrix();
    control.target.copy(fit.target);
    control.update();
    control.enableDamping = dampingWasEnabled;
    control.saveState();
    canonicalPending.current = false;
    setCameraState(cameraStateFromFit(fit));
    invalidate();
  }, -2);

  return <OrbitControls
    ref={controls}
    enableDamping
    enablePan={false}
    enableZoom={false}
    enableRotate
    minPolarAngle={0.05}
    maxPolarAngle={Math.PI / 2 - 0.035}
    onChange={() => {
      reportControls();
      invalidate();
    }}
  />;
}

function TutorialBox({dimensions, progress, setResources, subjectRef}: {dimensions: TutorialDimensions; progress: number; setResources: Dispatch<SetStateAction<ResourceState>>; subjectRef: MutableRefObject<THREE.Group | null>}) {
  const meshNodes = useRef<Record<string, THREE.Mesh | null>>({});
  const animation = useRef(INITIAL_ANIMATION());
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const {invalidate} = useThree();
  const geometry = useTutorialGeometrySet(dimensions, setResources);
  const [material, setMaterial] = useState<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    const nextMaterial = new THREE.MeshStandardMaterial({color: new THREE.Color(0x9C8D7B), side: THREE.DoubleSide, vertexColors: true});
    let active = true;
    queueMicrotask(() => {
      if (active) setMaterial(nextMaterial);
    });
    return () => {
      active = false;
      nextMaterial.dispose();
    };
  }, []);

  const updatePanelsTransform = useCallback(() => {
    const panels = meshNodes.current;
    const frontWidth = panels["frontHalf-width-side"];
    const backWidth = panels["backHalf-width-side"];
    const frontLength = panels["frontHalf-length-side"];
    const backLength = panels["backHalf-length-side"];
    if (!frontWidth || !backWidth || !frontLength || !backLength) return;
    const {openingAngle, flapAngles} = animation.current;
    frontWidth.position.x = 0.5 * dimensions.length;
    backWidth.position.x = -0.5 * dimensions.length;
    frontWidth.rotation.y = openingAngle;
    backWidth.rotation.y = openingAngle;
    const cosine = Math.cos(openingAngle);
    const sine = Math.sin(openingAngle);
    frontLength.position.x = -0.5 * cosine * dimensions.width;
    backLength.position.x = 0.5 * cosine * dimensions.width;
    frontLength.position.z = 0.5 * sine * dimensions.width;
    backLength.position.z = -0.5 * sine * dimensions.width;
    panels["frontHalf-width-top"]!.rotation.x = -flapAngles.frontHalf.width.top;
    panels["frontHalf-length-top"]!.rotation.x = -flapAngles.frontHalf.length.top;
    panels["frontHalf-width-bottom"]!.rotation.x = flapAngles.frontHalf.width.bottom;
    panels["frontHalf-length-bottom"]!.rotation.x = flapAngles.frontHalf.length.bottom;
    panels["backHalf-width-top"]!.rotation.x = flapAngles.backHalf.width.top;
    panels["backHalf-length-top"]!.rotation.x = flapAngles.backHalf.length.top;
    panels["backHalf-width-bottom"]!.rotation.x = -flapAngles.backHalf.width.bottom;
    panels["backHalf-length-bottom"]!.rotation.x = -flapAngles.backHalf.length.bottom;
  }, [dimensions.length, dimensions.width]);

  useEffect(() => {
    animation.current = INITIAL_ANIMATION();
    const animated = animation.current;
    const nextTimeline = gsap.timeline({paused: true})
      .to(animated, {duration: 1, openingAngle: 0.5 * Math.PI, ease: "power1.inOut"})
      .to([animated.flapAngles.backHalf.width, animated.flapAngles.frontHalf.width], {duration: 0.6, bottom: 0.6 * Math.PI, ease: "back.in(3)"}, 0.9)
      .to(animated.flapAngles.backHalf.length, {duration: 0.7, bottom: 0.5 * Math.PI, ease: "back.in(2)"}, 1.1)
      .to(animated.flapAngles.frontHalf.length, {duration: 0.8, bottom: 0.49 * Math.PI, ease: "back.in(3)"}, 1.4)
      .to([animated.flapAngles.backHalf.width, animated.flapAngles.frontHalf.width], {duration: 0.6, top: 0.6 * Math.PI, ease: "back.in(3)"}, 1.4)
      .to(animated.flapAngles.backHalf.length, {duration: 0.7, top: 0.5 * Math.PI, ease: "back.in(3)"}, 1.7)
      .to(animated.flapAngles.frontHalf.length, {duration: 0.9, top: 0.49 * Math.PI, ease: "back.in(4)"}, 1.8);
    timeline.current = nextTimeline;
    nextTimeline.totalProgress(0).pause();
    updatePanelsTransform();
    invalidate();
    return () => {
      nextTimeline.kill();
      if (timeline.current === nextTimeline) timeline.current = null;
    };
  }, [invalidate, updatePanelsTransform]);

  useEffect(() => {
    timeline.current?.totalProgress(progress).pause();
    updatePanelsTransform();
    invalidate();
  }, [invalidate, progress, updatePanelsTransform]);

  useFrame(updatePanelsTransform, -3);

  if (!geometry || !material) return null;

  const meshRef = (id: string) => (node: THREE.Mesh | null) => { meshNodes.current[id] = node; };
  const sideGeometry = (side: Side) => side === "length" ? geometry.sideLength : geometry.sideWidth;
  const topGeometry = (side: Side) => side === "length" ? geometry.topLength : geometry.topWidth;
  const bottomGeometry = (side: Side) => side === "length" ? geometry.bottomLength : geometry.bottomWidth;

  return <group ref={subjectRef} userData={{tutorialHierarchy: "group-four-walls-two-flaps"}}>
    {(["backHalf", "frontHalf"] as const).flatMap((half) => (["width", "length"] as const).map((side) => {
      const base = `${half}-${side}`;
      return <mesh key={`${base}-side`} ref={meshRef(`${base}-side`)} geometry={sideGeometry(side)} material={material} userData={{tutorialPanelId: `${base}-side`}}>
        <mesh ref={meshRef(`${base}-top`)} geometry={topGeometry(side)} material={material} position={[0, 0.5 * dimensions.depth, 0]} userData={{tutorialPanelId: `${base}-top`}} />
        <mesh ref={meshRef(`${base}-bottom`)} geometry={bottomGeometry(side)} material={material} position={[0, -0.5 * dimensions.depth, 0]} userData={{tutorialPanelId: `${base}-bottom`}} />
      </mesh>;
    }))}
  </group>;
}

export interface TutorialCardboardPreviewProps {
  dimensions: Dimensions3D;
}

export default function TutorialCardboardPreview({dimensions}: TutorialCardboardPreviewProps) {
  const [progress, setProgress] = useState(0);
  const [resources, setResources] = useState<ResourceState>({cacheSize: 0, resourceCount: 0});
  const [rendererMetrics, setRendererMetrics] = useState<RendererMetrics>(INITIAL_RENDERER_METRICS);
  const [cameraState, setCameraState] = useState<CameraState>(INITIAL_CAMERA_STATE);
  const [resetGeneration, setResetGeneration] = useState(0);
  const subjectRef = useRef<THREE.Group | null>(null);
  const tutorialDimensions = useMemo(() => normalizeDimensions(dimensions), [dimensions]);
  const dimensionsKey = `${tutorialDimensions.width}:${tutorialDimensions.length}:${tutorialDimensions.depth}:${tutorialDimensions.flapGap}`;
  const stage = stageForProgress(progress);

  return <section className="tutorial-cardboard-preview" data-tutorial-foundation-commit={FOUNDATION_COMMIT} data-tutorial-output-mode="legacy-linear-no-tone-mapping" data-tutorial-panel-count={PANEL_IDS.length} data-tutorial-progress={progress.toFixed(3)} data-tutorial-stage={stage} data-tutorial-normalized-width={tutorialDimensions.width.toFixed(3)} data-tutorial-normalized-length={tutorialDimensions.length.toFixed(3)} data-tutorial-normalized-depth={tutorialDimensions.depth.toFixed(3)} data-tutorial-camera-distance={cameraState.distance.toFixed(3)} data-tutorial-camera-mode={cameraState.mode} data-tutorial-camera-occupancy={cameraState.occupancy.toFixed(3)} data-tutorial-camera-azimuth={cameraState.azimuth.toFixed(5)} data-tutorial-camera-polar={cameraState.polar.toFixed(5)} data-tutorial-camera-transition={cameraState.transition.toFixed(3)} data-tutorial-camera-fit-valid={String(cameraState.valid)} data-tutorial-camera-reset-generation={resetGeneration} data-tutorial-geometry-cache={resources.cacheSize} data-tutorial-geometry-resources={resources.resourceCount} data-tutorial-draw-calls={rendererMetrics.drawCalls} data-tutorial-triangles={rendererMetrics.triangles} data-tutorial-geometries={rendererMetrics.geometries} data-tutorial-textures={rendererMetrics.textures}>
    <div className="tutorial-cardboard-preview-heading"><div><span>RSC fold preview</span><strong>Drag the slider to pause at any fold</strong></div><output aria-live="polite">{Math.round(progress * 100)}%</output></div>
    <div className="tutorial-cardboard-canvas" role="img" aria-label="Interactive corrugated cardboard RSC folding preview">
      <Canvas flat linear legacy frameloop="demand" dpr={[1, 2]} gl={{alpha: true, antialias: true}} camera={{fov: 45, position: [0, 12, 100], near: 0.1, far: 1000}}>
        <CameraRelativeLights />
        <TutorialBox dimensions={tutorialDimensions} progress={progress} setResources={setResources} subjectRef={subjectRef} />
        <TutorialCameraRig subjectRef={subjectRef} progress={progress} dimensionsKey={dimensionsKey} resetGeneration={resetGeneration} setCameraState={setCameraState} />
        <RendererMetricsProbe setMetrics={setRendererMetrics} />
      </Canvas>
    </div>
    <div className="tutorial-cardboard-controls"><label className="tutorial-cardboard-slider-label" htmlFor="tutorial-fold-preview"><span>Fold position</span><input id="tutorial-fold-preview" type="range" min="0" max="100" step="1" value={Math.round(progress * 100)} aria-valuetext={`${Math.round(progress * 100)} percent folded`} onChange={(event) => setProgress(Number(event.currentTarget.value) / 100)} /></label><button className="tutorial-cardboard-view-reset" type="button" onClick={() => setResetGeneration((generation) => generation + 1)}>Reset view</button></div>
    <div className="tutorial-cardboard-panel-registry" aria-hidden="true">{PANEL_IDS.map((panelId) => <span key={panelId} data-tutorial-panel-mesh={panelId} />)}</div>
  </section>;
}
