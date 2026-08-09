"use client";

import {COMMON_BOXES} from "@/domain/geometry";
import {formatDimensions, formatPair} from "@/domain/measurements";
import {protectedDimensions} from "@/planner/draft";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

function fits(required: [number, number, number], available: [number, number, number], allowRotation: boolean, keepUpright: boolean) {
  const orientations: [number, number, number][] = [[required[0], required[1], required[2]]];
  if (allowRotation) {
    orientations.push([required[1], required[0], required[2]]);
    if (!keepUpright) orientations.push(
      [required[0], required[2], required[1]],
      [required[2], required[0], required[1]],
      [required[1], required[2], required[0]],
      [required[2], required[1], required[0]],
    );
  }
  return orientations.some((orientation) => orientation.every((value, index) => value <= available[index]));
}

export function FitQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const setAllowRotation = usePlannerStore((state) => state.setAllowRotation);
  const setKeepUpright = usePlannerStore((state) => state.setKeepUpright);
  const required = protectedDimensions(draft);
  const requiredTuple: [number, number, number] = [required.lengthMm, required.widthMm, required.heightMm];
  const selectedCommon = COMMON_BOXES.find((box) => box.id === draft.source.selectedCommonBoxId);
  const available = draft.source.mode === "EXISTING_BOX" ? draft.source.existingBox : selectedCommon?.internalDimensions;
  const fit = available ? fits(
    requiredTuple,
    [available.lengthMm, available.widthMm, available.heightMm],
    draft.item.allowRotation,
    draft.item.keepUpright,
  ) : true;

  return (
    <>
      <QuestionHeader eyebrow="Step 4 · Fit" title="Check the space around your item" description="This is the item plus padding and optional empty clearance. Generated cutting geometry comes after review." />
      <div className="fit-hero">
        <span>Protected size needed</span>
        <strong>{formatDimensions(requiredTuple, draft.unit)}</strong>
        <small>Includes Goal {draft.protectionGoal} padding on every side</small>
      </div>

      {draft.source.mode === "FLAT_SHEET" ? (
        <div className="fit-message is-neutral"><strong>Flattened cardboard selected</strong><p>You entered {formatPair([draft.source.sheet.lengthMm, draft.source.sheet.widthMm], draft.unit)}. The build step calculates the cut layout and automatically expands an undersized sheet.</p></div>
      ) : (
        <div className={`fit-message ${fit ? "is-good" : "is-warning"}`}>
          <strong>{fit ? "The protected item fits." : "This box is too small."}</strong>
          <p>{fit ? "We will keep this choice for the build." : "Your choice stays selected. Go back to choose a larger box or reduce the protection goal."}</p>
        </div>
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
