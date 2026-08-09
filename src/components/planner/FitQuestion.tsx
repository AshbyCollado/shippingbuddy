"use client";

import {assessFit, protectedEnvelopeBreakdown, protectedEnvelopeCopy} from "@/domain/fit";
import {COMMON_BOXES} from "@/domain/geometry";
import {formatDimensions, formatLengthDisplay, formatPair} from "@/domain/measurements";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

export function FitQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const setAllowRotation = usePlannerStore((state) => state.setAllowRotation);
  const setKeepUpright = usePlannerStore((state) => state.setKeepUpright);
  const selectedCommon = COMMON_BOXES.find((box) => box.id === draft.source.selectedCommonBoxId);
  const available = draft.source.mode === "EXISTING_BOX" ? draft.source.existingBox : draft.source.mode === "COMMON_BOX" ? selectedCommon?.internalDimensions : undefined;
  const assessment = available ? assessFit(draft.item, available) : undefined;
  const breakdown = protectedEnvelopeBreakdown(draft.item, assessment?.orientationId);
  const explanation = protectedEnvelopeCopy(breakdown, draft.unit);
  const required = breakdown.dimensions;

  return (
    <>
      <QuestionHeader eyebrow="Step 4 · Fit" title="Check the space around your item" description="The minimum inside size includes the item, padding at every face, and separate fit clearance." />
      <div className="fit-hero">
        <span>Minimum inside size</span>
        <strong>{formatDimensions([required.lengthMm, required.widthMm, required.heightMm], draft.unit)}</strong>
        <small>Goal {draft.protectionGoal} padding is applied per face; clearance is separate.</small>
      </div>

      <div className="fit-message is-neutral">
        <strong>How each minimum is calculated</strong>
        <p>{explanation.legend}.</p>
        <div className="build-summary">
          {explanation.axes.map((axis) => <div key={axis.axis}><span>{axis.label}</span><strong>{axis.formula}</strong></div>)}
        </div>
      </div>

      {draft.source.mode === "FLAT_SHEET" ? (
        <div className="fit-message is-neutral"><strong>Flattened cardboard selected</strong><p>You entered {formatPair([draft.source.sheet.lengthMm, draft.source.sheet.widthMm], draft.unit)}. The build step calculates the cut layout and automatically expands an undersized sheet.</p></div>
      ) : assessment ? (
        <div className={`fit-message ${assessment.fits ? "is-good" : "is-warning"}`}>
          <strong>{assessment.fits ? "The protected item fits." : "This box is too small."}</strong>
          <p>Best allowed orientation: {assessment.orientationId}. It needs {formatDimensions([assessment.requiredDimensions.lengthMm, assessment.requiredDimensions.widthMm, assessment.requiredDimensions.heightMm], draft.unit)} inside.</p>
          <p>{assessment.fits
            ? `Extra room — length ${formatLengthDisplay(assessment.extraRoomMm.lengthMm, draft.unit)}, width ${formatLengthDisplay(assessment.extraRoomMm.widthMm, draft.unit)}, height ${formatLengthDisplay(assessment.extraRoomMm.heightMm, draft.unit)}.`
            : `Short by — length ${formatLengthDisplay(assessment.deficitsMm.lengthMm, draft.unit)}, width ${formatLengthDisplay(assessment.deficitsMm.widthMm, draft.unit)}, height ${formatLengthDisplay(assessment.deficitsMm.heightMm, draft.unit)}. Your box choice stays selected.`}</p>
        </div>
      ) : (
        <div className="fit-message is-warning"><strong>Box measurements unavailable</strong><p>Go back and choose a standard box with known inside measurements.</p></div>
      )}

      <fieldset className="question-group">
        <legend>Can the item turn inside the box?</legend>
        <div className="toggle-list">
          <label><span><strong>Allow rotation</strong><small>Try the item lengthwise or sideways to find a fit.</small></span><input type="checkbox" checked={draft.item.allowRotation} onChange={(event) => setAllowRotation(event.target.checked)} /></label>
          <label><span><strong>Keep upright</strong><small>Never place the item on its side.</small></span><input type="checkbox" checked={draft.item.keepUpright} onChange={(event) => setKeepUpright(event.target.checked)} /></label>
        </div>
      </fieldset>
    </>
  );
}
