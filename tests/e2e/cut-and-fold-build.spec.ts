import {copyFile, mkdir} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect, test, type Locator, type Page} from "@playwright/test";

const STORAGE_KEY = "shipping-buddy:planner-draft:v1";
const FINAL_SCREENSHOT_DIR = join(tmpdir(), "shipping-buddy-sb11c2t");

function persistedDraft(source: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  return {state: {draft: {schemaVersion: 1, draftId: "cut-and-fold-e2e", updatedAt: "2026-08-11T00:00:00.000Z", unit: "mm",
    item: {dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305}, shapeProfile: {kind: "RECTANGULAR_BOX"}, weightKg: 3.2, fragility: "MODERATE", cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0}, tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0}, allowRotation: true, keepUpright: false, ...item},
    protectionGoal: 2,
    source: {mode: "FLAT_SHEET", existingBox: {lengthMm: 508, widthMm: 482.6, heightMm: 457.2}, measurementBasis: "INSIDE", selectedCommonBoxId: "RSC-04", sheet: {lengthMm: 962, widthMm: 1360}, pattern: "WRAP_BOX_V1", ...source},
  }, savedBoxes: []}, version: 1};
}

async function seed(page: Page, source: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  const stored = persistedDraft(source, item);
  await page.addInitScript(({key, value}) => window.localStorage.setItem(key, JSON.stringify(value)), {key: STORAGE_KEY, value: stored});
}

async function setPercent(slider: Locator, percent: number) {
  await slider.evaluate((element, value) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!set) throw new Error("Range setter unavailable");
    set.call(element, String(value));
    element.dispatchEvent(new Event("input", {bubbles: true}));
  }, percent);
}

async function ready(page: Page) {
  await expect(page.getByText("Draft ready", {exact: true})).toBeVisible();
  const preview = page.locator(".cut-and-fold-preview");
  await expect(preview).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(".tutorial-cardboard-preview")).toHaveCount(0);
  await expect(preview).toHaveAttribute("data-construction-status", "READY");
  await expect(preview).toHaveAttribute("data-construction-pattern", "WRAP_BOX_V1");
  await expect(preview).toHaveAttribute("data-construction-face-count", "11");
  await expect(preview).toHaveAttribute("data-construction-scrap-count", "4");
  await expect(preview).toHaveAttribute("data-construction-score-count", "6");
  await expect(preview).toHaveAttribute("data-construction-cut-count", "40");
  await expect(preview).toHaveAttribute("data-construction-fold-count", "10");
  await expect(preview).toHaveAttribute("data-construction-operation-count", "79");
  await expect(preview).toHaveAttribute("data-construction-pose-diagnostic-count", "0");
  await expect(preview).toHaveAttribute("data-construction-geometry-cache", "15");
  await expect(preview).toHaveAttribute("data-construction-live-references", "15");
  await expect.poll(() => preview.getAttribute("data-construction-draw-calls")).not.toBe("0");
  expect(Number(await preview.getAttribute("data-construction-draw-calls"))).toBeLessThanOrEqual(40);
  await expect(preview).toHaveAttribute("data-construction-textures", "0");
  return preview;
}

function numberAttribute(preview: Locator, name: string) {
  return preview.getAttribute(`data-construction-camera-${name}`).then(Number);
}

async function drag(page: Page, canvas: Locator, from: readonly [number, number], to: readonly [number, number]) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas has no bounds");
  const point = ([x, y]: readonly [number, number]) => ({x: box.x + box.width * x, y: box.y + box.height * y});
  const start = point(from); const end = point(to);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, {steps: 16}); await page.mouse.up();
}

async function coloredToolAndTapePixels(page: Page, screenshot: Buffer) {
  return page.evaluate(async (dataUrl) => {
    const image = new Image(); image.src = dataUrl; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    if (!context) throw new Error("2D canvas unavailable");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let tool = 0; let tape = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue, alpha] = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
      if (alpha < 200) continue;
      if (red > 120 && green > 75 && green < 215 && blue < 115 && red - green > 40 && green - blue > 40) tool += 1;
      if (red > 140 && green > 120 && blue < 160 && red - green >= 10 && red - green <= 40 && green - blue >= 50) tape += 1;
    }
    return {tool, tape};
  }, `data:image/png;base64,${screenshot.toString("base64")}`);
}

