"use client";

import Link from "next/link";
import {assessFit, protectedEnvelopeBreakdown} from "@/domain/fit";
import {COMMON_BOXES, PROTECTION_GOAL_MM} from "@/domain/geometry";
import {formatDimensions, formatLengthDisplay} from "@/domain/measurements";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

const SOURCE_LABEL = {EXISTING_BOX: "Your existing box", COMMON_BOX: "A standard box", FLAT_SHEET: "Flattened cardboard"} as const;

export function BuildBoundary() {
  const draft = usePlannerStore((state) => state.draft);
  const selectedCommon = COMMON_BOXES.find((box) => box.id === draft.source.selectedCommonBoxId);
  const available = draft.source.mode === "EXISTING_BOX" ? draft.source.existingBox : draft.source.mode === "COMMON_BOX" ? selectedCommon?.internalDimensions : undefined;
  const assessment = available ? assessFit(draft.item, available) : undefined;
  const protectedEnvelope = protectedEnvelopeBreakdown(draft.item, assessment?.orientationId);
  const required = protectedEnvelope.dimensions;
  const sourceDetail = draft.source.mode === "COMMON_BOX" ? selectedCommon?.name : SOURCE_LABEL[draft.source.mode];

  return (
    <>
      <QuestionHeader eyebrow="Step 5 · Review" title="Ready to build your plan" description="Your answers are saved. This is the handoff from questions to the visual build instructions." />
      <div className="build-summary">
        <div><span>Minimum inside size</span><strong>{formatDimensions([required.lengthMm, required.widthMm, required.heightMm], draft.unit)}</strong></div>
        <div><span>Starting material</span><strong>{sourceDetail}</strong></div>
        <div><span>Protection</span><strong>Goal {draft.protectionGoal} · {formatLengthDisplay(PROTECTION_GOAL_MM[draft.protectionGoal], draft.unit)} per face; clearance separate</strong></div>
      </div>
      <div className="build-boundary-callout">
        <span aria-hidden="true">✓</span>
        <div><strong>Measurements captured</strong><p>The geometry and animation workspace connects here, without putting the questions and 3D controls on the same crowded page.</p></div>
      </div>
      <Link className="build-edit-link" href="/plan/item">Review my answers</Link>
    </>
  );
}
