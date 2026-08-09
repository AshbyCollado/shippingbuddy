"use client";

import QuantityField from "@/components/QuantityField";
import {ITEM_PROFILES, ITEM_PROFILE_DEFINITIONS} from "@/domain/itemProfiles";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

export function ItemQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const setDimension = usePlannerStore((state) => state.setItemDimension);
  const setWeight = usePlannerStore((state) => state.setItemWeight);
  const setShape = usePlannerStore((state) => state.setItemShape);
  const {dimensions, shapeProfile, weightKg} = draft.item;
  const profile = ITEM_PROFILE_DEFINITIONS[shapeProfile.kind];

  return (
    <>
      <QuestionHeader eyebrow="Step 1 · Item" title="What are you packing?" description="Measure the item itself before adding bubble wrap, foam, or empty space." />
      <fieldset className="question-group">
        <legend>Which shape is closest?</legend>
        <div className="choice-grid choice-grid-four">
          {ITEM_PROFILES.map((choice) => (
            <button key={choice.kind} type="button" className={`choice-card ${shapeProfile.kind === choice.kind ? "is-selected" : ""}`} aria-pressed={shapeProfile.kind === choice.kind} onClick={() => setShape(choice.kind)}>
              <strong>{choice.label}</strong><span>{choice.choiceHelp}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="question-group">
        <legend>Item measurements</legend>
        <p className="question-help">{profile.measurementHelp} Entries round upward to the next {draft.unit === "in" ? "¼ inch" : "whole millimetre"} checkpoint.</p>
        <div className="planner-field-grid">
          {profile.fields.map((field) => (
            <div key={field.axis}>
              <QuantityField label={field.label} valueMm={dimensions[field.axis]} unit={draft.unit} minMm={0.01} onCommit={(value) => setDimension(field.axis, value)} />
              <small className="question-help">{field.help}</small>
            </div>
          ))}
          <QuantityField kind="weight" label="Weight" valueKg={weightKg} unit={draft.unit} onCommit={setWeight} />
        </div>
        {profile.warning ? <div className="fit-message is-warning"><strong>Overall envelope only</strong><p>{profile.warning}</p></div> : null}
      </fieldset>
    </>
  );
}
