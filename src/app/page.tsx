"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import dynamic from "next/dynamic";
import {
  COMMON_BOXES,
  chooseWrapOrientation,
  enumerateOrientations,
  fitsDimensions,
  fitsSheet,
  generateCommonBoxPlan,
  generatePatternPlan,
  packedEnvelope,
  PROTECTION_GOAL_MM,
  PROTOTYPE_PROFILE,
  renderWrapSvg,
  type CommonBoxEntry,
  type ItemInput,
  type ItemShapeKind,
  type ProtectionGoal,
  type RscPlan,
  type WrapPlan,
  type WrapPatternId,
} from "@/domain/geometry";
import {autoFitSheet} from "@/domain/geometry";
import {getAnimationFrame, nextAnimationCheckpoint, type AnimationRecipe} from "@/domain/animation";
import {formatDimensions, formatLengthDisplay, formatPair, inchesToMm, poundsToKg, type DisplayUnit} from "@/domain/measurements";
import QuantityField from "@/components/QuantityField";

type View = "overview" | "dieline" | "instructions";
type SourceMode = "flat" | "common" | "existing";
type DisplayPlan = WrapPlan | RscPlan;

const PackagingScene = dynamic(() => import("@/components/PackagingScene"), {ssr: false});

const DEFAULT_PROJECT: ItemInput = {
  dimensions: {lengthMm: inchesToMm(14), widthMm: inchesToMm(13), heightMm: inchesToMm(12)},
  weightKg: poundsToKg(7),
  fragility: "MODERATE",
  cushioning: {leftMm: inchesToMm(1), rightMm: inchesToMm(1), frontMm: inchesToMm(1), backMm: inchesToMm(1), bottomMm: inchesToMm(1), topMm: inchesToMm(1)},
  // Preserve the legacy six-millimetre default; the input still follows the selected surface unit.
  tolerance: {lengthTotalMm: 6, widthTotalMm: 6, heightTotalMm: 6},
  allowRotation: true,
  keepUpright: false,
};

const DEFAULT_SHEET = {lengthMm: inchesToMm(48), widthMm: inchesToMm(64)};
const DEFAULT_EXISTING_BOX = {lengthMm: inchesToMm(18), widthMm: inchesToMm(17), heightMm: inchesToMm(16)};

