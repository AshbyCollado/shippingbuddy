"use client";

import {Canvas, useFrame} from "@react-three/fiber";
import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import * as THREE from "three";
import {
  createConstructionChoreography,
  constructionFrameAt,
} from "@/domain/constructionChoreography";
import {nextAnimationCheckpoint} from "@/domain/animation";
import type {WrapPlan} from "@/domain/geometry";
import {
  ConstructionCameraLights,
  ConstructionCameraRig,
  INITIAL_CONSTRUCTION_CAMERA_STATE,
  type ConstructionCameraState,
} from "./ConstructionCameraRig";
import {
  CutAndFoldScene,
  INITIAL_CONSTRUCTION_RESOURCES,
  type ConstructionResourceState,
} from "./CutAndFoldScene";

type RendererMetrics = {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
};

const INITIAL_RENDERER_METRICS: RendererMetrics = {
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};

function RendererMetricsProbe({
  setMetrics,
}: {
  setMetrics: Dispatch<SetStateAction<RendererMetrics>>;
}) {
  const signature = useRef("");
  useFrame(({gl}) => {
    const next = {
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    };
    const nextSignature = `${next.drawCalls}:${next.triangles}:${next.geometries}:${next.textures}`;
    if (nextSignature === signature.current) return;
    signature.current = nextSignature;
    queueMicrotask(() => setMetrics(next));
  });
  return null;
}

function pointTelemetry(point: {xMm: number; yMm: number; zMm: number} | null) {
  return point
    ? `${point.xMm.toFixed(3)},${point.yMm.toFixed(3)},${point.zMm.toFixed(3)}`
    : "none";
}

export interface CutAndFoldPreviewProps {
  readonly plan: WrapPlan;
}

