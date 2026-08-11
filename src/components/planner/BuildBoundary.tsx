"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {useMemo} from "react";
import {measurementFromSource, resolveBoxMeasurement} from "@/domain/boxInventory";
import {assessFit, protectedEnvelopeBreakdown} from "@/domain/fit";
import {COMMON_BOXES, PROTECTION_GOAL_MM} from "@/domain/geometry";
import {
  formatDimensions,
  formatLengthDisplay,
  formatPair,
} from "@/domain/measurements";
import {derivePlannerBuildPlan} from "@/planner/buildPlan";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

const TutorialCardboardPreview = dynamic(
  () => import("@/components/tutorial-cardboard/TutorialCardboardPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="tutorial-cardboard-loading" role="status">
        Loading RSC fold preview...
      </div>
    ),
  },
);

const CutAndFoldPreview = dynamic(
  () => import("@/components/cut-and-fold/CutAndFoldPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="cut-and-fold-loading" role="status">
        Loading cut-and-fold preview...
      </div>
    ),
  },
);

const SOURCE_LABEL = {
  EXISTING_BOX: "Current box",
  COMMON_BOX: "A standard box",
  FLAT_SHEET: "Flattened cardboard",
} as const;

export function BuildBoundary() {
  const draft = usePlannerStore((state) => state.draft);
  const savedBoxes = usePlannerStore((state) => state.savedBoxes);
  const routedBuildPlan = useMemo(() => derivePlannerBuildPlan(draft), [draft]);
  const selectedCommon = COMMON_BOXES.find(
    (box) => box.id === draft.source.selectedCommonBoxId,
  );
  const selectedSaved = savedBoxes.find(
    (box) => box.id === draft.source.selectedSavedBoxId,
  );
  const existingResolution = resolveBoxMeasurement(
    measurementFromSource(draft.source),
  );
  const available =
    draft.source.mode === "EXISTING_BOX"
      ? existingResolution.status === "RESOLVED"
        ? existingResolution.internalDimensions
        : undefined
      : draft.source.mode === "COMMON_BOX"
        ? selectedCommon?.internalDimensions
        : undefined;
  const assessment = available ? assessFit(draft.item, available) : undefined;
  const protectedEnvelope = protectedEnvelopeBreakdown(
    draft.item,
    assessment?.orientationId,
  );
  const required =
    routedBuildPlan.kind === "CUT_AND_FOLD"
      ? routedBuildPlan.plan.requiredInternal
      : protectedEnvelope.dimensions;
  const sourceDetail =
    draft.source.mode === "COMMON_BOX"
      ? selectedCommon?.name ?? SOURCE_LABEL.COMMON_BOX
      : draft.source.mode === "EXISTING_BOX"
        ? selectedSaved?.name ?? SOURCE_LABEL.EXISTING_BOX
        : SOURCE_LABEL.FLAT_SHEET;
  const sourceBlockedMessage =
    draft.source.mode === "EXISTING_BOX" &&
    existingResolution.status !== "RESOLVED"
      ? existingResolution.message
      : draft.source.mode === "COMMON_BOX" && !selectedCommon
        ? "Choose a standard box with known inside measurements."
        : undefined;
  const sourceWarning =
    draft.source.mode === "EXISTING_BOX" &&
    existingResolution.status === "RESOLVED"
      ? existingResolution.warning
      : draft.source.mode === "COMMON_BOX"
        ? selectedCommon?.note
        : undefined;
  const flatSheetError =
    routedBuildPlan.kind === "ERROR" ? routedBuildPlan.message : undefined;
  const flatSheetTooSmall =
    routedBuildPlan.kind === "CUT_AND_FOLD" &&
    !routedBuildPlan.fitsSheet.fits;

  return (
    <>
      <QuestionHeader
        eyebrow="Step 5 · Review"
        title={
          sourceBlockedMessage ? "Finish your box details" : "Ready to build your plan"
        }
        description="Your answers are saved. This is the handoff from questions to the visual build instructions."
      />
      <div className="build-summary">
        <div>
          <span>Minimum inside size</span>
          <strong>
            {formatDimensions(
              [required.lengthMm, required.widthMm, required.heightMm],
              draft.unit,
            )}
          </strong>
        </div>
        <div>
          <span>Starting material</span>
          <strong>{sourceDetail}</strong>
        </div>
        <div>
          <span>Protection</span>
          <strong>
            Goal {draft.protectionGoal} ·{" "}
            {formatLengthDisplay(
              PROTECTION_GOAL_MM[draft.protectionGoal],
              draft.unit,
            )}{" "}
            per face; clearance separate
          </strong>
        </div>
      </div>

      {sourceBlockedMessage ? (
        <div className="fit-message is-warning">
          <strong>Fit is not confirmed</strong>
          <p>{sourceBlockedMessage}</p>
          <Link className="build-edit-link" href="/plan/source">
            Complete box measurement
          </Link>
        </div>
      ) : assessment && !assessment.fits ? (
        <div className="fit-message is-warning">
          <strong>The selected box remains too small</strong>
          <p>
            It is short by{" "}
            {formatDimensions(
              [
                assessment.deficitsMm.lengthMm,
                assessment.deficitsMm.widthMm,
                assessment.deficitsMm.heightMm,
              ],
              draft.unit,
            )}{" "}
            across the allowed orientation. Choose a different box before
            building.
          </p>
          {sourceWarning ? <p>{sourceWarning}</p> : null}
          <Link className="build-edit-link" href="/plan/source">
            Choose another box
          </Link>
        </div>
      ) : flatSheetError ? (
        <div className="fit-message is-warning">
          <strong>The cut layout could not be generated</strong>
          <p>{flatSheetError}</p>
          <Link className="build-edit-link" href="/plan/source">
            Review the sheet and pattern
          </Link>
        </div>
      ) : flatSheetTooSmall && routedBuildPlan.kind === "CUT_AND_FOLD" ? (
        <div className="fit-message is-warning">
          <strong>The entered cardboard is too small for this layout</strong>
          <p>
            Your{" "}
            {formatPair(
              [
                routedBuildPlan.enteredStock.lengthMm,
                routedBuildPlan.enteredStock.widthMm,
              ],
              draft.unit,
            )}{" "}
            sheet is short by{" "}
            {formatPair(
              [
                routedBuildPlan.fitsSheet.shortfall.lengthMm,
                routedBuildPlan.fitsSheet.shortfall.widthMm,
              ],
              draft.unit,
            )}{" "}
            in the best orientation.
          </p>
          <p>
            Use at least{" "}
            {formatPair(
              [
                routedBuildPlan.autoFitSheet.lengthMm,
                routedBuildPlan.autoFitSheet.widthMm,
              ],
              draft.unit,
            )}
            . The saved sheet was not changed automatically.
          </p>
          <Link className="build-edit-link" href="/plan/source">
            Update sheet size
          </Link>
        </div>
      ) : (
        <div className="build-boundary-callout">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>
              {routedBuildPlan.kind === "CUT_AND_FOLD"
                ? "The sheet and cut layout fit"
                : "Measurements captured"}
            </strong>
            <p>
              {routedBuildPlan.kind === "CUT_AND_FOLD"
                ? "Follow the generated score, cut, scrap, fold, and tape checkpoints below."
                : "The geometry and animation workspace connects here, without putting the questions and 3D controls on the same crowded page."}
            </p>
            {sourceWarning ? <p>{sourceWarning}</p> : null}
          </div>
        </div>
      )}

      {!sourceBlockedMessage &&
      assessment?.fits &&
      available &&
      routedBuildPlan.kind === "ASSEMBLY" ? (
        <TutorialCardboardPreview dimensions={available} />
      ) : null}
      {routedBuildPlan.kind === "CUT_AND_FOLD" &&
      routedBuildPlan.fitsSheet.fits ? (
        <CutAndFoldPreview plan={routedBuildPlan.plan} />
      ) : null}
      <Link className="build-edit-link" href="/plan/item">
        Review my answers
      </Link>
    </>
  );
}