function Icon({name}: {name: "box" | "ruler" | "spark" | "arrow" | "check" | "cube" | "download"}) {
  const paths: Record<string, string> = {
    box: "M3 7 12 3l9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10",
    ruler: "M4 19 19 4l2 2L6 21H4v-2Zm4-8 3 3m0-7 3 3m-7 7 3 3",
    spark: "m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm7 13 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z",
    arrow: "M5 12h13m-5-5 5 5-5 5",
    check: "m5 12 4 4L19 6",
    cube: "m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 0v10m9-5-9 5m-9-5 9 5",
    download: "M12 3v12m0 0 4-4m-4 4-4-4M5 20h14",
  };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function Stepper({active}: {active: number}) {
  const steps = ["Item", "Protection", "Source", "Review"];
  return <nav className="stepper" aria-label="Project steps">{steps.map((step, index) => <div className={`step ${index <= active ? "is-active" : ""}`} key={step} aria-current={index === active ? "step" : undefined}><span className="step-number">{index < active ? <Icon name="check" /> : index + 1}</span><span>{step}</span>{index < steps.length - 1 && <i />}</div>)}</nav>;
}

function Metric({label, value, accent = false}: {label: string; value: string; accent?: boolean}) {
  return <div className={`metric ${accent ? "metric-accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SourceChoice({title, copy, icon, selected, onClick}: {title: string; copy: string; icon: "ruler" | "cube" | "box"; selected: boolean; onClick: () => void}) {
  return <button type="button" className={`source-choice ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick}><span className="source-choice-icon"><Icon name={icon} /></span><span><strong>{title}</strong><small>{copy}</small></span></button>;
}

// eslint-disable-next-line no-unused-vars
function CommonBoxPicker({boxes, selectedId, item, unit, onSelect}: {boxes: CommonBoxEntry[]; selectedId: string; item: ItemInput; unit: DisplayUnit; onSelect: (boxId: string) => void}) {
  return <div className="common-box-picker" role="radiogroup" aria-label="Representative RSC catalog">{boxes.map((box) => {
    const orientations = enumerateOrientations(item);
    const directFits = fitsDimensions(packedEnvelope(item, orientations[0]).dimensions, box.internalDimensions);
    const fits = orientations.some((candidate) => fitsDimensions(packedEnvelope(item, candidate).dimensions, box.internalDimensions));
    const fitLabel = fits ? (directFits ? "Fits unchanged" : "Fits if rotated") : "Too small";
    return <button type="button" role="radio" key={box.id} className={`catalog-card ${box.id === selectedId ? "selected" : ""}`} aria-checked={box.id === selectedId} onClick={() => onSelect(box.id)}><span className="catalog-card-header"><strong>{box.name}</strong><span className={`catalog-fit ${fits ? "fits" : "too-small"}`}>{fitLabel}</span></span><span>Inside {formatDimensions([box.internalDimensions.lengthMm, box.internalDimensions.widthMm, box.internalDimensions.heightMm], unit)}</span><small>{box.note}</small></button>;
  })}</div>;
}

function commonBoxFitsItem(item: ItemInput, box: CommonBoxEntry) {
  return enumerateOrientations(item).some((candidate) => fitsDimensions(packedEnvelope(item, candidate).dimensions, box.internalDimensions));
}

function commonBoxVolume(box: CommonBoxEntry) {
  return box.internalDimensions.lengthMm * box.internalDimensions.widthMm * box.internalDimensions.heightMm;
}

function Dieline({plan}: {plan: WrapPlan}) {
  const minX = Math.min(...plan.foldNet.vertices.map((item) => item.xMm));
  const minY = Math.min(...plan.foldNet.vertices.map((item) => item.yMm));
  const maxX = Math.max(...plan.foldNet.vertices.map((item) => item.xMm));
  const maxY = Math.max(...plan.foldNet.vertices.map((item) => item.yMm));
  const pad = 26;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;
  return <div className="dieline-wrap"><svg className="dieline" role="img" aria-label="Calculated wrap box cutting layout" viewBox={`0 0 ${width} ${height}`}><g transform={`translate(${-minX + pad} ${-minY + pad})`}>
    {plan.foldNet.faces.map((face) => <polygon key={face.id} points={face.vertexIds.map((id) => plan.foldNet.vertices.find((vertex) => vertex.id === id)).filter(Boolean).map((point) => `${point!.xMm},${point!.yMm}`).join(" ")} className={`dieline-${face.role.toLowerCase()}`} />)}
    {plan.scores.map((item) => <line key={item.id} x1={item.from.xMm} y1={item.from.yMm} x2={item.to.xMm} y2={item.to.yMm} className="dieline-score" />)}
    {plan.cuts.map((item) => <line key={item.id} x1={item.from.xMm} y1={item.from.yMm} x2={item.to.xMm} y2={item.to.yMm} className="dieline-cut" />)}
    <text x={minX + 18} y={minY + 42} className="dieline-label">FOLDNET</text>
  </g></svg><div className="dieline-legend"><span><i className="legend-cut" /> Cut</span><span><i className="legend-score" /> Score</span><span><i className="legend-panel" /> Panel</span></div></div>;
}

function RscReference() {
  return <div className="rsc-reference"><svg viewBox="0 0 640 270" role="img" aria-label="RSC assembly reference diagram"><rect x="132" y="58" width="376" height="156" rx="5" className="rsc-wall" /><rect x="132" y="25" width="376" height="33" className="rsc-flap" /><rect x="132" y="214" width="376" height="33" className="rsc-flap" /><rect x="99" y="58" width="33" height="156" className="rsc-flap" /><rect x="508" y="58" width="33" height="156" className="rsc-flap" /><line x1="132" y1="58" x2="508" y2="58" className="rsc-score" /><line x1="132" y1="214" x2="508" y2="214" className="rsc-score" /><path d="M320 112v45m-18-18 18 18 18-18" className="rsc-arrow" /><text x="320" y="104" textAnchor="middle" className="rsc-label">four walls · eight flaps · sealed joint</text></svg><div className="rsc-reference-copy"><span className="fit-badge fit"><i /> FACTORY REFERENCE</span><p>Unchanged RSCs are shown for assembly context. This is not a print-and-cut manufacturing blank.</p></div></div>;
}

function BoxScene({progress, plan, unit}: {progress: number; plan: DisplayPlan; unit: DisplayUnit}) {
  return <PackagingScene plan={plan} progress={progress} unit={unit} />;
}

export default function Home() {
  const [item, setItem] = useState<ItemInput>(DEFAULT_PROJECT);
  const [unit, setUnit] = useState<DisplayUnit>("in");
  const [source, setSource] = useState<SourceMode>("flat");
  const [pattern, setPattern] = useState<WrapPatternId>("WRAP_BOX_V1");
  const [sheet, setSheet] = useState(DEFAULT_SHEET);
  const [existingBox, setExistingBox] = useState(DEFAULT_EXISTING_BOX);
  const [selectedCommonBoxId, setSelectedCommonBoxId] = useState(COMMON_BOXES[1].id);
  const [protectionGoal, setProtectionGoal] = useState<ProtectionGoal>(2);
  const [sheetNotice, setSheetNotice] = useState<{lengthMm: number; widthMm: number} | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const progressRef = useRef(progress);

  const orientation = useMemo(() => chooseWrapOrientation(item, sheet, pattern), [item, pattern, sheet]);
  const packed = useMemo(() => packedEnvelope(item, orientation), [item, orientation]);
  const wrapResult = useMemo(() => generatePatternPlan(packed, pattern, PROTOTYPE_PROFILE), [packed, pattern]);
  const calculatedWrap = "error" in wrapResult ? undefined : wrapResult;
  const effectiveSheet = calculatedWrap ? autoFitSheet(calculatedWrap, sheet) : {...sheet, orientation: "unchanged" as const};
  const sheetFit = calculatedWrap ? fitsSheet(calculatedWrap, effectiveSheet) : undefined;
  const selectedCommonBox = COMMON_BOXES.find((box) => box.id === selectedCommonBoxId) ?? COMMON_BOXES[1];
  const rscResult = useMemo(() => source === "flat" ? undefined : generateCommonBoxPlan(item, source === "existing" ? "EXISTING_BOX" : "COMMON_BOX", source === "existing" ? {id: "EXISTING", name: "Your existing box", internalDimensions: existingBox, note: "Measured by you"} : selectedCommonBox), [existingBox, item, selectedCommonBox, source]);
  const calculatedRsc = rscResult && !("error" in rscResult) ? rscResult : undefined;
  const plan: DisplayPlan | undefined = source === "flat" ? (sheetFit?.fits ? calculatedWrap : undefined) : calculatedRsc;
  const isWrapPlan = plan?.id === "WRAP_BOX_V1";
  const recipe: AnimationRecipe = isWrapPlan ? "wrap" : plan?.sourceMode === "EXISTING_BOX" ? "existing" : "rsc";
  const animationFrame = getAnimationFrame(progress, recipe);
  const requiredInternal = plan?.requiredInternal;
  const finalInternal = plan?.id === "RSC_0201" ? plan.finalInternal : undefined;
  const userCuts = isWrapPlan ? plan.metrics.cutCount : 0;
  const foldCount = isWrapPlan ? plan.metrics.foldCount : 8;
  const sourceError = rscResult && "error" in rscResult ? rscResult.error : undefined;
  const selectedCommonBoxVolume = commonBoxVolume(selectedCommonBox);
  const largerCommonBoxSuggestion = source === "common" && sourceError ? COMMON_BOXES.filter((box) => box.id !== selectedCommonBoxId && commonBoxVolume(box) > selectedCommonBoxVolume && commonBoxFitsItem(item, box)).sort((a, b) => commonBoxVolume(a) - commonBoxVolume(b))[0] : undefined;
  const resultTitle = plan ? (isWrapPlan ? "A wrap box that fits your item" : "An unchanged box that fits your item") : sourceError ? "That box needs more room" : "Ready when you are";
  const patternLabel = pattern === "MAILER_BOX_V1" ? "Mailer / tuck-end" : pattern === "TAB_INSERT_V1" ? "Tab-insert / partition" : "One-piece wrap box";
  const geometryKey = [source, pattern, selectedCommonBoxId, item.shapeProfile?.kind ?? "RECTANGULAR_BOX", item.dimensions.lengthMm, item.dimensions.widthMm, item.dimensions.heightMm, item.cushioning.leftMm, item.cushioning.rightMm, item.cushioning.frontMm, item.cushioning.backMm, item.cushioning.bottomMm, item.cushioning.topMm, item.tolerance.lengthTotalMm, item.tolerance.widthTotalMm, item.tolerance.heightTotalMm, item.allowRotation, item.keepUpright, sheet.lengthMm, sheet.widthMm, existingBox.lengthMm, existingBox.widthMm, existingBox.heightMm].join("|");

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!calculatedWrap) return;
    const fitted = autoFitSheet(calculatedWrap, sheet);
    if (fitted.orientation === "unchanged") return;
    if (Math.abs(fitted.lengthMm - sheet.lengthMm) < 0.0001 && Math.abs(fitted.widthMm - sheet.widthMm) < 0.0001) return;
    const timer = window.setTimeout(() => {
      setSheet({lengthMm: fitted.lengthMm, widthMm: fitted.widthMm});
      setSheetNotice({lengthMm: fitted.lengthMm, widthMm: fitted.widthMm});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calculatedWrap, geometryKey, sheet]);

  useEffect(() => {
    // Animation must visibly return to the reveal stage whenever the generated plan changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(0);
    setIsPlaying(false);
  }, [geometryKey]);

  useEffect(() => {
    if (!isPlaying) return;
    const startedAt = performance.now();
    const startingProgress = progressRef.current;
    const durationMs = 9000 / playbackRate;
    const timer = window.setInterval(() => {
      const next = Math.min(1, startingProgress + (performance.now() - startedAt) / durationMs * (1 - startingProgress));
      setProgress(next);
      if (next >= 1) {
        window.clearInterval(timer);
        setIsPlaying(false);
      }
    }, 32);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackRate]);

  const replayAnimation = () => { setIsPlaying(false); setProgress(0); };
  const toggleAnimation = () => { if (isPlaying) setIsPlaying(false); else { if (progress >= 1) setProgress(0); setIsPlaying(true); } };
  const stepAnimation = (direction: -1 | 1) => { setIsPlaying(false); setProgress((current) => nextAnimationCheckpoint(current, recipe, direction)); };
  const updateDimension = (key: keyof ItemInput["dimensions"]) => (valueMm: number) => setItem((current) => ({...current, dimensions: {...current.dimensions, [key]: valueMm}}));
  const updateCushioning = (goal: ProtectionGoal) => {
    setProtectionGoal(goal);
    const value = PROTECTION_GOAL_MM[goal];
    setItem((current) => ({...current, cushioning: {leftMm: value, rightMm: value, frontMm: value, backMm: value, bottomMm: value, topMm: value}}));
  };
  const exportSvg = () => {
    if (!plan || plan.id !== "WRAP_BOX_V1") return;
    const url = URL.createObjectURL(new Blob([renderWrapSvg(plan)], {type: "image/svg+xml"}));
    const link = document.createElement("a"); link.href = url; link.download = "shipping-buddy-wrap-box.svg"; link.click(); URL.revokeObjectURL(url);
  };
  const resetProject = () => {
    setItem(DEFAULT_PROJECT); setUnit("in"); setSource("flat"); setPattern("WRAP_BOX_V1"); setSheet(DEFAULT_SHEET); setExistingBox(DEFAULT_EXISTING_BOX); setSelectedCommonBoxId(COMMON_BOXES[1].id); setProtectionGoal(2); setSheetNotice(null); setFieldError(""); replayAnimation(); setView("overview");
  };

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Icon name="box" /></span><span>Shipping <b>Buddy</b></span></div><div className="topbar-actions"><span className="prototype-pill"><i /> Prototype mode</span><div className="unit-control" role="group" aria-label="Measurement units"><span>Units</span><button type="button" aria-pressed={unit === "in"} className={unit === "in" ? "selected" : ""} onClick={() => setUnit("in")}>in</button><button type="button" aria-pressed={unit === "mm"} className={unit === "mm" ? "selected" : ""} onClick={() => setUnit("mm")}>mm</button></div></div></header>
    <section className="intro"><div><p className="eyebrow"><Icon name="spark" /> PACKAGING PLANNER</p><h1>Find a box — or build one that fits.</h1><p className="intro-copy">A calm, calculated way to turn your item measurements into a practical packaging plan.</p></div><div className="intro-note"><span className="note-icon"><Icon name="ruler" /></span><div><strong>Inches at the surface</strong><span>Use arrows, wheel, or +/− in ¼-inch checkpoints. Switch to mm for metric entry.</span></div></div></section>
    <Stepper active={3} />
    <section className="workspace">
      <aside className="input-panel">
        <div className="panel-heading"><div><span className="section-kicker">STEP 01</span><h2>Your item</h2></div><span className="status-check"><Icon name="check" /> Ready</span></div><p className="panel-help">Tell us the packed shape you need to protect.</p>
        <div className="field-grid"><QuantityField label="Length" valueMm={item.dimensions.lengthMm} unit={unit} minMm={0.01} onCommit={updateDimension("lengthMm")} onInvalid={setFieldError} /><QuantityField label="Width" valueMm={item.dimensions.widthMm} unit={unit} minMm={0.01} onCommit={updateDimension("widthMm")} onInvalid={setFieldError} /><QuantityField label="Height" valueMm={item.dimensions.heightMm} unit={unit} minMm={0.01} onCommit={updateDimension("heightMm")} onInvalid={setFieldError} /><QuantityField kind="weight" label="Weight" valueKg={item.weightKg} unit={unit} onCommit={(valueKg) => setItem((current) => ({...current, weightKg: valueKg}))} onInvalid={setFieldError} /></div>
        <label className="field select-field shape-profile-field"><span>Item shape (measured envelope)</span><select aria-label="Item shape profile" value={item.shapeProfile?.kind ?? "RECTANGULAR_BOX"} onChange={(event) => setItem((current) => ({...current, shapeProfile: {kind: event.target.value as ItemShapeKind}}))}><option value="RECTANGULAR_BOX">Rectangular box</option><option value="CYLINDER_TUBE">Cylinder or tube</option><option value="ROUNDED_FORM">Rounded or sphere-like</option><option value="L_U_MEASURED">L/U-style measured profile</option></select></label><p className="field-help">Use the outer measured envelope. The profile tells the plan which protective shape to preserve.</p>
        {fieldError && <p className="field-error" role="alert">Enter a positive number for {fieldError}.</p>}
        <div className="divider" /><div className="panel-heading compact"><div><span className="section-kicker">STEP 02</span><h2>Protection</h2></div><span className="soft-badge">Editable</span></div>
        <label className="field select-field"><span>Fragility</span><select value={item.fragility} onChange={(event) => setItem((current) => ({...current, fragility: event.target.value as ItemInput["fragility"]}))}><option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option><option value="VERY_HIGH">Very high</option></select></label>
        <div className="cushion-card"><div><span className="small-label">Protection goal</span><strong>Goal {protectionGoal} · {formatLengthDisplay(PROTECTION_GOAL_MM[protectionGoal], unit)} on every face</strong></div><input aria-label="Protection goal" type="range" min="1" max="5" step="1" value={protectionGoal} onChange={(event) => updateCushioning(Number(event.target.value) as ProtectionGoal)} /><div className="range-labels"><span>1 · Light</span><span>5 · Maximum</span></div></div>
        <div className="toggle-row"><label className="switch-label"><input type="checkbox" checked={item.allowRotation} onChange={(event) => setItem((current) => ({...current, allowRotation: event.target.checked, keepUpright: event.target.checked ? current.keepUpright : false}))} /><span className="switch" /> Allow rotation</label><label className={`switch-label ${!item.allowRotation ? "is-disabled" : ""}`}><input type="checkbox" disabled={!item.allowRotation} checked={item.keepUpright} onChange={(event) => setItem((current) => ({...current, keepUpright: event.target.checked}))} /><span className="switch" /> Keep upright</label></div>
        <button className="advanced-button" onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced}>Extra fit clearance (optional) <span>{showAdvanced ? "−" : "+"}</span></button>{showAdvanced && <div className="advanced-box"><p className="field-help">Adds empty room beyond cushioning so the item is not squeezed. It is not protective padding.</p><QuantityField label="Extra room" valueMm={item.tolerance.lengthTotalMm} unit={unit} minMm={0} onCommit={(clearanceMm) => setItem((current) => ({...current, tolerance: {lengthTotalMm: clearanceMm, widthTotalMm: clearanceMm, heightTotalMm: clearanceMm}}))} onInvalid={setFieldError} /></div>}
        <div className="divider" /><div className="source-section"><div className="panel-heading compact"><div><span className="section-kicker">STEP 03</span><h2>What are you starting with?</h2></div></div><p className="panel-help source-help">Choose the material or box you already have. The plan changes with your choice.</p>
        <div className="source-choices"><SourceChoice title="Flat sheet" copy="A blank sheet you will cut and fold. The app calculates the cutting layout and minimum sheet size." icon="ruler" selected={source === "flat"} onClick={() => setSource("flat")} /><SourceChoice title="Common box" copy="Choose a representative box that is already made. No cutting layout is needed." icon="cube" selected={source === "common"} onClick={() => setSource("common")} /><SourceChoice title="Existing box" copy="Enter the inside dimensions of a box you already own." icon="box" selected={source === "existing"} onClick={() => setSource("existing")} /></div>
        {source === "flat" && <label className="field select-field"><span>Construction profile</span><select aria-label="Construction profile" value={pattern} onChange={(event) => setPattern(event.target.value as WrapPatternId)}><option value="WRAP_BOX_V1">One-piece wrap</option><option value="MAILER_BOX_V1">Mailer / tuck-end</option><option value="TAB_INSERT_V1">Tab-insert / partition</option></select></label>}
        {source === "flat" ? <><div className="source-detail-fields"><QuantityField label="Sheet length" valueMm={sheet.lengthMm} unit={unit} minMm={0.01} onCommit={(valueMm) => setSheet((current) => ({...current, lengthMm: valueMm}))} onInvalid={setFieldError} /><QuantityField label="Sheet width" valueMm={sheet.widthMm} unit={unit} minMm={0.01} onCommit={(valueMm) => setSheet((current) => ({...current, widthMm: valueMm}))} onInvalid={setFieldError} /></div>{sheetNotice && <p className="sheet-notice" role="status">Sheet automatically expanded to {formatPair([sheetNotice.lengthMm, sheetNotice.widthMm], unit)} to fit this item.</p>}<p className="source-detail-copy">A blank sheet you will cut and fold. The exact layout stays in millimetres; the stock recommendation uses safe quarter-inch checkpoints.</p></> : source === "existing" ? <><p className="source-detail-copy">Enter the inside dimensions of the box. We use these measurements to check whether your protected item will fit.</p><div className="source-detail-fields"><QuantityField label="Inside length" valueMm={existingBox.lengthMm} unit={unit} minMm={0.01} onCommit={(valueMm) => setExistingBox((current) => ({...current, lengthMm: valueMm}))} onInvalid={setFieldError} /><QuantityField label="Inside width" valueMm={existingBox.widthMm} unit={unit} minMm={0.01} onCommit={(valueMm) => setExistingBox((current) => ({...current, widthMm: valueMm}))} onInvalid={setFieldError} /><QuantityField label="Inside height" valueMm={existingBox.heightMm} unit={unit} minMm={0.01} onCommit={(valueMm) => setExistingBox((current) => ({...current, heightMm: valueMm}))} onInvalid={setFieldError} /></div></> : <><p className="source-detail-copy">Choose a representative RSC size. These are prototype dimensions; verify the actual box before packing.</p><CommonBoxPicker boxes={COMMON_BOXES} selectedId={selectedCommonBoxId} item={item} unit={unit} onSelect={setSelectedCommonBoxId} /></>}
        </div><button className="generate-button" onClick={replayAnimation}><Icon name="spark" /> Review plan <Icon name="arrow" /></button><p className="input-footnote">Calculated fit is not a guarantee of protection, carrier compliance, or shipping safety.</p>
      </aside>
      <section className="result-panel">
        <div className="result-header"><div><span className="section-kicker">YOUR PLAN</span><h2>{resultTitle}</h2></div><div className="result-actions"><button className="icon-button" aria-label="Reset project" onClick={resetProject}><span>↺</span></button><button className="export-button" onClick={exportSvg} disabled={!isWrapPlan}><Icon name="download" /> {isWrapPlan ? "Export SVG" : "Export unavailable"}</button></div></div>
        {plan ? <>
          <div className="scene-card"><BoxScene progress={progress} plan={plan} unit={unit} /><div className="scene-toolbar"><div className="playback"><button onClick={replayAnimation} aria-label="Replay" title="Replay from the beginning">↺</button><button className="play-button" onClick={toggleAnimation} aria-label={isPlaying ? "Pause animation" : "Play animation"}>{isPlaying ? "Ⅱ" : "▶"}</button><button onClick={() => stepAnimation(-1)} aria-label="Previous step" disabled={progress <= 0}>‹</button><button onClick={() => stepAnimation(1)} aria-label="Next step" disabled={progress >= 1}>›</button></div><input className="timeline" type="range" min="0" max="1" step="0.01" value={progress} onChange={(event) => { setIsPlaying(false); setProgress(Number(event.target.value)); }} aria-label="Animation progress" aria-valuetext={`Step ${animationFrame.checkpointIndex + 1} of ${animationFrame.stageCount}: ${animationFrame.label}`} /><span className="timeline-label">{animationFrame.checkpointIndex + 1}/{animationFrame.stageCount}</span><select className="speed-select" aria-label="Playback speed" value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></div></div>
          <div className="result-tabs" role="tablist"><button id="overview-tab" role="tab" aria-selected={view === "overview"} aria-controls="overview-panel" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Overview</button><button id="dieline-tab" role="tab" aria-selected={view === "dieline"} aria-controls="dieline-panel" className={view === "dieline" ? "active" : ""} onClick={() => setView("dieline")}>Cutting layout</button><button id="instructions-tab" role="tab" aria-selected={view === "instructions"} aria-controls="instructions-panel" className={view === "instructions" ? "active" : ""} onClick={() => setView("instructions")}>Instructions</button></div>
          {view === "overview" && <div id="overview-panel" role="tabpanel" aria-labelledby="overview-tab" className="overview-grid"><div className="recommendation-card"><span className="recommendation-label"><Icon name="spark" /> {isWrapPlan ? "CALCULATED PLAN" : "UNCHANGED RSC"}</span><h3>{isWrapPlan ? patternLabel : (plan as RscPlan).name}</h3><p>{isWrapPlan ? "Calculated from your measured item profile, cushioning, and selected sheet." : "A factory-reference assembly plan with no user cutting actions."}</p><div className="recommendation-tags"><span>Fits item</span><span>{isWrapPlan ? "Cutting layout" : "No cutting"}</span><span>Strength unverified</span></div></div><div className="metrics-grid"><Metric label="Required space" value={formatDimensions([requiredInternal?.lengthMm ?? 0, requiredInternal?.widthMm ?? 0, requiredInternal?.heightMm ?? 0], unit)} accent /><Metric label="Source" value={isWrapPlan ? formatPair([effectiveSheet.lengthMm, effectiveSheet.widthMm], unit) : formatDimensions([finalInternal?.lengthMm ?? 0, finalInternal?.widthMm ?? 0, finalInternal?.heightMm ?? 0], unit)} /><Metric label="User cuts" value={`${userCuts}`} /><Metric label="Fold sequence" value={`${foldCount} folds`} /></div></div>}
          {view === "dieline" && <div id="dieline-panel" role="tabpanel" aria-labelledby="dieline-tab" className="dieline-card">{isWrapPlan ? <><div className="dieline-header"><div><span className="section-kicker">USER-ACTION GEOMETRY</span><h3>Calculated cutting layout</h3></div><span className="fit-badge fit"><i /> Fits selected sheet</span></div><Dieline plan={plan as WrapPlan} /></> : <><div className="dieline-header"><div><span className="section-kicker">FACTORY REFERENCE</span><h3>Assembly diagram</h3></div><span className="fit-badge fit"><i /> Cutting export unavailable</span></div><RscReference /></>}</div>}
          {view === "instructions" && <div id="instructions-panel" role="tabpanel" aria-labelledby="instructions-tab" className="instructions-card"><div className="dieline-header"><div><span className="section-kicker">BUILD SEQUENCE</span><h3>{isWrapPlan ? "Four calm, numbered steps" : "Unchanged-box sequence"}</h3></div><span className="fit-badge fit"><i /> Follow the stage captions</span></div><ol className="instruction-list">{(isWrapPlan ? [["01", "Cut the outside boundary", "Follow the solid cut lines. Keep the corner reliefs intact until the score stage."], ["02", "Score every dashed line", "Use a stable surface and a blunt scoring tool. Do not cut through the hinge bands."], ["03", "Raise the side walls", "Fold side walls first, then turn the four corner tabs inward."], ["04", "Close, tape, and check the fit", "Fold the top flaps inward and check that cushioning follows the item faces."]] : [["01", "Square the box", "Open the connected RSC walls without cutting the factory reference."], ["02", "Close the bottom", "Fold minor flaps first, then major flaps and bottom tape."], ["03", "Place the item", "Lower the protected item into the guaranteed internal envelope."], ["04", "Close the top", "Fold top minor and major flaps, then seal the centre seam."]]).map(([number, title, copy]) => <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div></li>)}</ol></div>}
          <div className="warning-banner"><span>i</span><div><strong>{isWrapPlan ? "Prototype construction plan" : "Representative RSC reference"}</strong><p>{isWrapPlan ? "Corner-tab dimensions and board allowances require physical validation." : "Catalog dimensions are representative. Verify the actual box before packing."} Strength remains unverified.</p></div></div>
        </> : <div className="empty-state"><span className="empty-icon"><Icon name="box" /></span>{sourceError ? <><h3>That box does not fit</h3><p>{sourceError}</p>{largerCommonBoxSuggestion && <p className="fit-suggestion"><strong>Try {largerCommonBoxSuggestion.name}:</strong> it is the next larger catalog option that fits this protected item ({formatDimensions([largerCommonBoxSuggestion.internalDimensions.lengthMm, largerCommonBoxSuggestion.internalDimensions.widthMm, largerCommonBoxSuggestion.internalDimensions.heightMm], unit)}). Choose it above; your selection will not change automatically.</p>}</> : <><h3>Enter valid dimensions to see a plan</h3><p>Once each measurement is valid, the preview updates from the same geometry used by the layout.</p></>}</div>}
      </section>
    </section>
    <footer className="footer"><span><i className="footer-dot" /> Local prototype · no live shipping rates</span><span>Exact SVG coordinates remain in millimetres for print accuracy.</span></footer>
  </main>;
}
