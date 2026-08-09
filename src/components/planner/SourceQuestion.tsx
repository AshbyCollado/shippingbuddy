"use client";
/* eslint-disable no-unused-vars */

import {useState} from "react";
import QuantityField from "@/components/QuantityField";
import {PreciseLengthField} from "./PreciseLengthField";
import {measurementFromSource, resolveBoxMeasurement, type BoxMeasurementBasis, type SavedBox} from "@/domain/boxInventory";
import {assessFit} from "@/domain/fit";
import {COMMON_BOXES} from "@/domain/geometry";
import {rankMethods} from "@/domain/methodRanking";
import {formatDimensions, formatLengthDisplay} from "@/domain/measurements";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

const SOURCES = [
  {mode: "EXISTING_BOX", title: "A box I have", help: "Measure a box you own and save it for later."},
  {mode: "COMMON_BOX", title: "A standard box", help: "Choose a representative ready-made size."},
] as const;

const BASIS_OPTIONS: {basis: BoxMeasurementBasis; label: string; help: string}[] = [
  {basis: "INSIDE", label: "Inside", help: "Measured the empty space inside"},
  {basis: "OUTSIDE", label: "Outside", help: "Measured the outside walls"},
  {basis: "NOT_SURE", label: "Not sure", help: "Keep the numbers, then measure again"},
];

function SavedBoxCard({box, unit, selected, onSelect, onRename, onRemove}: {
  box: SavedBox;
  unit: "in" | "mm";
  selected: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => boolean;
  onRemove: (id: string) => void;
}) {
  const resolution = resolveBoxMeasurement(box);
  return (
    <article className={`saved-box-card ${selected ? "is-selected" : ""}`}>
      <input aria-label={`Name for saved box ${box.name}`} defaultValue={box.name} onBlur={(event) => {
        const nextName = event.currentTarget.value.trim();
        if (!onRename(box.id, nextName)) event.currentTarget.value = box.name;
        else event.currentTarget.value = nextName;
      }} />
      <p>{formatDimensions([box.rawDimensions.lengthMm, box.rawDimensions.widthMm, box.rawDimensions.heightMm], unit)} · {box.basis.toLowerCase().replace("_", " ")}</p>
      <small>{resolution.status === "RESOLVED" ? `Inside: ${formatDimensions([resolution.internalDimensions.lengthMm, resolution.internalDimensions.widthMm, resolution.internalDimensions.heightMm], unit)}` : resolution.message}</small>
      <div><button type="button" onClick={() => onSelect(box.id)}>{selected ? "Selected" : "Use this box"}</button><button type="button" onClick={() => { if (window.confirm(`Remove ${box.name} from saved boxes?`)) onRemove(box.id); }}>Remove</button></div>
    </article>
  );
}

