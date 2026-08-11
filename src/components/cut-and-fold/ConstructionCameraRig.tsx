"use client";

import {OrbitControls} from "@react-three/drei";
import {useFrame, useThree} from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import * as THREE from "three";
import {
  fitTutorialCamera,
  type TutorialCameraFit,
  type TutorialCameraMode,
} from "@/components/tutorial-cardboard/tutorialCamera";

const CAMERA_TRANSITION_START = 0.44;
const CAMERA_TRANSITION_END = 0.62;
const LEGACY_LIGHT_SCALE = Math.PI;

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

export interface ConstructionCameraState {
  readonly mode: TutorialCameraMode;
  readonly occupancy: number;
  readonly azimuth: number;
  readonly polar: number;
  readonly transition: number;
  readonly valid: boolean;
  readonly distance: number;
  readonly boundsWidth: number;
  readonly boundsHeight: number;
  readonly boundsDepth: number;
}

export const INITIAL_CONSTRUCTION_CAMERA_STATE: ConstructionCameraState = {
  mode: "TOP_DOWN",
  occupancy: 0,
  azimuth: 0,
  polar: 0,
  transition: 0,
  valid: false,
  distance: 0,
  boundsWidth: 0,
  boundsHeight: 0,
  boundsDepth: 0,
};

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Maps the construction stages onto the verified camera fitter's transition window. */
export function constructionCameraFitProgress(progress: number) {
  const normalized = clampProgress(progress);
  if (normalized <= CAMERA_TRANSITION_START) return 0;
  if (normalized >= CAMERA_TRANSITION_END) return 1;
  const transition =
    (normalized - CAMERA_TRANSITION_START) /
    (CAMERA_TRANSITION_END - CAMERA_TRANSITION_START);
  return 0.3 + transition * 0.22;
}

function orbitAngles(position: THREE.Vector3, target: THREE.Vector3) {
  const offset = position.clone().sub(target);
  const distance = offset.length();
  return {
    distance,
    azimuth: Math.atan2(offset.y, offset.x),
    polar: Math.acos(
      THREE.MathUtils.clamp(
        offset.z / Math.max(distance, Number.EPSILON),
        -1,
        1,
      ),
    ),
  };
}

function stateFromFit(
  fit: TutorialCameraFit,
  bounds?: THREE.Box3,
): ConstructionCameraState {
  const angles = orbitAngles(fit.position, fit.target);
  const size = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
  return {
    mode: fit.mode,
    occupancy: fit.occupancy,
    azimuth: angles.azimuth,
    polar: angles.polar,
    transition: fit.transition,
    valid: fit.valid,
    distance: fit.distance,
    boundsWidth: size.x,
    boundsHeight: size.y,
    boundsDepth: size.z,
  };
}

function stateFromControls(
  controls: OrbitControlsImpl,
  current: ConstructionCameraState,
): ConstructionCameraState {
  return {
    ...current,
    ...orbitAngles(controls.object.position, controls.target),
  };
}

export function ConstructionCameraLights() {
  const holder = useRef<THREE.Group>(null);
  const {camera} = useThree();

  useLayoutEffect(() => {
    holder.current?.quaternion.copy(camera.quaternion);
  }, [camera]);
  useFrame(() => holder.current?.quaternion.copy(camera.quaternion), 0);

  return (
    <>
      <ambientLight intensity={0.5 * LEGACY_LIGHT_SCALE} />
      <group ref={holder}>
        <pointLight
          position={[-30, 300, 0]}
          intensity={0.5 * LEGACY_LIGHT_SCALE}
          decay={0}
        />
        <pointLight
          position={[50, 0, 150]}
          intensity={0.7 * LEGACY_LIGHT_SCALE}
          decay={0}
        />
      </group>
    </>
  );
}

export function ConstructionCameraRig({
  subjectRef,
  progress,
  contentKey,
  resetGeneration,
  setCameraState,
}: {
  subjectRef: MutableRefObject<THREE.Group | null>;
  progress: number;
  contentKey: string;
  resetGeneration: number;
  setCameraState: Dispatch<SetStateAction<ConstructionCameraState>>;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const canonicalPending = useRef(true);
  const {camera, size, invalidate} = useThree();

  useLayoutEffect(() => {
    camera.up.set(0, 0, 1);
    camera.updateProjectionMatrix();
  }, [camera]);

  const reportControls = useCallback(() => {
    const control = controls.current;
    if (!control) return;
    setCameraState((current) => stateFromControls(control, current));
  }, [setCameraState]);

  useEffect(() => {
    canonicalPending.current = true;
    invalidate();
  }, [contentKey, invalidate, progress, resetGeneration, size.height, size.width]);

  useFrame(() => {
    if (!canonicalPending.current) return;
    const subject = subjectRef.current;
    const control = controls.current;
    if (!subject || !control || size.width <= 0 || size.height <= 0) return;

    subject.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(subject);
    const fit = fitTutorialCamera(
      bounds,
      size.width / size.height,
      constructionCameraFitProgress(progress),
    );
    if (!fit.valid) {
      canonicalPending.current = false;
      setCameraState(stateFromFit(fit, bounds));
      return;
    }

    // OrbitControls retains a damped spherical delta. Consume it before every
    // canonical install so progress, resize, and Reset all settle identically.
    const dampingWasEnabled = control.enableDamping;
    control.enableDamping = false;
    control.update();
    control.object.up.set(0, 0, 1);
    control.object.position.copy(fit.position);
    control.object.near = 0.1;
    control.object.far = Math.max(1000, fit.distance * 4);
    control.object.updateProjectionMatrix();
    control.target.copy(fit.target);
    control.update();
    control.enableDamping = dampingWasEnabled;
    control.saveState();
    canonicalPending.current = false;
    setCameraState(stateFromFit(fit, bounds));
    invalidate();
  }, -2);

  return (
    <OrbitControls
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
    />
  );
}