export default function CutAndFoldPreview({plan}: CutAndFoldPreviewProps) {
  const choreography = useMemo(
    () => createConstructionChoreography(plan.foldNet),
    [plan],
  );
  const [progress, setProgress] = useState(0);
  const [resetGeneration, setResetGeneration] = useState(0);
  const [resources, setResources] = useState<ConstructionResourceState>(
    INITIAL_CONSTRUCTION_RESOURCES,
  );
  const [rendererMetrics, setRendererMetrics] = useState<RendererMetrics>(
    INITIAL_RENDERER_METRICS,
  );
  const [cameraState, setCameraState] = useState<ConstructionCameraState>(
    INITIAL_CONSTRUCTION_CAMERA_STATE,
  );
  const subjectRef = useRef<THREE.Group | null>(null);

  if (choreography.status === "INVALID") {
    return (
      <section
        className="cut-and-fold-preview is-blocked"
        data-construction-status="INVALID"
        data-construction-canvas-count="0"
      >
        <strong>The cut-and-fold preview could not be prepared.</strong>
        <p>{choreography.errors.join(" ")}</p>
      </section>
    );
  }

  const sampled = constructionFrameAt(choreography, progress);
  if (sampled.status === "INVALID") {
    return (
      <section
        className="cut-and-fold-preview is-blocked"
        data-construction-status="INVALID"
        data-construction-canvas-count="0"
      >
        <strong>The construction frame could not be prepared.</strong>
        <p>{sampled.errors.join(" ")}</p>
      </section>
    );
  }

  if (resources.error) {
    return (
      <section
        className="cut-and-fold-preview is-blocked"
        data-construction-status="GEOMETRY_ERROR"
        data-construction-canvas-count="0"
      >
        <strong>The cardboard model could not be created.</strong>
        <p>{resources.error}</p>
      </section>
    );
  }

  const frame = sampled;
  const operation = frame.operation;
  const activeLift = operation?.kind === "LIFT";
  const readyScraps = frame.scraps.filter((scrap) => scrap.ready).length;
  const removingScraps = frame.scraps.filter(
    (scrap) => scrap.removalProgress > 0 && scrap.removalProgress < 1,
  ).length;
  const removedScraps = frame.scraps.filter(
    (scrap) => scrap.removalProgress >= 1,
  ).length;
  const diagnosticCount =
    frame.fold.diagnostics.detachedFaceIds.length +
    frame.fold.diagnostics.creaseTearIds.length +
    frame.fold.diagnostics.inversionFaceIds.length +
    frame.fold.diagnostics.collisionPairs.length +
    frame.fold.diagnostics.missingVertexIds.length +
    Number(frame.fold.diagnostics.nonFiniteValues);
  const contentKey = `${plan.patternId}:${plan.foldNet.metadata.orientation.id}:${resources.generation}`;
  const previousProgress = nextAnimationCheckpoint(progress, "wrap", -1);
  const nextProgress = nextAnimationCheckpoint(progress, "wrap", 1);
  const logicalMaterialCount =
    resources.materials +
    5 +
    Number(frame.progress >= 0.08) +
    (frame.stage.id === "scores" ? 2 : 0) +
    (frame.knife.visible ? 3 : 0);

  return (
    <section
      className="cut-and-fold-preview"
      data-construction-status="READY"
      data-construction-pattern={plan.patternId}
      data-construction-progress={frame.progress.toFixed(3)}
      data-construction-stage={frame.stage.id}
      data-construction-stage-progress={frame.stage.progress.toFixed(3)}
      data-construction-checkpoint-index={frame.stage.checkpointIndex}
      data-construction-checkpoint-count={frame.stage.checkpointCount}
      data-construction-camera-mode={cameraState.mode}
      data-construction-camera-occupancy={cameraState.occupancy.toFixed(3)}
      data-construction-camera-azimuth={cameraState.azimuth.toFixed(5)}
      data-construction-camera-polar={cameraState.polar.toFixed(5)}
      data-construction-camera-transition={cameraState.transition.toFixed(3)}
      data-construction-camera-fit-valid={String(cameraState.valid)}
      data-construction-camera-distance={cameraState.distance.toFixed(3)}
      data-construction-camera-bounds={`${cameraState.boundsWidth.toFixed(3)},${cameraState.boundsHeight.toFixed(3)},${cameraState.boundsDepth.toFixed(3)}`}
      data-construction-camera-reset-generation={resetGeneration}
      data-construction-score-progress={frame.score.progress.toFixed(3)}
      data-construction-score-active={frame.score.activeId ?? "none"}
      data-construction-score-completed-count={frame.score.completedIds.length}
      data-construction-cut-progress={frame.trace.progress.toFixed(3)}
      data-construction-cut-active={frame.trace.activeId ?? "none"}
      data-construction-trace-completed-count={frame.trace.completedIds.length}
      data-construction-operation-kind={operation?.kind ?? "none"}
      data-construction-operation-id={operation?.id ?? "none"}
      data-construction-operation-index={operation?.index ?? -1}
      data-construction-operation-count={operation?.count ?? choreography.cutOperations.length}
      data-construction-operation-progress={(operation?.progress ?? 0).toFixed(3)}
      data-construction-knife-visible={String(frame.knife.visible)}
      data-construction-knife-position={pointTelemetry(frame.knife.position)}
      data-construction-lift-visible={String(activeLift)}
      data-construction-lift-count={frame.lifts.length}
      data-construction-kerf-count={frame.kerf.length}
      data-construction-completed-cut-count={frame.completedCutIds.length}
      data-construction-scrap-count={frame.scraps.length}
      data-construction-scrap-ready-count={readyScraps}
      data-construction-scrap-removing-count={removingScraps}
      data-construction-scrap-removed-count={removedScraps}
      data-construction-tape-ready={String(frame.tape.ready)}
      data-construction-tape-visible={String(frame.tape.visible)}
      data-construction-tape-progress={frame.tape.progress.toFixed(3)}
      data-construction-pose-diagnostic-count={diagnosticCount}
      data-construction-max-hinge-gap-mm={frame.fold.diagnostics.maxHingeGapMm.toFixed(6)}
      data-construction-max-edge-stretch-mm={frame.fold.diagnostics.maxEdgeStretchMm.toFixed(6)}
      data-construction-canvas-count="1"
      data-construction-frameloop="demand"
      data-construction-draw-calls={rendererMetrics.drawCalls}
      data-construction-triangles={rendererMetrics.triangles || resources.triangles}
      data-construction-geometries={rendererMetrics.geometries || resources.faceGeometries + resources.scrapGeometries}
      data-construction-materials={logicalMaterialCount}
      data-construction-textures={rendererMetrics.textures}
      data-construction-geometry-cache={resources.cacheSize}
      data-construction-live-references={resources.liveReferences}
      data-construction-face-count={plan.foldNet.faces.length}
      data-construction-score-count={plan.foldNet.scores.length}
      data-construction-cut-count={plan.foldNet.cuts.length}
      data-construction-fold-count={plan.foldNet.creases.length}
    >
      <div className="cut-and-fold-preview-heading">
        <div>
          <span>Cut-and-fold walkthrough</span>
          <strong>{frame.stage.label}</strong>
        </div>
        <output aria-live="polite">
          {Math.round(frame.progress * 100)}%
        </output>
      </div>

      <div
        className="cut-and-fold-canvas"
        role="img"
        aria-label={`Interactive flat-cardboard construction preview: ${frame.stage.label}`}
      >
        <Canvas
          flat
          linear
          legacy
          frameloop="demand"
          dpr={[1, 1.5]}
          gl={{alpha: true, antialias: true}}
          camera={{
            fov: 45,
            position: [0, 10, 100],
            near: 0.1,
            far: 1000,
            up: [0, 0, 1],
          }}
        >
          <ConstructionCameraLights />
          <CutAndFoldScene
            plan={plan}
            choreography={choreography}
            frame={frame}
            subjectRef={subjectRef}
            setResources={setResources}
          />
          <ConstructionCameraRig
            subjectRef={subjectRef}
            progress={frame.progress}
            contentKey={contentKey}
            resetGeneration={resetGeneration}
            setCameraState={setCameraState}
          />
          <RendererMetricsProbe setMetrics={setRendererMetrics} />
        </Canvas>
        {!resources.ready ? (
          <div className="cut-and-fold-canvas-status" role="status">
            Preparing the cardboard pieces...
          </div>
        ) : null}
      </div>

      <div className="cut-and-fold-controls">
        <label htmlFor="cut-and-fold-progress">
          <span>Construction checkpoint</span>
          <input
            id="cut-and-fold-progress"
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(frame.progress * 100)}
            aria-valuetext={`${frame.stage.label}, ${Math.round(frame.progress * 100)} percent`}
            onChange={(event) =>
              setProgress(Number(event.currentTarget.value) / 100)
            }
          />
        </label>
        <div className="cut-and-fold-button-row">
          <button
            type="button"
            disabled={frame.progress <= 0}
            onClick={() => setProgress(previousProgress)}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={frame.progress >= 1}
            onClick={() => setProgress(nextProgress)}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setResetGeneration((generation) => generation + 1)}
          >
            Reset view
          </button>
        </div>
      </div>

      {diagnosticCount > 0 ? (
        <p className="cut-and-fold-diagnostic" role="status">
          Prototype check: this pose reports {diagnosticCount} geometry warning
          {diagnosticCount === 1 ? "" : "s"}. Verify the physical cardboard before cutting.
        </p>
      ) : null}
    </section>
  );
}