export function SourceQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const savedBoxes = usePlannerStore((state) => state.savedBoxes);
  const setMode = usePlannerStore((state) => state.setSourceMode);
  const setExisting = usePlannerStore((state) => state.setExistingBoxDimension);
  const setBasis = usePlannerStore((state) => state.setExistingMeasurementBasis);
  const setBoardThickness = usePlannerStore((state) => state.setBoardThickness);
  const setUncertainty = usePlannerStore((state) => state.setMeasurementUncertainty);
  const setSheet = usePlannerStore((state) => state.setSheetDimension);
  const setCommonBox = usePlannerStore((state) => state.setCommonBox);
  const saveCurrentBox = usePlannerStore((state) => state.saveCurrentBox);
  const renameSavedBox = usePlannerStore((state) => state.renameSavedBox);
  const selectSavedBox = usePlannerStore((state) => state.selectSavedBox);
  const removeSavedBox = usePlannerStore((state) => state.removeSavedBox);
  const {source, unit} = draft;
  const basis = source.measurementBasis ?? "INSIDE";
  const resolution = resolveBoxMeasurement(measurementFromSource(source));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [boxName, setBoxName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const advancedVisible = advancedOpen || source.mode === "FLAT_SHEET";
  const commonOptions = rankMethods(COMMON_BOXES.map((box) => {
    const assessment = assessFit(draft.item, box.internalDimensions);
    return {
      id: box.id,
      feasibility: assessment.fits ? "FEASIBLE" as const : "INFEASIBLE" as const,
      confidence: 1,
      totalDeficitMm: assessment.deficitsMm.lengthMm + assessment.deficitsMm.widthMm + assessment.deficitsMm.heightMm,
      box,
      assessment,
    };
  }));

  const saveBox = () => {
    const result = saveCurrentBox(boxName);
    setSaveMessage(result.ok ? "Box saved to this device." : result.message);
    if (result.ok) setBoxName("");
  };

  return (
    <>
      <QuestionHeader eyebrow="Step 3 · Box" title="What are you starting with?" description="Most people begin with a box they already own. You can save measured boxes and reuse them later." />
      <div className="source-mode-grid">
        {SOURCES.map(({mode, title, help}) => (
          <button key={mode} type="button" className={source.mode === mode ? "is-selected" : ""} aria-pressed={source.mode === mode} onClick={() => setMode(mode)}>
            <span aria-hidden="true">{mode === "EXISTING_BOX" ? "▣" : "□"}</span>
            <strong>{title}</strong><small>{help}</small>
          </button>
        ))}
      </div>

      <div className="source-advanced">
        <button type="button" aria-expanded={advancedVisible} onClick={() => setAdvancedOpen((open) => source.mode === "FLAT_SHEET" ? true : !open)}>
          <span><strong>Advanced: flattened cardboard</strong><small>Cut and refold a larger box or blank sheet.</small></span>
          <b aria-hidden="true">{advancedVisible ? "−" : "+"}</b>
        </button>
        {advancedVisible ? <div className="source-advanced-content"><button type="button" className={`flat-source-choice ${source.mode === "FLAT_SHEET" ? "is-selected" : ""}`} aria-pressed={source.mode === "FLAT_SHEET"} onClick={() => setMode("FLAT_SHEET")}><strong>{source.mode === "FLAT_SHEET" ? "Using flattened cardboard" : "Use flattened cardboard"}</strong><span>Choose this only when you can safely open seams, cut, score, and refold the material.</span></button></div> : null}
      </div>

      {source.mode === "EXISTING_BOX" ? (
        <>
          <fieldset className="question-group source-details">
            <legend>How did you measure this box?</legend>
            <div className="choice-grid box-basis-grid">
              {BASIS_OPTIONS.map((option) => <button key={option.basis} type="button" className={`choice-card ${basis === option.basis ? "is-selected" : ""}`} aria-pressed={basis === option.basis} onClick={() => setBasis(option.basis)}><strong>{option.label}</strong><span>{option.help}</span></button>)}
            </div>
          </fieldset>
          <fieldset className="question-group source-details">
            <legend>{basis === "INSIDE" ? "Inside measurements" : basis === "OUTSIDE" ? "Outside measurements" : "Measurements to keep"}</legend>
            <p className="question-help">{basis === "INSIDE" ? "Measure the usable empty space inside the box." : basis === "OUTSIDE" ? "Measure the outside walls. We need the real board thickness before calculating inside space." : "Keep these numbers for now. Fit stays unconfirmed until you identify how they were measured."}</p>
            <div className="planner-field-grid planner-field-grid-three">
              <QuantityField label={`${basis === "INSIDE" ? "Inside" : basis === "OUTSIDE" ? "Outside" : "Measured"} length`} valueMm={source.existingBox.lengthMm} unit={unit} minMm={0.01} onCommit={(value) => setExisting("lengthMm", value)} />
              <QuantityField label={`${basis === "INSIDE" ? "Inside" : basis === "OUTSIDE" ? "Outside" : "Measured"} width`} valueMm={source.existingBox.widthMm} unit={unit} minMm={0.01} onCommit={(value) => setExisting("widthMm", value)} />
              <QuantityField label={`${basis === "INSIDE" ? "Inside" : basis === "OUTSIDE" ? "Outside" : "Measured"} height`} valueMm={source.existingBox.heightMm} unit={unit} minMm={0.01} onCommit={(value) => setExisting("heightMm", value)} />
            </div>
            {basis === "OUTSIDE" ? <><div className="planner-field-grid material-fields"><PreciseLengthField label="Board thickness (one wall)" valueMm={source.boardThicknessMm} unit={unit} onCommit={setBoardThickness} /><PreciseLengthField label="Measurement uncertainty (each wall)" valueMm={source.measurementUncertaintyMm} unit={unit} allowZero onCommit={setUncertainty} /></div><p className="question-help">These precision fields do not use quarter-inch checkpoints. We subtract two walls. Uncertainty is added conservatively to each wall before subtraction; leave it blank only if no extra allowance is needed.</p></> : null}
            <div className={`fit-message ${resolution.status === "RESOLVED" ? "is-good" : "is-warning"}`}>
              <strong>{resolution.status === "RESOLVED" ? "Usable inside size" : resolution.status === "MEASUREMENT_REQUIRED" ? "One more measurement needed" : "Check these measurements"}</strong>
              <p>{resolution.status === "RESOLVED" ? formatDimensions([resolution.internalDimensions.lengthMm, resolution.internalDimensions.widthMm, resolution.internalDimensions.heightMm], unit) : resolution.message}</p>
              {resolution.status === "RESOLVED" && resolution.warning ? <p>{resolution.warning}</p> : null}
            </div>
          </fieldset>

          <section className="saved-box-section" aria-labelledby="saved-box-heading">
            <h2 id="saved-box-heading">Save and reuse boxes</h2>
            <p className="question-help">Saving copies these raw measurements. Later edits change only the current plan, never the saved box.</p>
            <div className="save-box-row"><label className="field"><span>Box name</span><span className="input-shell"><input value={boxName} placeholder="Garage cube" onChange={(event) => setBoxName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveBox(); } }} /></span></label><button type="button" onClick={saveBox}>Save as new box</button></div>
            {saveMessage ? <p className="planner-file-message" role="status">{saveMessage}</p> : null}
            {savedBoxes.length ? <div className="saved-box-grid">{savedBoxes.map((box) => <SavedBoxCard key={box.id} box={box} unit={unit} selected={source.selectedSavedBoxId === box.id} onSelect={selectSavedBox} onRename={renameSavedBox} onRemove={removeSavedBox} />)}</div> : <p className="question-help">No saved boxes yet.</p>}
          </section>
        </>
      ) : null}

      {source.mode === "COMMON_BOX" ? (
        <fieldset className="question-group source-details">
          <legend>Choose a representative box</legend>
          <p className="question-help">Fitting choices appear first. Every card remains selectable, and your choice never changes automatically. Always verify the real box&apos;s inside measurements.</p>
          <div className="common-box-grid">
            {commonOptions.map(({box, assessment}) => (
              <button key={box.id} type="button" className={source.selectedCommonBoxId === box.id ? "is-selected" : ""} aria-pressed={source.selectedCommonBoxId === box.id} onClick={() => setCommonBox(box.id)}>
                <span className="catalog-card-header"><strong>{box.name}</strong><b className={`catalog-fit ${assessment.fits ? "fits" : "too-small"}`}>{assessment.fits ? "Fits" : "Too small"}</b></span>
                <span>{formatDimensions([box.internalDimensions.lengthMm, box.internalDimensions.widthMm, box.internalDimensions.heightMm], unit)} inside</span>
                <small>{assessment.fits ? `Extra room starts at ${formatLengthDisplay(Math.min(assessment.extraRoomMm.lengthMm, assessment.extraRoomMm.widthMm, assessment.extraRoomMm.heightMm), unit)}.` : `Total shortfall ${formatLengthDisplay(assessment.deficitsMm.lengthMm + assessment.deficitsMm.widthMm + assessment.deficitsMm.heightMm, unit)}.`}</small>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {source.mode === "FLAT_SHEET" ? (
        <fieldset className="question-group source-details">
          <legend>Flattened cardboard size</legend>
          <p className="question-help">Measure the usable flat area after opening the seams and removing damaged edges. The builder will only grow a too-small size; it will not discard extra material.</p>
          <div className="planner-field-grid"><QuantityField label="Usable length" valueMm={source.sheet.lengthMm} unit={unit} minMm={0.01} onCommit={(value) => setSheet("lengthMm", value)} /><QuantityField label="Usable width" valueMm={source.sheet.widthMm} unit={unit} minMm={0.01} onCommit={(value) => setSheet("widthMm", value)} /></div>
        </fieldset>
      ) : null}
    </>
  );
}
