import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect, test, type Locator, type Page} from "@playwright/test";

const key = "shipping-buddy:planner-draft:v1";
const artifactDirectory = join(tmpdir(), "shipping-buddy-issue14-performance");
const flatDraft = {state: {draft: {schemaVersion: 1, draftId: "issue14-performance", updatedAt: "2026-08-11T00:00:00.000Z", unit: "mm", protectionGoal: 2,
  item: {dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305}, shapeProfile: {kind: "RECTANGULAR_BOX"}, weightKg: 3.2, fragility: "MODERATE", cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0}, tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0}, allowRotation: true, keepUpright: false},
  source: {mode: "FLAT_SHEET", existingBox: {lengthMm: 508, widthMm: 482.6, heightMm: 457.2}, measurementBasis: "INSIDE", selectedCommonBoxId: "RSC-04", sheet: {lengthMm: 962, widthMm: 1360}, pattern: "WRAP_BOX_V1"},
}, savedBoxes: []}, version: 1};

type RafInstrumentedWindow = typeof window & {__issue14RafCallbacks?: number};

async function seedFlat(page: Page) {
  await page.addInitScript(({storageKey, stored}) => {
    if (!window.localStorage.getItem(storageKey)) window.localStorage.setItem(storageKey, JSON.stringify(stored));
  }, {storageKey: key, stored: flatDraft});
  await page.addInitScript(() => {
    const tracked = window as RafInstrumentedWindow;
    let callbacks = 0;
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((time) => { callbacks += 1; tracked.__issue14RafCallbacks = callbacks; callback(time); });
    tracked.__issue14RafCallbacks = callbacks;
  });
}

async function readyFlat(page: Page) {
  await page.goto("/plan/build");
  const preview = page.locator(".cut-and-fold-preview");
  await expect(preview).toHaveAttribute("data-construction-status", "READY");
  await expect(preview).toHaveAttribute("data-construction-textures", "0");
  await expect(preview).toHaveAttribute("data-construction-geometry-cache", "15");
  await expect(preview).toHaveAttribute("data-construction-live-references", "15");
  await expect.poll(() => preview.getAttribute("data-construction-draw-calls")).not.toBe("0");
  expect(Number(await preview.getAttribute("data-construction-draw-calls"))).toBeLessThanOrEqual(40);
  expect(Number(await preview.getAttribute("data-construction-triangles"))).toBeLessThanOrEqual(30_000);
  expect(Number(await preview.getAttribute("data-construction-geometries"))).toBeLessThanOrEqual(20);
  return preview;
}

async function idleRafCount(page: Page) {
  await page.waitForTimeout(500);
  const start = await page.evaluate(() => (window as RafInstrumentedWindow).__issue14RafCallbacks ?? 0);
  await page.waitForTimeout(1000);
  return (await page.evaluate(() => (window as RafInstrumentedWindow).__issue14RafCallbacks ?? 0)) - start;
}

async function settledIdleWindows(page: Page) {
  return [await idleRafCount(page), await idleRafCount(page)] as const;
}

async function setSlider(slider: Locator, percent: number) {
  await slider.evaluate((element, value) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!set) throw new Error("Range setter unavailable");
    set.call(element, String(value));
    element.dispatchEvent(new Event("input", {bubbles: true}));
  }, percent);
}

async function completeAutoplay(page: Page, slider: Locator) {
  await page.getByRole("button", {name: /(?:Autoplay build|Replay from start)/}).click();
  await expect(slider).toHaveValue("100", {timeout: 20_000});
  await expect(page.getByRole("button", {name: "Replay from start"})).toBeVisible({timeout: 20_000});
}

