"use client";

import {useState} from "react";
import QuantityField from "@/components/QuantityField";
import {formatLengthDisplay} from "@/domain/measurements";
import {PROTECTION_GOAL_MM, type Fragility, type ProtectionGoal} from "@/domain/geometry";
import {usePlannerStore} from "@/planner/store";
import {QuestionHeader} from "./QuestionHeader";

const GOAL_COPY: Record<ProtectionGoal, string> = {
  1: "Light protection",
  2: "Everyday shipping",
  3: "Fragile item",
  4: "Very fragile",
  5: "Maximum padding",
};
const FRAGILITY: {value: Fragility; label: string}[] = [
  {value: "LOW", label: "Sturdy"},
  {value: "MODERATE", label: "Typical"},
  {value: "HIGH", label: "Fragile"},
  {value: "VERY_HIGH", label: "Very fragile"},
];

export function ProtectionQuestion() {
  const draft = usePlannerStore((state) => state.draft);
  const setGoal = usePlannerStore((state) => state.setProtectionGoal);
  const setFragility = usePlannerStore((state) => state.setFragility);
  const setClearance = usePlannerStore((state) => state.setClearance);
  const [advanced, setAdvanced] = useState(false);
  const clearance = draft.item.tolerance.lengthTotalMm;

  return (
    <>
      <QuestionHeader eyebrow="Step 2 · Protection" title="How protected should it be?" description="Pick a simple goal. We translate it into the same padding on every side." />
      <fieldset className="question-group">
        <legend>Protection goal</legend>
        <div className="goal-scale">
          {[1, 2, 3, 4, 5].map((goal) => (
            <button key={goal} type="button" aria-pressed={draft.protectionGoal === goal} className={draft.protectionGoal === goal ? "is-selected" : ""} onClick={() => setGoal(goal as ProtectionGoal)}>
              <strong>{goal}</strong><span>{GOAL_COPY[goal as ProtectionGoal]}</span>
            </button>
          ))}
        </div>
        <p className="selection-explainer"><strong>Goal {draft.protectionGoal}</strong> adds {formatLengthDisplay(PROTECTION_GOAL_MM[draft.protectionGoal], draft.unit)} of padding on every side.</p>
      </fieldset>
      <fieldset className="question-group">
        <legend>How easily can it break?</legend>
        <div className="choice-grid">
          {FRAGILITY.map(({value, label}) => <button key={value} type="button" className={`choice-card compact ${draft.item.fragility === value ? "is-selected" : ""}`} aria-pressed={draft.item.fragility === value} onClick={() => setFragility(value)}><strong>{label}</strong></button>)}
        </div>
      </fieldset>
      <div className="advanced-clearance">
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>Extra fit clearance (optional) <span>{advanced ? "−" : "+"}</span></button>
        {advanced ? <div><p>Adds empty room beyond cushioning so the item is not squeezed. It is not protective padding.</p><QuantityField label="Total extra clearance" valueMm={clearance} unit={draft.unit} onCommit={setClearance} /></div> : null}
      </div>
    </>
  );
}
