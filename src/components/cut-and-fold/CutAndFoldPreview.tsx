"use client";

import {Canvas, useFrame} from "@react-three/fiber";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import * as THREE from "three";
import {
  createConstructionChoreography,
  constructionFrameAt,
} from "@/domain/constructionChoreography";
import {
  actionForProgress,
  createConstructionInstructions,
  nextAction,
  previousAction,
  progressForAction,
  type ConstructionInstructionAction,
  type ConstructionEnteredStock,
  type ConstructionInstructionMeasurement,
} from "@/domain/constructionInstructions";
import type {WrapPlan} from "@/domain/geometry";
import {
  formatLengthDisplay,
  formatLengthInput,
  type DisplayUnit,
} from "@/domain/measurements";
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

type PlaybackMode = "STEP" | "AUTOPLAY";

type PlaybackRun = {
  readonly mode: PlaybackMode;
  readonly startProgress: number;
  readonly targetProgress: number;
  readonly startedAtMs: number;
};

const INITIAL_RENDERER_METRICS: RendererMetrics = {
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};

const FULL_PLAYBACK_DURATION_MS = 9000;

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

function subscribeToReducedMotion(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );
}

function easeInOutCubic(value: number) {
  const progress = Math.max(0, Math.min(1, value));
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

function actionProgress(action: ConstructionInstructionAction, progress: number) {
  const span = action.endProgress - action.startProgress;
  if (span <= 0) return progress >= action.endProgress ? 1 : 0;
  return Math.max(0, Math.min(1, (progress - action.startProgress) / span));
}

function formatDimensionsForUnit(dimensions: {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}, unit: DisplayUnit) {
  return `${formatLengthInput(dimensions.lengthMm, unit)} x ${formatLengthInput(dimensions.widthMm, unit)} x ${formatLengthInput(dimensions.heightMm, unit)} ${unit}`;
}

function formatMeasurement(
  measurement: ConstructionInstructionMeasurement,
  unit: DisplayUnit,
) {
  if (measurement.kind === "LENGTH")
    return formatLengthDisplay(measurement.valueMm, unit);
  if (measurement.kind === "SHEET")
    return `${formatLengthInput(measurement.lengthMm, unit)} x ${formatLengthInput(measurement.widthMm, unit)} ${unit}`;
  return formatDimensionsForUnit(measurement.dimensionsMm, unit);
}

function InstructionCard({
  action,
  titleId,
  stepCount,
  unit,
}: {
  action: ConstructionInstructionAction;
  titleId: string;
  stepCount: number;
  unit: DisplayUnit;
}) {
  return (
    <article
      className="cut-and-fold-instruction-card"
      data-construction-action-card={action.id}
    >
      <span className="cut-and-fold-step-number">
        Step {action.sequence + 1} of {stepCount}
      </span>
      <h3 id={titleId}>{action.title}</h3>
      <p className="cut-and-fold-action-copy">{action.instruction}</p>

      {action.counts.length || action.measurements.length ? (
        <dl className="cut-and-fold-facts">
          {action.counts.map((count) => (
            <div key={count.id}>
              <dt>{count.label}</dt>
              <dd>{count.value}</dd>
            </div>
          ))}
          {action.measurements.map((measurement) => (
            <div key={measurement.id}>
              <dt>{measurement.label}</dt>
              <dd>{formatMeasurement(measurement, unit)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="cut-and-fold-tools">
        <strong>Use</strong>
        <span>{action.tools.join(", ")}</span>
      </div>
      <p className="cut-and-fold-safety">
        <strong>Safety check:</strong> {action.safety}
      </p>
      <p className="cut-and-fold-result">
        <strong>What you should see:</strong> {action.expectedResult}
      </p>
    </article>
  );
}

export interface CutAndFoldPreviewProps {
  readonly plan: WrapPlan;
  readonly enteredStock: ConstructionEnteredStock;
  readonly unit: DisplayUnit;
}

export default function CutAndFoldPreview({
  plan,
  enteredStock,
  unit,
}: CutAndFoldPreviewProps) {
  const choreography = useMemo(
    () => createConstructionChoreography(plan.foldNet),
    [plan],
  );
  const instructions = useMemo(
    () => createConstructionInstructions(plan, enteredStock),
    [enteredStock, plan],
  );
  const [progress, setProgress] = useState(0);
  const [playback, setPlayback] = useState<PlaybackRun | null>(null);
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
  const cardTitleId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!playback) return;
    const distance = playback.targetProgress - playback.startProgress;
    const durationMs = Math.max(320, distance * FULL_PLAYBACK_DURATION_MS);
    let animationFrame = 0;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - playback.startedAtMs);
      const runProgress = Math.min(1, elapsed / durationMs);
      setProgress(
        playback.startProgress + distance * easeInOutCubic(runProgress),
      );
      if (runProgress >= 1) {
        setPlayback(null);
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [playback]);

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

  if (instructions.status === "INVALID") {
    return (
      <section
        className="cut-and-fold-preview is-blocked"
        data-construction-status="INVALID_INSTRUCTIONS"
        data-construction-canvas-count="0"
      >
        <strong>The build instructions could not be prepared.</strong>
        <p>{instructions.errors.join(" ")}</p>
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
  const activeAction = actionForProgress(instructions, frame.progress)!;
  const priorAction = previousAction(instructions, activeAction.id);
  const followingAction = nextAction(instructions, activeAction.id);
  const complete = frame.progress >= 1;
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
  const logicalMaterialCount =
    resources.materials +
    5 +
    Number(frame.progress >= 0.08) +
    (frame.stage.id === "scores" ? 2 : 0) +
    (frame.knife.visible ? 3 : 0);

  const pauseAt = (nextProgress: number) => {
    setPlayback(null);
    setProgress(nextProgress);
  };
  const startPlayback = (
    mode: PlaybackMode,
    startProgress: number,
    targetProgress: number,
  ) => {
    const start = Math.max(0, Math.min(1, startProgress));
    const target = Math.max(start, Math.min(1, targetProgress));
    if (prefersReducedMotion || target <= start) {
      setPlayback(null);
      setProgress(target);
      return;
    }
    setPlayback({
      mode,
      startProgress: start,
      targetProgress: target,
      startedAtMs: performance.now(),
    });
  };
  const resetView = () => {
    setPlayback(null);
    setResetGeneration((generation) => generation + 1);
  };
  const replay = () => {
    setPlayback(null);
    setProgress(0);
    if (!prefersReducedMotion)
      setPlayback({
        mode: "AUTOPLAY",
        startProgress: 0,
        targetProgress: 1,
        startedAtMs: performance.now(),
      });
  };

  return (
    <section
      className="cut-and-fold-preview"
      data-construction-status="READY"
      data-construction-instructions="READY"
      data-construction-pattern={plan.patternId}
      data-construction-progress={frame.progress.toFixed(3)}
      data-construction-stage={frame.stage.id}
      data-construction-stage-progress={frame.stage.progress.toFixed(3)}
      data-construction-checkpoint-index={frame.stage.checkpointIndex}
      data-construction-checkpoint-count={frame.stage.checkpointCount}
      data-construction-action={activeAction.id}
      data-construction-action-index={activeAction.sequence}
      data-construction-action-count={instructions.actions.length}
      data-construction-action-progress={actionProgress(activeAction, frame.progress).toFixed(3)}
      data-construction-playback={playback?.mode ?? "PAUSED"}
      data-construction-reduced-motion={String(prefersReducedMotion)}
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
          <strong>{activeAction.title}</strong>
        </div>
        <output aria-label="Animation progress">
          {Math.round(frame.progress * 100)}%
        </output>
      </div>

      <div className="cut-and-fold-workspace">
        <div className="cut-and-fold-instruction-pane">
          <nav className="cut-and-fold-action-rail" aria-label="Build actions">
            <ol>
              {instructions.actions.map((action) => {
                const active = action.id === activeAction.id;
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      data-construction-action-id={action.id}
                      onClick={() =>
                        pauseAt(
                          progressForAction(instructions, action.id) ??
                            action.startProgress,
                        )
                      }
                    >
                      <span>{action.sequence + 1}</span>
                      {action.title}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <InstructionCard
            action={activeAction}
            titleId={cardTitleId}
            stepCount={instructions.actions.length}
            unit={unit}
          />

          <div className="cut-and-fold-action-controls">
            <div className="cut-and-fold-action-nav">
              <button
                type="button"
                disabled={!priorAction}
                onClick={() =>
                  priorAction
                    ? pauseAt(
                        progressForAction(instructions, priorAction.id) ??
                          priorAction.startProgress,
                      )
                    : undefined
                }
              >
                Previous action
              </button>
              <button
                type="button"
                disabled={!followingAction}
                onClick={() =>
                  followingAction
                    ? pauseAt(
                        progressForAction(instructions, followingAction.id) ??
                          followingAction.startProgress,
                      )
                    : undefined
                }
              >
                Next action
              </button>
            </div>

            <div className="cut-and-fold-playback-row">
              {playback ? (
                <button type="button" onClick={() => setPlayback(null)}>
                  Pause animation
                </button>
              ) : complete ? (
                <button type="button" onClick={replay}>
                  Replay from start
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      startPlayback(
                        "STEP",
                        frame.progress,
                        activeAction.endProgress,
                      )
                    }
                  >
                    Play this step
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startPlayback("AUTOPLAY", frame.progress, 1)
                    }
                  >
                    Autoplay build
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="cut-and-fold-visual-pane">
          <div
            className="cut-and-fold-canvas"
            role="img"
            aria-labelledby={cardTitleId}
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
              <span>Fine animation position</span>
              <input
                id="cut-and-fold-progress"
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(frame.progress * 100)}
                aria-valuetext={`${activeAction.title}; ${frame.stage.label}; ${Math.round(frame.progress * 100)} percent`}
                onChange={(event) =>
                  pauseAt(Number(event.currentTarget.value) / 100)
                }
              />
            </label>
            <div className="cut-and-fold-button-row">
              <button type="button" onClick={resetView}>
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
        </div>
      </div>

      <p className="cut-and-fold-live" aria-live="polite" aria-atomic="true">
        Step {activeAction.sequence + 1}: {activeAction.title}
      </p>
    </section>
  );
}