test("flat-sheet Build owns the one canonical Canvas and exposes exact construction checkpoints", async ({page}, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const tracked = window as typeof window & {__cutAndFoldWebglLosses?: number};
    tracked.__cutAndFoldWebglLosses = 0;
    document.addEventListener("webglcontextlost", () => { tracked.__cutAndFoldWebglLosses = (tracked.__cutAndFoldWebglLosses ?? 0) + 1; }, true);
  });
  await seed(page); await page.goto("/plan/build");
  const preview = await ready(page);
  const slider = page.getByRole("slider", {name: "Construction checkpoint"});
  const canvas = page.locator(".cut-and-fold-canvas");
  const checkpoints = [
    [0, "reveal"], [18, "scores"], [22, "cuts"], [26, "cuts"], [30, "cutting"], [34, "cutting"], [38, "scrap"], [41, "scrap"], [44, "tabs"], [54, "walls"], [72, "top"], [90, "seal"], [93, "seal"], [97, "present"], [100, "present"],
  ] as const;
  const shots = new Map<number, Buffer>();
  for (const [percent, stage] of checkpoints) {
    await setPercent(slider, percent);
    await expect(preview).toHaveAttribute("data-construction-progress", (percent / 100).toFixed(3));
    await expect(preview).toHaveAttribute("data-construction-stage", stage);
    shots.set(percent, await canvas.screenshot({path: testInfo.outputPath(`cut-and-fold-${percent}.png`)}));
  }
  expect(await preview.getAttribute("data-construction-score-progress")).toBe("1.000");
  expect(await preview.getAttribute("data-construction-cut-progress")).toBe("1.000");
  await setPercent(slider, 18); await expect(preview).toHaveAttribute("data-construction-score-progress", "0.500");
  await setPercent(slider, 26); await expect(preview).toHaveAttribute("data-construction-cut-progress", "0.500");
  await setPercent(slider, 34);
  await expect(preview).toHaveAttribute("data-construction-operation-kind", "LIFT");
  await expect(preview).toHaveAttribute("data-construction-knife-visible", "true");
  await expect(preview).toHaveAttribute("data-construction-lift-visible", "true");
  expect(Number(await preview.getAttribute("data-construction-kerf-count"))).toBeGreaterThan(0);
  await setPercent(slider, 38); await expect(preview).toHaveAttribute("data-construction-scrap-ready-count", "4"); await expect(preview).toHaveAttribute("data-construction-scrap-removing-count", "0");
  await setPercent(slider, 41); await expect(preview).toHaveAttribute("data-construction-scrap-removing-count", "4");
  await setPercent(slider, 44); await expect(preview).toHaveAttribute("data-construction-scrap-removed-count", "4");
  await setPercent(slider, 90); await expect(preview).toHaveAttribute("data-construction-tape-ready", "true"); await expect(preview).toHaveAttribute("data-construction-tape-visible", "false");
  await setPercent(slider, 93); expect(Number(await preview.getAttribute("data-construction-tape-progress"))).toBeGreaterThan(0); await expect(preview).toHaveAttribute("data-construction-tape-visible", "true");
  await setPercent(slider, 97); await expect(preview).toHaveAttribute("data-construction-tape-progress", "1.000");
  const p18 = await coloredToolAndTapePixels(page, shots.get(18)!);
  const p30 = await coloredToolAndTapePixels(page, shots.get(30)!);
  const p34 = await coloredToolAndTapePixels(page, shots.get(34)!);
  const p93 = await coloredToolAndTapePixels(page, shots.get(93)!);
  const p100 = await coloredToolAndTapePixels(page, shots.get(100)!);
  expect(p18.tool).toBeGreaterThan(30);
  expect(p30.tool).toBeGreaterThan(30);
  expect(p34.tool).toBeGreaterThan(30);
  expect(p93.tape).toBeGreaterThan(10);
  expect(p100.tape).toBeGreaterThan(p93.tape);
  expect(shots.get(0)!.equals(shots.get(34)!)).toBe(false); expect(shots.get(34)!.equals(shots.get(72)!)).toBe(false); expect(shots.get(72)!.equals(shots.get(100)!)).toBe(false);
  await mkdir(FINAL_SCREENSHOT_DIR, {recursive: true});
  for (const percent of [18, 30, 34, 54, 93, 100]) await copyFile(testInfo.outputPath(`cut-and-fold-${percent}.png`), join(FINAL_SCREENSHOT_DIR, `cut-and-fold-${percent}.png`));
  expect(await page.evaluate(() => (window as typeof window & {__cutAndFoldWebglLosses?: number}).__cutAndFoldWebglLosses ?? 0)).toBe(0);
  expect(errors).toEqual([]);
});

