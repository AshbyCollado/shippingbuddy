"use client";

import {useState} from "react";
import QuantityField from "@/components/QuantityField";
import {COMMON_BOXES} from "@/domain/geometry";
import {formatDimensions} from "@/domain/measurements";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

const SOURCES = [
  {mode: "EXISTING_BOX", title: "A box I have", help: "Measure the empty space inside your box."},
  {mode: "COMMON_BOX", title: "A standard box", help: "Choose a representative ready-made size."},
] as const;

export function SourceQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const setMode = usePlannerStore((state) => state.setSourceMode);
  const setExisting = usePlannerStore((state) => state.setExistingBoxDimension);
  const setSheet = usePlannerStore((state) => state.setSheetDimension);
  const setCommonBox = usePlannerStore((state) => state.setCommonBox);
  const {source, unit} = draft;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedVisible = advancedOpen || source.mode === "FLAT_SHEET";

  return (
    <>
      <QuestionHeader eyebrow="Step 3 · Box" title="What are you starting with?" description="Most people begin with a box they already own. You can also resize flattened cardboard." />
      <div className="source-mode-grid">
        {SOURCES.map(({mode, title, help}) => (
          <button key={mode} type="button" className={source.mode === mode ? "is-selected" : ""} aria-pressed={source.mode === mode} onClick={() => setMode(mode)}>
            <span aria-hidden="true">{mode === "EXISTING_BOX" ? "▣" : mode === "COMMON_BOX" ? "□" : "◇"}</span>
            <strong>{title}</strong><small>{help}</small>
          </button>
        ))}
      </div>

      <div className="source-advanced">
        <button type="button" aria-expanded={advancedVisible} onClick={() => setAdvancedOpen((open) => source.mode === "FLAT_SHEET" ? true : !open)}>
          <span><strong>Advanced: flattened cardboard</strong><small>Cut and refold a larger box or blank sheet.</small></span>
          <b aria-hidden="true">{advancedVisible ? "−" : "+"}</b>
        </button>
        {advancedVisible ? (
          <div className="source-advanced-content">
            <button type="button" className={`flat-source-choice ${source.mode === "FLAT_SHEET" ? "is-selected" : ""}`} aria-pressed={source.mode === "FLAT_SHEET"} onClick={() => setMode("FLAT_SHEET")}>
              <strong>{source.mode === "FLAT_SHEET" ? "Using flattened cardboard" : "Use flattened cardboard"}</strong>
              <span>Choose this only when you can safely open seams, cut, score, and refold the material.</span>
            </button>
          </div>
        ) : null}
      </div>

      {source.mode === "EXISTING_BOX" ? (
        <fieldset className="question-group source-details">
          <legend>Inside measurements</legend>
          <p className="question-help">Open the box and measure the usable space inside—not the outside walls.</p>
          <div className="planner-field-grid planner-field-grid-three">
            <QuantityField label="Inside length" valueMm={source.existingBox.lengthMm} unit={unit} minMm={0.01} onCommit={(value) => setExisting("lengthMm", value)} />
            <QuantityField label="Inside width" valueMm={source.existingBox.widthMm} unit={unit} minMm={0.01} onCommit={(value) => setExisting("widthMm", value)} />
            <QuantityField label="Inside height" valueMm={source.existingBox.heightMm} unit={unit} minMm={0.01} onCommit={(value) => setExisting("heightMm", value)} />
          </div>
        </fieldset>
      ) : null}

      {source.mode === "COMMON_BOX" ? (
        <fieldset className="question-group source-details">
          <legend>Choose a box</legend>
          <p className="question-help">These are representative inside sizes. Measure the real box before cutting or shipping.</p>
          <div className="common-box-grid">
            {COMMON_BOXES.map((box) => (
              <button key={box.id} type="button" className={source.selectedCommonBoxId === box.id ? "is-selected" : ""} aria-pressed={source.selectedCommonBoxId === box.id} onClick={() => setCommonBox(box.id)}>
                <strong>{box.name}</strong><span>{formatDimensions([box.internalDimensions.lengthMm, box.internalDimensions.widthMm, box.internalDimensions.heightMm], unit)} inside</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {source.mode === "FLAT_SHEET" ? (
        <fieldset className="question-group source-details">
          <legend>Flattened cardboard size</legend>
          <p className="question-help">Measure the usable flat area after opening the seams and removing damaged edges. The builder will only grow a too-small size; it will not discard extra material.</p>
          <div className="planner-field-grid">
            <QuantityField label="Usable length" valueMm={source.sheet.lengthMm} unit={unit} minMm={0.01} onCommit={(value) => setSheet("lengthMm", value)} />
            <QuantityField label="Usable width" valueMm={source.sheet.widthMm} unit={unit} minMm={0.01} onCommit={(value) => setSheet("widthMm", value)} />
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
