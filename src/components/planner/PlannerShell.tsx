"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect, useRef, useState, type ChangeEvent, type ReactNode} from "react";
import {usePlannerStore} from "@/planner/store";

const STEPS = [
  {slug: "item", label: "Item", prompt: "What are you packing?"},
  {slug: "protection", label: "Protection", prompt: "How protected should it be?"},
  {slug: "source", label: "Box", prompt: "What are you starting with?"},
  {slug: "fit", label: "Fit", prompt: "Check the measurements"},
  {slug: "build", label: "Build", prompt: "Review your plan"},
] as const;

export function PlannerShell({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const hydration = usePlannerStore((state) => state.hydration);
  const unit = usePlannerStore((state) => state.draft.unit);
  const setUnit = usePlannerStore((state) => state.setUnit);
  const exportDraft = usePlannerStore((state) => state.exportDraft);
  const importDraft = usePlannerStore((state) => state.importDraft);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileMessage, setFileMessage] = useState("");
  const ready = hydration === "ready";
  const activeIndex = Math.max(0, STEPS.findIndex((step) => pathname === `/plan/${step.slug}`));
  const previous = activeIndex > 0 ? `/plan/${STEPS[activeIndex - 1].slug}` : "/";
  const next = activeIndex < STEPS.length - 1 ? `/plan/${STEPS[activeIndex + 1].slug}` : null;

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        await usePlannerStore.persist.rehydrate();
      } finally {
        if (mounted) usePlannerStore.getState().finishHydration();
      }
    };
    void hydrate();
    return () => { mounted = false; };
  }, []);

  const downloadDraft = () => {
    if (!ready) return;
    const blob = new Blob([exportDraft()], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "shipping-buddy-draft.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setFileMessage("Draft exported.");
  };

  const readDraft = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !ready) return;
    try {
      const result = importDraft(await file.text());
      setFileMessage(result.ok ? "Draft imported." : result.message);
    } catch {
      setFileMessage("That draft could not be read.");
    }
  };

  return (
    <main className="planner-page">
      <header className="planner-topbar">
        <Link className="planner-brand" href="/" aria-label="Shipping Buddy home">
          <span aria-hidden="true">SB</span>
          <strong>Shipping Buddy</strong>
        </Link>
        <div className="planner-tools">
          <span className="planner-draft-status" role="status" aria-live="polite">{ready ? "Draft ready" : "Loading saved draft"}</span>
          <div className="planner-unit" aria-label="Measurement unit">
            <button type="button" disabled={!ready} className={unit === "in" ? "is-selected" : ""} onClick={() => setUnit("in")}>inches</button>
            <button type="button" disabled={!ready} className={unit === "mm" ? "is-selected" : ""} onClick={() => setUnit("mm")}>mm</button>
          </div>
          <button type="button" disabled={!ready} className="planner-tool-button" onClick={downloadDraft}>Export</button>
          <button type="button" disabled={!ready} className="planner-tool-button" onClick={() => { if (ready) inputRef.current?.click(); }}>Import</button>
          <input ref={inputRef} disabled={!ready} className="planner-file-input" type="file" accept="application/json,.json" onChange={readDraft} />
        </div>
      </header>

      <div className="planner-frame">
        <nav className="planner-progress" aria-label="Planner progress">
          <ol>
            {STEPS.map((step, index) => (
              <li key={step.slug} className={index === activeIndex ? "is-active" : index < activeIndex ? "is-complete" : ""}>
                <Link href={`/plan/${step.slug}`} aria-current={index === activeIndex ? "step" : undefined}>
                  <span>{index < activeIndex ? "✓" : index + 1}</span>
                  <small>{step.label}</small>
                </Link>
              </li>
            ))}
          </ol>
          <p>{activeIndex + 1} of {STEPS.length} · {STEPS[activeIndex].prompt}</p>
        </nav>

        <section className="planner-card" aria-busy={!ready}>
          {!ready ? (
            <div className="planner-loading" role="status">Loading your saved draft…</div>
          ) : children}
        </section>

        <footer className="planner-navigation">
          <Link className="planner-back" href={previous}>← Back</Link>
          {next ? <Link className="planner-next" href={next}>Next <span aria-hidden="true">→</span></Link> : null}
        </footer>
        {fileMessage ? <p className="planner-file-message" role="status">{fileMessage}</p> : null}
      </div>
    </main>
  );
}
