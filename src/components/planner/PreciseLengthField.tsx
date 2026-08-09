"use client";
/* eslint-disable no-unused-vars */

import {useState} from "react";
import {parseDraft, toDisplayLength, type DisplayUnit} from "@/domain/measurements";

type Props = {
  label: string;
  valueMm?: number;
  unit: DisplayUnit;
  allowZero?: boolean;
  onCommit: (valueMm: number | undefined) => void;
};

function formatPrecise(valueMm: number | undefined, unit: DisplayUnit) {
  if (valueMm === undefined) return "";
  const decimals = unit === "in" ? 3 : 1;
  return toDisplayLength(valueMm, unit).toFixed(decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function PreciseLengthField({label, valueMm, unit, allowZero = false, onCommit}: Props) {
  const [error, setError] = useState("");

  const commit = (draft: string) => {
    if (!draft.trim()) {
      onCommit(undefined);
      setError("");
      return;
    }
    const parsed = parseDraft(draft, unit);
    if (parsed === undefined || (allowZero ? parsed < 0 : parsed <= 0)) {
      onCommit(undefined);
      setError(allowZero ? "Enter zero or a positive measurement." : "Enter a positive measurement.");
      return;
    }
    onCommit(parsed);
    setError("");
  };

  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-shell precise-input-shell">
        <input key={`${unit}-${valueMm ?? "blank"}`} aria-label={`${label} ${unit}`} aria-invalid={Boolean(error)} type="number" min={allowZero ? 0 : unit === "in" ? 0.001 : 0.1} step={unit === "in" ? 0.001 : 0.1} inputMode="decimal" defaultValue={formatPrecise(valueMm, unit)} onBlur={(event) => commit(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
        <em>{unit}</em>
      </span>
      {error ? <small className="field-error" role="alert">{error}</small> : null}
    </label>
  );
}
