"use client";
/* eslint-disable no-unused-vars */

import {useEffect, useRef, useState} from "react";
import {
  ceilToLengthCheckpointMm,
  DisplayUnit,
  formatLengthInput,
  formatWeightInput,
  fromDisplayWeight,
  nextLengthCheckpoint,
  nextWeightCheckpoint,
  parseDraft,
  parseWeightDraft,
  toDisplayWeight,
  weightStep,
  weightSuffix,
} from "@/domain/measurements";

type LengthFieldProps = {
  kind?: "length";
  label: string;
  valueMm: number;
  unit: DisplayUnit;
  minMm?: number;
  onCommit: (valueMm: number) => void;
  onInvalid?: (label: string) => void;
};

type WeightFieldProps = {
  kind: "weight";
  label: string;
  valueKg: number;
  unit: DisplayUnit;
  onCommit: (valueKg: number) => void;
  onInvalid?: (label: string) => void;
};

export type QuantityFieldProps = LengthFieldProps | WeightFieldProps;

function LengthField({label, valueMm, unit, minMm = 0, onCommit, onInvalid}: LengthFieldProps) {
  const [draft, setDraft] = useState(() => formatLengthInput(valueMm, unit));
  const [dirty, setDirty] = useState(false);
  const previousUnit = useRef(unit);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previousUnit.current !== unit) {
      const oldUnit = previousUnit.current;
      const parsed = dirty ? parseDraft(draft, oldUnit) : valueMm;
      const normalized = dirty && parsed !== undefined ? ceilToLengthCheckpointMm(parsed, oldUnit) : parsed;
      if (dirty && normalized !== undefined && normalized >= minMm) onCommit(normalized);
      setDraft(formatLengthInput(normalized ?? valueMm, unit));
      setDirty(false);
      previousUnit.current = unit;
    } else if (!dirty) {
      setDraft(formatLengthInput(valueMm, unit));
    }
  }, [draft, dirty, minMm, onCommit, unit, valueMm]);

  const commit = (candidate = draft) => {
    const parsed = parseDraft(candidate, unit);
    if (parsed === undefined || parsed < minMm) {
      onInvalid?.(label);
      return false;
    }
    const normalized = ceilToLengthCheckpointMm(parsed, unit);
    onCommit(normalized);
    setDraft(formatLengthInput(normalized, unit));
    setDirty(false);
    return true;
  };

  const step = (direction: -1 | 1) => {
    const parsed = parseDraft(draft, unit) ?? valueMm;
    const next = nextLengthCheckpoint(parsed, unit, direction);
    if (next < minMm) return;
    onCommit(next);
    setDraft(formatLengthInput(next, unit));
    setDirty(false);
    inputRef.current?.focus();
  };

  return <label className="field"><span>{label}</span><span className="input-shell"><button type="button" className="quantity-step" aria-label={`Decrease ${label}`} onClick={() => step(-1)}>−</button><input ref={inputRef} aria-label={`${label} ${unit}`} aria-invalid={false} type="number" min={minMm === 0 ? 0 : undefined} step={unit === "in" ? 0.25 : 1} inputMode="decimal" value={draft} onChange={(event) => { setDraft(event.target.value); setDirty(true); }} onBlur={() => commit()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } if (event.key === "Escape") { setDraft(formatLengthInput(valueMm, unit)); setDirty(false); } if (event.key === "ArrowUp") { event.preventDefault(); step(1); } if (event.key === "ArrowDown") { event.preventDefault(); step(-1); } }} onWheel={(event) => { if (document.activeElement !== event.currentTarget) return; event.preventDefault(); step(event.deltaY < 0 ? 1 : -1); }} /><em>{unit}</em><button type="button" className="quantity-step" aria-label={`Increase ${label}`} onClick={() => step(1)}>+</button></span></label>;
}

function WeightField({label, valueKg, unit, onCommit, onInvalid}: WeightFieldProps) {
  const [draft, setDraft] = useState(() => formatWeightInput(valueKg, unit));
  const [dirty, setDirty] = useState(false);
  const previousUnit = useRef(unit);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previousUnit.current !== unit) {
      const oldUnit = previousUnit.current;
      const parsed = dirty ? parseWeightDraft(draft, oldUnit) : valueKg;
      if (parsed !== undefined) onCommit(parsed);
      setDraft(formatWeightInput(parsed ?? valueKg, unit));
      setDirty(false);
      previousUnit.current = unit;
    } else if (!dirty) {
      setDraft(formatWeightInput(valueKg, unit));
    }
  }, [draft, dirty, onCommit, unit, valueKg]);

  const commit = (candidate = draft) => {
    const parsed = parseWeightDraft(candidate, unit);
    if (parsed === undefined || parsed <= 0) {
      onInvalid?.(label);
      return false;
    }
    onCommit(parsed);
    setDraft(formatWeightInput(parsed, unit));
    setDirty(false);
    return true;
  };

  const step = (direction: -1 | 1) => {
    const parsed = parseWeightDraft(draft, unit) ?? valueKg;
    const nextDisplay = nextWeightCheckpoint(toDisplayWeight(parsed, unit), unit, direction);
    const next = fromDisplayWeight(nextDisplay, unit);
    if (next <= 0) return;
    onCommit(next);
    setDraft(formatWeightInput(next, unit));
    setDirty(false);
    inputRef.current?.focus();
  };

  return <label className="field"><span>{label}</span><span className="input-shell"><button type="button" className="quantity-step" aria-label={`Decrease ${label}`} onClick={() => step(-1)}>−</button><input ref={inputRef} aria-label={`${label} ${weightSuffix(unit)}`} type="number" min="0" step={weightStep(unit)} inputMode="decimal" value={draft} onChange={(event) => { setDraft(event.target.value); setDirty(true); }} onBlur={() => commit()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } if (event.key === "Escape") { setDraft(formatWeightInput(valueKg, unit)); setDirty(false); } if (event.key === "ArrowUp") { event.preventDefault(); step(1); } if (event.key === "ArrowDown") { event.preventDefault(); step(-1); } }} onWheel={(event) => { if (document.activeElement !== event.currentTarget) return; event.preventDefault(); step(event.deltaY < 0 ? 1 : -1); }} /><em>{weightSuffix(unit)}</em><button type="button" className="quantity-step" aria-label={`Increase ${label}`} onClick={() => step(1)}>+</button></span></label>;
}

export default function QuantityField(props: QuantityFieldProps) {
  return props.kind === "weight" ? <WeightField {...props} /> : <LengthField {...props} />;
}
