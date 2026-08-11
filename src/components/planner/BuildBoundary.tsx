"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {measurementFromSource, resolveBoxMeasurement} from "@/domain/boxInventory";
import {assessFit, protectedEnvelopeBreakdown} from "@/domain/fit";
import {COMMON_BOXES, PROTECTION_GOAL_MM} from "@/domain/geometry";
import {formatDimensions, formatLengthDisplay} from "@/domain/measurements";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

const TutorialCardboardPreview = dynamic(() => import("@/components/tutorial-cardboard/TutorialCardboardPreview"), {
  ssr: false,
  loading: () => <div className="tutorial-cardboard-loading" role="status">Loading RSC fold preview...</div>,
});

const SOURCE_LABEL = {EXISTING_BOX: "Current box", COMMON_BOX: "A standard box", FLAT_SHEET: "Flattened cardboard"} as const;

export function BuildBoundary() {
  const draft = usePlannerStore((state) => state.draft);
  const savedBoxes = usePlannerStore((state) => state.savedBoxes);
  const selectedCommon = COMMON_BOXES.find((box) => box.id === draft.source.selectedCommonBoxId);
  const selectedSaved = savedBoxes.find((box) => box.id === draft.source.selectedSavedBoxId);
  const existingResolution = resolveBoxMeasurement(measurementFromSource(draft.source));
  const available = draft.source.mode === "EXISTING_BOX"
    ? existingResolution.status === "RESOLVED" ? existingResolution.internalDimensions : undefined
    : draft.source.mode === "COMMON_BOX" ? selectedCommon?.internalDimensions : undefined;
  const assessment = available ? assessFit(draft.item, available) : undefined;
  const protectedEnvelope = protectedEnvelopeBreakdown(draft.item, assessment?.orientationId);
  const required = protectedEnvelope.dimensions;
  const sourceDetail = draft.source.mode === "COMMON_BOX" ? selectedCommon?.name ?? SOURCE_LABEL.COMMON_BOX : draft.source.mode === "EXISTING_BOX" ? selectedSaved?.name ?? SOURCE_LABEL.EXISTING_BOX : SOURCE_LABEL.FLAT_SHEET;
  const sourceBlockedMessage = draft.source.mode === "EXISTING_BOX" && existingResolution.status !== "RESOLVED"
    ? existingResolution.message
    : draft.source.mode === "COMMON_BOX" && !selectedCommon ? "Choose a standard box with known inside measurements." : undefined;
  const sourceWarning = draft.source.mode === "EXISTING_BOX" && existingResolution.status === "RESOLVED"
    ? existingResolution.warning
    : draft.source.mode === "COMMON_BOX" ? selectedCommon?.note : undefined;

  return (
    <>
      <QuestionHeader eyebrow="Step 5 · Review" title={sourceBlockedMessage ? "Finish your box details" : "Ready to build your plan"} description="Your answers are saved. This is the handoff from questions to the visual build instructions." />
      <div className="build-summary">
        <div><span>Minimum inside size</span><strong>{formatDimensions([required.lengthMm, required.widthMm, required.heightMm], draft.unit)}</strong></div>
        <div><span>Starting material</span><strong>{sourceDetail}</strong></div>
        <div><span>Protection</span><strong>Goal {draft.protectionGoal} · {formatLengthDisplay(PROTECTION_GOAL_MM[draft.protectionGoal], draft.unit)} per face; clearance separate</strong></div>
      </div>
      {sourceBlockedMessage ? (
        <div className="fit-message is-warning"><strong>Fit is not confirmed</strong><p>{sourceBlockedMessage}</p><Link className="build-edit-link" href="/plan/source">Complete box measurement</Link></div>
      ) : assessment && !assessment.fits ? (
        <div className="fit-message is-warning"><strong>The selected box remains too small</strong><p>It is short by {formatDimensions([assessment.deficitsMm.lengthMm, assessment.deficitsMm.widthMm, assessment.deficitsMm.heightMm], draft.unit)} across the allowed orientation. Choose a different box before building.</p>{sourceWarning ? <p>{sourceWarning}</p> : null}<Link className="build-edit-link" href="/plan/source">Choose another box</Link></div>
      ) : (
        <div className="build-boundary-callout"><span aria-hidden="true">✓</span><div><strong>Measurements captured</strong><p>The geometry and animation workspace connects here, without putting the questions and 3D controls on the same crowded page.</p>{sourceWarning ? <p>{sourceWarning}</p> : null}</div></div>
      )}
      {!sourceBlockedMessage && assessment?.fits && available && draft.source.mode !== "FLAT_SHEET" ? <TutorialCardboardPreview dimensions={available} /> : null}
      <Link className="build-edit-link" href="/plan/item">Review my answers</Link>
    </>
  );
}
