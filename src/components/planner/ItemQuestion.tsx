"use client";

import QuantityField from "@/components/QuantityField";
import {QuestionHeader} from "./QuestionHeader";
import {usePlannerStore} from "@/planner/store";

const SHAPES = [
  ["RECTANGULAR_BOX", "Box", "Square or rectangular sides"],
  ["CYLINDER_TUBE", "Tube", "Round like a bottle or poster tube"],
  ["ROUNDED_FORM", "Rounded", "Ball-shaped or softly rounded"],
  ["L_U_MEASURED", "Irregular", "L- or U-shaped measured outline"],
] as const;

export function ItemQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const setDimension = usePlannerStore((state) => state.setItemDimension);
  const setWeight = usePlannerStore((state) => state.setItemWeight);
  const setShape = usePlannerStore((state) => state.setItemShape);
  const {dimensions, shapeProfile, weightKg} = draft.item;

  return (
    <>
      <QuestionHeader eyebrow="Step 1 · Item" title="What are you packing?" description="Measure the item itself before adding bubble wrap, foam, or empty space." />
      <fieldset className="question-group">
        <legend>Which shape is closest?</legend>
        <div className="choice-grid choice-grid-four">
          {SHAPES.map(([kind, label, help]) => (
            <button key={kind} type="button" className={`choice-card ${shapeProfile.kind === kind ? "is-selected" : ""}`} aria-pressed={shapeProfile.kind === kind} onClick={() => setShape(kind)}>
              <strong>{label}</strong><span>{help}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="question-group">
        <legend>Item measurements</legend>
        <p className="question-help">Use the longest side for length. The controls move in ¼-inch checkpoints.</p>
        <div className="planner-field-grid">
          <QuantityField label="Length" valueMm={dimensions.lengthMm} unit={draft.unit} minMm={0.01} onCommit={(value) => setDimension("lengthMm", value)} />
          <QuantityField label="Width" valueMm={dimensions.widthMm} unit={draft.unit} minMm={0.01} onCommit={(value) => setDimension("widthMm", value)} />
          <QuantityField label="Height" valueMm={dimensions.heightMm} unit={draft.unit} minMm={0.01} onCommit={(value) => setDimension("heightMm", value)} />
          <QuantityField kind="weight" label="Weight" valueKg={weightKg} unit={draft.unit} onCommit={setWeight} />
        </div>
      </fieldset>
    </>
  );
}
