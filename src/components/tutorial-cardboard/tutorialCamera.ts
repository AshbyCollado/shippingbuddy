import * as THREE from "three";

export const TUTORIAL_CAMERA_FOV_DEGREES = 45;
export const TUTORIAL_CAMERA_OCCUPANCY = 0.72;
export const TUTORIAL_TOP_DOWN_DIRECTION = new THREE.Vector3(0, 0.12, 1).normalize();
export const TUTORIAL_THREE_QUARTER_DIRECTION = new THREE.Vector3(40, 90, 110).normalize();

export type TutorialCameraMode = "TOP_DOWN" | "TRANSITION" | "THREE_QUARTER";

export type TutorialCameraFit = {
  valid: boolean;
  mode: TutorialCameraMode;
  transition: number;
  target: THREE.Vector3;
  position: THREE.Vector3;
  distance: number;
  occupancy: number;
  azimuth: number;
  polar: number;
};

type CameraBasis = {
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
};

function smoothstep(start: number, end: number, value: number) {
  const normalized = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function invalidCameraFit(): TutorialCameraFit {
  return {
    valid: false,
    mode: "TOP_DOWN",
    transition: 0,
    target: new THREE.Vector3(),
    position: new THREE.Vector3(),
    distance: 0,
    occupancy: 0,
    azimuth: 0,
    polar: 0,
  };
}

function basisForDirection(direction: THREE.Vector3): CameraBasis {
  const forward = direction.clone().negate().normalize();
  const referenceUp = Math.abs(forward.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, referenceUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return {right, up, forward};
}

function extentsInCameraPlane(bounds: THREE.Box3, target: THREE.Vector3, basis: CameraBasis) {
  const minimum = bounds.min;
  const maximum = bounds.max;
  const corners = [
    new THREE.Vector3(minimum.x, minimum.y, minimum.z), new THREE.Vector3(minimum.x, minimum.y, maximum.z),
    new THREE.Vector3(minimum.x, maximum.y, minimum.z), new THREE.Vector3(minimum.x, maximum.y, maximum.z),
    new THREE.Vector3(maximum.x, minimum.y, minimum.z), new THREE.Vector3(maximum.x, minimum.y, maximum.z),
    new THREE.Vector3(maximum.x, maximum.y, minimum.z), new THREE.Vector3(maximum.x, maximum.y, maximum.z),
  ];
  let halfWidth = 0;
  let halfHeight = 0;
  let halfDepth = 0;
  for (const corner of corners) {
    const offset = corner.sub(target);
    halfWidth = Math.max(halfWidth, Math.abs(offset.dot(basis.right)));
    halfHeight = Math.max(halfHeight, Math.abs(offset.dot(basis.up)));
    halfDepth = Math.max(halfDepth, Math.abs(offset.dot(basis.forward)));
  }
  return {halfWidth, halfHeight, halfDepth};
}

export function tutorialCameraModeForProgress(progress: number): Pick<TutorialCameraFit, "mode" | "transition"> & {direction: THREE.Vector3} {
  const finiteProgress = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0;
  const transition = smoothstep(0.3, 0.52, finiteProgress);
  if (transition === 0) return {mode: "TOP_DOWN", transition, direction: TUTORIAL_TOP_DOWN_DIRECTION.clone()};
  if (transition === 1) return {mode: "THREE_QUARTER", transition, direction: TUTORIAL_THREE_QUARTER_DIRECTION.clone()};
  return {
    mode: "TRANSITION",
    transition,
    direction: TUTORIAL_TOP_DOWN_DIRECTION.clone().lerp(TUTORIAL_THREE_QUARTER_DIRECTION, transition).normalize(),
  };
}

/** Fits the current posed Box3, not a nominal carton size, so every open stage remains in view. */
export function fitTutorialCamera(bounds: THREE.Box3, aspect: number, progress: number, fovDegrees = TUTORIAL_CAMERA_FOV_DEGREES, targetOccupancy = TUTORIAL_CAMERA_OCCUPANCY): TutorialCameraFit {
  if (!bounds?.isBox3 || !bounds.min || !bounds.max) return invalidCameraFit();
  const coordinates = [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z];
  const validParameters = Number.isFinite(aspect) && aspect > 0
    && Number.isFinite(fovDegrees) && fovDegrees > 0 && fovDegrees < 180
    && Number.isFinite(targetOccupancy) && targetOccupancy > 0 && targetOccupancy < 1;
  if (!validParameters || coordinates.some((coordinate) => !Number.isFinite(coordinate)) || bounds.isEmpty()) return invalidCameraFit();

  const diagonal = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  if (!Number.isFinite(diagonal) || diagonal <= 0) return invalidCameraFit();

  const stage = tutorialCameraModeForProgress(progress);
  const target = bounds.getCenter(new THREE.Vector3());

  const direction = stage.direction;
  const basis = basisForDirection(direction);
  const {halfWidth, halfHeight, halfDepth} = extentsInCameraPlane(bounds, target, basis);
  const verticalFov = THREE.MathUtils.degToRad(fovDegrees);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const widthDistance = halfWidth / (Math.tan(horizontalFov / 2) * targetOccupancy);
  const heightDistance = halfHeight / (Math.tan(verticalFov / 2) * targetOccupancy);
  const distance = Math.max(1, halfDepth + widthDistance, halfDepth + heightDistance);
  const visibleHalfWidth = Math.max(Number.EPSILON, (distance - halfDepth) * Math.tan(horizontalFov / 2));
  const visibleHalfHeight = Math.max(Number.EPSILON, (distance - halfDepth) * Math.tan(verticalFov / 2));
  const occupancy = Math.max(halfWidth / visibleHalfWidth, halfHeight / visibleHalfHeight);
  const position = target.clone().addScaledVector(direction, distance);
  const offset = position.clone().sub(target);
  const azimuth = Math.atan2(offset.x, offset.z);
  const polar = Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(distance, Number.EPSILON), -1, 1));
  const finiteResult = [target.x, target.y, target.z, position.x, position.y, position.z, distance, occupancy, azimuth, polar].every(Number.isFinite);
  if (!finiteResult) return invalidCameraFit();

  return {
    valid: true,
    ...stage,
    target,
    position,
    distance,
    occupancy,
    azimuth,
    polar,
  };
}