test("construction camera refits, clamps, resets, stays stable, and releases bounded resources on route cycles", async ({page}) => {
  await seed(page); await page.goto("/plan/build"); const preview = await ready(page);
  const slider = page.getByRole("slider", {name: "Construction checkpoint"}); const canvas = page.locator(".cut-and-fold-canvas canvas"); const reset = page.getByRole("button", {name: "Reset view"});
  for (const percent of [0, 44, 54, 62, 100]) {
    await setPercent(slider, percent);
    await expect(preview).toHaveAttribute("data-construction-camera-mode", percent <= 44 ? "TOP_DOWN" : percent >= 62 ? "THREE_QUARTER" : "TRANSITION");
    const occupancy = await numberAttribute(preview, "occupancy"); expect(occupancy).toBeGreaterThanOrEqual(0.65); expect(occupancy).toBeLessThanOrEqual(0.8);
  }
  await setPercent(slider, 100); const canonical = await preview.evaluate((element) => ["azimuth", "polar", "distance", "reset-generation"].map((name) => element.getAttribute(`data-construction-camera-${name}`)));
  await page.waitForTimeout(750); const stable = await page.locator(".cut-and-fold-canvas").screenshot(); await page.waitForTimeout(750); expect((await page.locator(".cut-and-fold-canvas").screenshot()).equals(stable)).toBe(true);
  await drag(page, canvas, [0.5, 0.5], [0.75, 0.5]); expect(await preview.getAttribute("data-construction-camera-azimuth")).not.toBe(canonical[0]);
  await drag(page, canvas, [0.5, 0.2], [0.5, 0.95]); expect(await numberAttribute(preview, "polar")).toBeGreaterThanOrEqual(0.05);
  await reset.click(); await expect(preview).toHaveAttribute("data-construction-camera-azimuth", canonical[0]!); await expect(preview).toHaveAttribute("data-construction-camera-polar", canonical[1]!);
  await page.setViewportSize({width: 390, height: 800}); await expect(preview).toHaveAttribute("data-construction-camera-fit-valid", "true"); expect(await numberAttribute(preview, "occupancy")).toBeGreaterThanOrEqual(0.65);
  for (const route of ["fit", "build", "fit", "build"]) { await page.goto(`/plan/${route}`); if (route === "build") { const remounted = await ready(page); await expect(remounted).toHaveAttribute("data-construction-geometry-cache", "15"); await expect(remounted).toHaveAttribute("data-construction-live-references", "15"); } else await expect(page.locator("canvas")).toHaveCount(0); }
});

test("non-buildable sources and question routes remain Canvas-free with factual guidance", async ({page}) => {
  for (const route of ["item", "protection", "source", "fit"]) { await seed(page); await page.goto(`/plan/${route}`); await expect(page.locator("canvas")).toHaveCount(0); }
  const blocked = [
    [{sheet: {lengthMm: 400, widthMm: 400}}, {}, "too small"],
    [{}, {dimensions: {lengthMm: 100, widthMm: 100, heightMm: 100}}, "could not be generated"],
    [{mode: "EXISTING_BOX", measurementBasis: "NOT_SURE"}, {}, "Fit is not confirmed"],
    [{mode: "COMMON_BOX", selectedCommonBoxId: "RSC-01"}, {}, "too small"],
  ] as const;
  for (const [source, item, message] of blocked) { await seed(page, source, item); await page.goto("/plan/build"); await expect(page.locator("canvas")).toHaveCount(0); await expect(page.locator(".cut-and-fold-preview, .tutorial-cardboard-preview")).toHaveCount(0); await expect(page.getByText(new RegExp(message, "i"))).toBeVisible(); }
  for (const width of [320, 390]) { await page.setViewportSize({width, height: 800}); await seed(page); await page.goto("/plan/build"); const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); expect(sizes[0]).toBeLessThanOrEqual(sizes[1]); }
});