async function collectFrameIntervals(page: Page) {
  return page.evaluate(async () => new Promise<number[]>((resolve) => {
    const values: number[] = []; let previous: number | undefined;
    const tick = (now: number) => {
      if (previous !== undefined) values.push(now - previous);
      previous = now;
      values.length >= 140 ? resolve(values) : requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

function changedFlatDraft(cycle: number) {
  const stored = JSON.parse(JSON.stringify(flatDraft)) as typeof flatDraft;
  const item = stored.state.draft.item;
  item.dimensions = {lengthMm: 356 - cycle, widthMm: 330, heightMm: 305};
  stored.state.draft.draftId = `issue14-performance-${cycle}`;
  return stored;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test("Flat playback preserves renderer ceilings and records desktop/mobile frame cadence", {tag: "@performance"}, async ({page}) => {
  await seedFlat(page);
  const preview = await readyFlat(page);
  const slider = page.getByRole("slider", {name: "Fine animation position"});
  const evidence: Array<{viewport: string; medianIntervalMs: number; fps: number; samples: number[]}> = [];
  for (const [name, width, height, minimumFps] of [["desktop", 1280, 900, 55], ["mobile-390", 390, 844, 30], ["mobile-320", 320, 800, 30]] as const) {
    await page.setViewportSize({width, height});
    await setSlider(slider, 0);
    await page.getByRole("button", {name: /(?:Autoplay build|Replay from start)/}).click();
    await expect(preview).toHaveAttribute("data-construction-playback", "AUTOPLAY");
    const rawSamples = await collectFrameIntervals(page);
    const samples = rawSamples.slice(20);
    expect(samples).toHaveLength(120);
    const medianIntervalMs = median(samples); const fps = 1000 / medianIntervalMs;
    evidence.push({viewport: name, medianIntervalMs, fps, samples});
    expect(fps, `${name} median FPS`).toBeGreaterThanOrEqual(minimumFps);
    await expect(preview).toHaveAttribute("data-construction-textures", "0");
    expect(Number(await preview.getAttribute("data-construction-draw-calls"))).toBeLessThanOrEqual(40);
    await expect(slider).toHaveValue("100", {timeout: 20_000});
    await expect(preview).toHaveAttribute("data-construction-playback", "PAUSED", {timeout: 20_000});
  }
  await mkdir(artifactDirectory, {recursive: true});
  await writeFile(join(artifactDirectory, "frame-intervals.json"), JSON.stringify(evidence, null, 2));
});

test("Flat renderer is idle outside active playback and resources remain flat across 25 plan cycles", {tag: "@performance"}, async ({page}) => {
  await seedFlat(page);
  const preview = await readyFlat(page);
  const slider = page.getByRole("slider", {name: "Fine animation position"});
  await setSlider(slider, 0);
  const paused = await settledIdleWindows(page);
  await completeAutoplay(page, slider);
  await expect(preview).toHaveAttribute("data-construction-playback", "PAUSED");
  const completed = await settledIdleWindows(page);
  await page.getByRole("button", {name: "Reset view"}).click();
  await expect(preview).toHaveAttribute("data-construction-playback", "PAUSED");
  const reset = await settledIdleWindows(page);
  const baselines: Array<{cycle: number; dimensions: string; summary: string; cache: string | null; live: string | null}> = [];
  for (let cycle = 1; cycle <= 25; cycle += 1) {
    const stored = changedFlatDraft(cycle);
    await page.goto("/plan/fit");
    await page.evaluate(({storageKey, value}) => window.localStorage.setItem(storageKey, JSON.stringify(value)), {storageKey: key, value: stored});
    await page.goto("/plan/build");
    await expect.poll(() => preview.getAttribute("data-construction-draw-calls"), {timeout: 10_000}).not.toBe("0");
    await expect(preview).toHaveAttribute("data-construction-live-references", "15");
    const dimensions = `330 × ${356 - cycle} × 305 mm`;
    const summary = await page.locator(".build-summary").innerText();
    expect(summary).toContain(dimensions);
    baselines.push({cycle, dimensions, summary, cache: await preview.getAttribute("data-construction-geometry-cache"), live: await preview.getAttribute("data-construction-live-references")});
  }
  await page.goto("/plan/fit");
  const routeAway = await settledIdleWindows(page);
  await mkdir(artifactDirectory, {recursive: true});
  await writeFile(join(artifactDirectory, "raf-and-resources.json"), JSON.stringify({paused, completed, reset, routeAway, baselines}, null, 2));
  expect(Math.max(...paused, ...completed, ...reset, ...routeAway)).toBeLessThanOrEqual(2);
  expect(new Set(baselines.map((baseline) => `${baseline.cache}/${baseline.live}`))).toEqual(new Set(["15/15"]));
  expect(new Set(baselines.map((baseline) => baseline.summary)).size).toBe(25);
});

test.setTimeout(120_000);
