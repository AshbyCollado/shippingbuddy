import {expect, test, type Locator, type Page} from "@playwright/test";

const STORAGE_KEY = "shipping-buddy:planner-draft:v1";
const FOUNDATION_COMMIT = "ba9e8b6b73044d48e4c362ecfbe1a3ffe504adf8";
const OUTPUT_MODE = "legacy-linear-no-tone-mapping";
const FOLD_CHECKPOINTS = [
  {value: 0, progress: "0.000", stage: "OPENING"},
  {value: 37, progress: "0.370", stage: "LOWER_FLAPS"},
  {value: 65, progress: "0.650", stage: "UPPER_FLAPS"},
  {value: 100, progress: "1.000", stage: "CLOSURE"},
] as const;
const CAMERA_MIDPOINTS = [
  {percentage: 18.5, progress: "0.185", mode: "TOP_DOWN", stage: "OPENING"},
  {percentage: 44.4, progress: "0.444", mode: "TRANSITION", stage: "LOWER_FLAPS"},
  {percentage: 63, progress: "0.630", mode: "THREE_QUARTER", stage: "UPPER_FLAPS"},
  {percentage: 83.3, progress: "0.833", mode: "THREE_QUARTER", stage: "CLOSURE"},
] as const;

type CameraDiagnostics = {
  mode: string;
  occupancy: number;
  azimuth: number;
  polar: number;
  transition: number;
  distance: number;
  resetGeneration: number;
};

function persistedEnvelope(sourceOverrides: Record<string, unknown> = {}) {
  return {
    state: {
      draft: {
        schemaVersion: 1,
        draftId: "tutorial-build-e2e",
        updatedAt: "2026-08-11T00:00:00.000Z",
        unit: "in",
        item: {
          dimensions: {lengthMm: 300, widthMm: 280, heightMm: 260},
          shapeProfile: {kind: "RECTANGULAR_BOX"},
          weightKg: 3,
          fragility: "MODERATE",
          cushioning: {leftMm: 25.4, rightMm: 25.4, frontMm: 25.4, backMm: 25.4, bottomMm: 25.4, topMm: 25.4},
          tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
          allowRotation: true,
          keepUpright: false,
        },
        protectionGoal: 2,
        source: {
          mode: "EXISTING_BOX",
          existingBox: {lengthMm: 508, widthMm: 482.6, heightMm: 457.2},
          measurementBasis: "INSIDE",
          selectedCommonBoxId: "RSC-04",
          sheet: {lengthMm: 1219.2, widthMm: 1625.6},
          pattern: "WRAP_BOX_V1",
          ...sourceOverrides,
        },
      },
      savedBoxes: [],
    },
    version: 1,
  };
}

async function seedPlanner(page: Page, sourceOverrides: Record<string, unknown> = {}) {
  await page.addInitScript(({key, envelope}) => {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  }, {key: STORAGE_KEY, envelope: persistedEnvelope(sourceOverrides)});
}

async function seedExactTutorial(page: Page) {
  const envelope = persistedEnvelope({
    mode: "EXISTING_BOX",
    measurementBasis: "INSIDE",
    existingBox: {lengthMm: 80, widthMm: 27, heightMm: 45},
  });
  envelope.state.draft.item.dimensions = {lengthMm: 10, widthMm: 10, heightMm: 10};
  envelope.state.draft.item.cushioning = {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0};
  await page.addInitScript(({key, stored}) => {
    window.localStorage.setItem(key, JSON.stringify(stored));
  }, {key: STORAGE_KEY, stored: envelope});
}

async function readCamera(preview: Locator): Promise<CameraDiagnostics> {
  return preview.evaluate((element) => {
    const numeric = (name: string) => Number(element.getAttribute(`data-tutorial-camera-${name}`));
    return {
      mode: element.getAttribute("data-tutorial-camera-mode") ?? "",
      occupancy: numeric("occupancy"),
      azimuth: numeric("azimuth"),
      polar: numeric("polar"),
      transition: numeric("transition"),
      distance: numeric("distance"),
      resetGeneration: numeric("reset-generation"),
    };
  });
}

function cameraPose(diagnostics: CameraDiagnostics) {
  return {
    mode: diagnostics.mode,
    occupancy: diagnostics.occupancy,
    azimuth: diagnostics.azimuth,
    polar: diagnostics.polar,
    transition: diagnostics.transition,
    distance: diagnostics.distance,
  };
}

async function waitForCameraIdle(preview: Locator) {
  let previous: ReturnType<typeof cameraPose> | undefined;
  let stableSamples = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = cameraPose(await readCamera(preview));
    if (previous
      && current.mode === previous.mode
      && Math.abs(current.occupancy - previous.occupancy) < 0.0005
      && wrappedAngleDifference(current.azimuth, previous.azimuth) < 0.0002
      && Math.abs(current.polar - previous.polar) < 0.0002
      && Math.abs(current.transition - previous.transition) < 0.0005
      && Math.abs(current.distance - previous.distance) < 0.0005) {
      stableSamples += 1;
      if (stableSamples >= 2) return current;
    } else {
      stableSamples = 0;
    }
    previous = current;
    await preview.page().waitForTimeout(100);
  }
  throw new Error("Tutorial camera diagnostics did not settle.");
}

async function setFoldPercentage(slider: Locator, percentage: number) {
  await slider.evaluate((element, nextPercentage) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("HTML range value setter is unavailable.");
    const previousStep = element.getAttribute("step");
    element.setAttribute("step", "any");
    setter.call(element, String(nextPercentage));
    element.dispatchEvent(new Event("input", {bubbles: true}));
    if (previousStep === null) element.removeAttribute("step");
    else element.setAttribute("step", previousStep);
  }, percentage);
}

async function dragCanvas(page: Page, canvas: Locator, start: readonly [number, number], end: readonly [number, number]) {
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Tutorial Canvas has no interactive bounds.");
  const point = ([x, y]: readonly [number, number]) => ({x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y});
  const from = point(start);
  const to = point(end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps: 16});
  await page.mouse.up();
}

async function renderedSubjectBounds(page: Page, canvasRegion: Locator) {
  const screenshot = await canvasRegion.screenshot();
  return page.evaluate(async (dataUrl) => {
    const source = new Image();
    source.src = dataUrl;
    await source.decode();
    const scratch = document.createElement("canvas");
    scratch.width = source.naturalWidth;
    scratch.height = source.naturalHeight;
    const context = scratch.getContext("2d", {willReadFrequently: true});
    if (!context) throw new Error("2D Canvas context is unavailable.");
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
    let minX = scratch.width;
    let minY = scratch.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < scratch.height; y += 1) {
      for (let x = 0; x < scratch.width; x += 1) {
        const offset = (y * scratch.width + x) * 4;
        const luminance = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
        if (pixels[offset + 3] <= 16 || luminance >= 215) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) throw new Error("Tutorial subject has no rendered pixels.");
    const renderedWidth = maxX - minX + 1;
    const renderedHeight = maxY - minY + 1;
    return {
      width: scratch.width,
      height: scratch.height,
      minX,
      minY,
      maxX,
      maxY,
      occupancy: Math.max(renderedWidth / scratch.width, renderedHeight / scratch.height),
      centerOffsetX: Math.abs((minX + maxX) / 2 - scratch.width / 2) / scratch.width,
      centerOffsetY: Math.abs((minY + maxY) / 2 - scratch.height / 2) / scratch.height,
    };
  }, `data:image/png;base64,${screenshot.toString("base64")}`);
}

function wrappedAngleDifference(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function transitionAt(progress: number) {
  const normalized = Math.max(0, Math.min(1, (progress - 0.3) / 0.22));
  return normalized * normalized * (3 - 2 * normalized);
}

async function readyPreview(page: Page) {
  const preview = page.locator(".tutorial-cardboard-preview");
  await expect(page.getByText("Draft ready", {exact: true})).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("[data-tutorial-panel-mesh]")).toHaveCount(12);
  await expect(preview).toHaveAttribute("data-tutorial-foundation-commit", FOUNDATION_COMMIT);
  await expect(preview).toHaveAttribute("data-tutorial-output-mode", OUTPUT_MODE);
  await expect(preview).toHaveAttribute("data-tutorial-panel-count", "12");
  await expect(preview).toHaveAttribute("data-tutorial-geometry-resources", "6");
  await expect(preview).toHaveAttribute("data-tutorial-camera-fit-valid", "true");
  return preview;
}

for (const fixture of [
  {name: "resolved Existing source", source: {mode: "EXISTING_BOX", measurementBasis: "INSIDE"}},
  {name: "fitting Common source", source: {mode: "COMMON_BOX", selectedCommonBoxId: "RSC-04"}},
]) {
  test(`${fixture.name} mounts one deterministic tutorial Canvas`, async ({page}) => {
    await seedPlanner(page, fixture.source);
    await page.goto("/plan/build");
    const preview = await readyPreview(page);
    await expect(preview).toHaveAttribute("data-tutorial-foundation-commit", FOUNDATION_COMMIT);
    await expect(preview).toHaveAttribute("data-tutorial-panel-count", "12");
    await expect(preview).toHaveAttribute("data-tutorial-progress", "0.000");
    await expect(preview).toHaveAttribute("data-tutorial-stage", "OPENING");
    await expect(page.locator("[data-tutorial-panel-mesh]")).toHaveCount(12);

    const normalized = await preview.evaluate((element) => [
      Number(element.getAttribute("data-tutorial-normalized-width")),
      Number(element.getAttribute("data-tutorial-normalized-length")),
      Number(element.getAttribute("data-tutorial-normalized-depth")),
    ]);
    expect(Math.max(...normalized)).toBe(80);
    const cacheSize = Number(await preview.getAttribute("data-tutorial-geometry-cache"));
    const resourceCount = Number(await preview.getAttribute("data-tutorial-geometry-resources"));
    expect(cacheSize).toBeGreaterThan(0);
    expect(cacheSize).toBeLessThanOrEqual(6);
    expect(resourceCount).toBe(6);
  });
}

for (const fixture of [
  {name: "exact", exact: true, source: {}},
  {name: "RSC-06", exact: false, source: {mode: "COMMON_BOX", selectedCommonBoxId: "RSC-06"}},
] as const) {
  test(`${fixture.name} initial camera is centered, unclipped, and occupies 65-80 percent`, async ({page}, testInfo) => {
    if (fixture.exact) await seedExactTutorial(page);
    else await seedPlanner(page, fixture.source);
    await page.goto("/plan/build");
    const preview = await readyPreview(page);
    const diagnostics = await readCamera(preview);
    expect(diagnostics.mode).toBe("TOP_DOWN");
    expect(diagnostics.transition).toBe(0);
    expect(diagnostics.occupancy).toBeGreaterThanOrEqual(0.65);
    expect(diagnostics.occupancy).toBeLessThanOrEqual(0.8);

    const canvasRegion = page.locator(".tutorial-cardboard-canvas");
    const subject = await renderedSubjectBounds(page, canvasRegion);
    expect(subject.occupancy).toBeGreaterThanOrEqual(0.65);
    expect(subject.occupancy).toBeLessThanOrEqual(0.8);
    expect(subject.centerOffsetX).toBeLessThan(0.08);
    expect(subject.centerOffsetY).toBeLessThan(0.08);
    expect(subject.minX).toBeGreaterThan(2);
    expect(subject.minY).toBeGreaterThan(2);
    expect(subject.maxX).toBeLessThan(subject.width - 3);
    expect(subject.maxY).toBeLessThan(subject.height - 3);
    await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-initial.png`)});
  });
}

for (const fixture of [
  {name: "exact", exact: true, source: {}},
  {name: "RSC-06", exact: false, source: {mode: "COMMON_BOX", selectedCommonBoxId: "RSC-06"}},
] as const) {
  test(`${fixture.name} midpoint samples install meaningful stable camera modes`, async ({page}, testInfo) => {
    if (fixture.exact) await seedExactTutorial(page);
    else await seedPlanner(page, fixture.source);
    await page.goto("/plan/build");
    const preview = await readyPreview(page);
    const slider = page.getByRole("slider", {name: "Fold position"});
    const canvasRegion = page.locator(".tutorial-cardboard-canvas");
    const screenshots: Buffer[] = [];

    for (const sample of CAMERA_MIDPOINTS) {
      await setFoldPercentage(slider, sample.percentage);
      await expect(preview).toHaveAttribute("data-tutorial-progress", sample.progress);
      await expect(preview).toHaveAttribute("data-tutorial-stage", sample.stage);
      await expect(preview).toHaveAttribute("data-tutorial-camera-mode", sample.mode);
      await expect(preview).toHaveAttribute("data-tutorial-camera-transition", transitionAt(sample.percentage / 100).toFixed(3));
      const diagnostics = await waitForCameraIdle(preview);
      expect(diagnostics.occupancy).toBeGreaterThanOrEqual(0.65);
      expect(diagnostics.occupancy).toBeLessThanOrEqual(0.8);
      expect(diagnostics.distance).toBeGreaterThan(0);
      screenshots.push(await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-${sample.percentage}.png`)}));
    }

    for (let index = 1; index < screenshots.length; index += 1) {
      expect(screenshots[index].equals(screenshots[index - 1])).toBe(false);
    }
  });
}

for (const fixture of [
  {name: "exact", exact: true, source: {}},
  {name: "RSC-06", exact: false, source: {mode: "COMMON_BOX", selectedCommonBoxId: "RSC-06"}},
] as const) {
  test(`${fixture.name} orbit, reset, polar limits, and progress canonicalization are stable`, async ({page}, testInfo) => {
    test.setTimeout(60_000);
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
    await page.addInitScript(() => {
      const tracked = window as typeof window & {__tutorialCameraWebglLosses?: number};
      tracked.__tutorialCameraWebglLosses = 0;
      document.addEventListener("webglcontextlost", () => {
        tracked.__tutorialCameraWebglLosses = (tracked.__tutorialCameraWebglLosses ?? 0) + 1;
      }, true);
    });
    if (fixture.exact) await seedExactTutorial(page);
    else await seedPlanner(page, fixture.source);
    await page.goto("/plan/build");
    const preview = await readyPreview(page);
    const slider = page.getByRole("slider", {name: "Fold position"});
    const canvas = page.locator(".tutorial-cardboard-canvas canvas");
    const canvasRegion = page.locator(".tutorial-cardboard-canvas");
    const reset = page.getByRole("button", {name: "Reset view"});

    await slider.fill("100");
    await expect(preview).toHaveAttribute("data-tutorial-camera-mode", "THREE_QUARTER");
    await expect(preview).toHaveAttribute("data-tutorial-camera-transition", "1.000");
    const canonical = await readCamera(preview);
    await waitForCameraIdle(preview);
    expect(canonical.azimuth).toBeCloseTo(Math.atan2(40, 110), 5);
    expect(canonical.polar).toBeCloseTo(Math.acos(90 / Math.hypot(40, 90, 110)), 5);
    const canonicalScreenshot = await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-canonical.png`)});
    await page.waitForTimeout(750);
    expect(cameraPose(await readCamera(preview))).toEqual(cameraPose(canonical));
    expect((await canvasRegion.screenshot()).equals(canonicalScreenshot)).toBe(true);

    await dragCanvas(page, canvas, [0.5, 0.5], [0.75, 0.5]);
    await expect.poll(async () => wrappedAngleDifference((await readCamera(preview)).azimuth, canonical.azimuth)).toBeGreaterThan(0.25);
    const horizontal = await readCamera(preview);
    expect(wrappedAngleDifference(horizontal.azimuth, canonical.azimuth)).toBeGreaterThan(0.25);
    expect(Math.abs(horizontal.polar - canonical.polar)).toBeLessThan(0.02);
    await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-horizontal.png`)});

    await reset.click();
    await expect(preview).toHaveAttribute("data-tutorial-camera-reset-generation", String(canonical.resetGeneration + 1));
    await expect.poll(async () => JSON.stringify(cameraPose(await readCamera(preview)))).toBe(JSON.stringify(cameraPose(canonical)));
    await waitForCameraIdle(preview);
    expect((await canvasRegion.screenshot()).equals(canonicalScreenshot)).toBe(true);

    await dragCanvas(page, canvas, [0.5, 0.2], [0.5, 0.8]);
    await expect.poll(async () => (await readCamera(preview)).polar).toBeCloseTo(0.05, 4);
    const polarMinimum = await readCamera(preview);
    expect(polarMinimum.polar).toBeCloseTo(0.05, 4);
    await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-polar-min.png`)});

    await reset.click();
    await expect.poll(async () => JSON.stringify(cameraPose(await readCamera(preview)))).toBe(JSON.stringify(cameraPose(canonical)));
    await dragCanvas(page, canvas, [0.5, 0.8], [0.5, 0.2]);
    await expect.poll(async () => (await readCamera(preview)).polar).toBeCloseTo(Math.PI / 2 - 0.035, 4);
    const polarMaximum = await readCamera(preview);
    expect(polarMaximum.polar).toBeCloseTo(Math.PI / 2 - 0.035, 4);
    expect(polarMaximum.polar).toBeLessThan(Math.PI / 2);
    await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-polar-max.png`)});

    await reset.click();
    await expect.poll(async () => JSON.stringify(cameraPose(await readCamera(preview)))).toBe(JSON.stringify(cameraPose(canonical)));
    await dragCanvas(page, canvas, [0.5, 0.5], [0.75, 0.5]);
    await expect.poll(async () => wrappedAngleDifference((await readCamera(preview)).azimuth, canonical.azimuth)).toBeGreaterThan(0.25);
    const userOrbit = await readCamera(preview);
    await setFoldPercentage(slider, 63);
    await expect(preview).toHaveAttribute("data-tutorial-progress", "0.630");
    await expect(preview).toHaveAttribute("data-tutorial-camera-mode", "THREE_QUARTER");
    await expect(preview).toHaveAttribute("data-tutorial-camera-transition", "1.000");
    await expect(preview).toHaveAttribute("data-tutorial-camera-azimuth", "0.34877");
    await expect(preview).toHaveAttribute("data-tutorial-camera-polar", "0.91529");
    const progressedCanonical = await readCamera(preview);
    expect(wrappedAngleDifference(progressedCanonical.azimuth, userOrbit.azimuth)).toBeGreaterThan(0.25);
    const progressedScreenshot = await canvasRegion.screenshot({path: testInfo.outputPath(`camera-${fixture.name}-progress-63.png`)});

    await reset.click();
    await expect(preview).toHaveAttribute("data-tutorial-camera-reset-generation", String(progressedCanonical.resetGeneration + 1));
    await expect.poll(async () => JSON.stringify(cameraPose(await readCamera(preview)))).toBe(JSON.stringify(cameraPose(progressedCanonical)));
    await page.waitForTimeout(750);
    expect(cameraPose(await readCamera(preview))).toEqual(cameraPose(progressedCanonical));
    expect((await canvasRegion.screenshot()).equals(progressedScreenshot)).toBe(true);
    expect(await page.evaluate(() => (window as typeof window & {__tutorialCameraWebglLosses?: number}).__tutorialCameraWebglLosses ?? 0)).toBe(0);
    expect(browserErrors).toEqual([]);
  });
}

test("responsive Canvas aspect changes refit the current canonical pose once", async ({page}, testInfo) => {
  await seedExactTutorial(page);
  await page.goto("/plan/build");
  const preview = await readyPreview(page);
  const slider = page.getByRole("slider", {name: "Fold position"});
  const canvasRegion = page.locator(".tutorial-cardboard-canvas");
  await slider.fill("100");
  await expect(preview).toHaveAttribute("data-tutorial-camera-mode", "THREE_QUARTER");
  const desktop = await readCamera(preview);
  const desktopBounds = await canvasRegion.boundingBox();
  if (!desktopBounds) throw new Error("Desktop tutorial Canvas has no bounds.");

  await page.setViewportSize({width: 390, height: 844});
  await expect.poll(async () => (await canvasRegion.boundingBox())?.width ?? 0).toBeLessThan(desktopBounds.width);
  await expect.poll(async () => Math.abs((await readCamera(preview)).distance - desktop.distance)).toBeGreaterThan(1);
  const mobile = await readCamera(preview);
  expect(mobile.mode).toBe("THREE_QUARTER");
  expect(mobile.transition).toBe(1);
  expect(mobile.occupancy).toBeGreaterThanOrEqual(0.65);
  expect(mobile.occupancy).toBeLessThanOrEqual(0.8);
  expect(mobile.azimuth).toBe(desktop.azimuth);
  expect(mobile.polar).toBe(desktop.polar);
  expect(mobile.resetGeneration).toBe(desktop.resetGeneration);
  const mobileScreenshot = await canvasRegion.screenshot({path: testInfo.outputPath("camera-exact-responsive-390.png")});
  await page.waitForTimeout(750);
  expect(cameraPose(await readCamera(preview))).toEqual(cameraPose(mobile));
  expect((await canvasRegion.screenshot()).equals(mobileScreenshot)).toBe(true);

  await page.setViewportSize({width: 1280, height: 720});
  await expect.poll(async () => (await readCamera(preview)).distance).toBe(desktop.distance);
  expect(cameraPose(await readCamera(preview))).toEqual(cameraPose(desktop));
});

test("exact tutorial proportions retain deterministic fold checkpoints", async ({page}, testInfo) => {
  testInfo.snapshotSuffix = "";
  await seedExactTutorial(page);
  await page.goto("/plan/build");
  const preview = await readyPreview(page);
  await expect(preview).toHaveAttribute("data-tutorial-geometry-cache", "6");
  await expect(preview).toHaveAttribute("data-tutorial-geometry-resources", "6");
  await expect(preview).toHaveAttribute("data-tutorial-normalized-length", "80.000");
  await expect(preview).toHaveAttribute("data-tutorial-normalized-width", "27.000");
  await expect(preview).toHaveAttribute("data-tutorial-normalized-depth", "45.000");
  const slider = page.getByRole("slider", {name: "Fold position"});
  const canvasRegion = page.locator(".tutorial-cardboard-canvas");
  const screenshots: Buffer[] = [];
  for (const checkpoint of FOLD_CHECKPOINTS) {
    await slider.fill(String(checkpoint.value));
    await expect(preview).toHaveAttribute("data-tutorial-progress", checkpoint.progress);
    await expect(preview).toHaveAttribute("data-tutorial-stage", checkpoint.stage);
    await expect(slider).toHaveAttribute("aria-valuetext", `${checkpoint.value} percent folded`);
    await page.waitForTimeout(100);
    screenshots.push(await canvasRegion.screenshot({
      path: testInfo.outputPath(`exact-80-27-45-fold-${checkpoint.value}.png`),
    }));
    if (checkpoint.value === 100) {
      await expect(canvasRegion).toHaveScreenshot("tutorial-exact-80-27-45-closed.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.02,
        scale: "css",
        threshold: 0.25,
      });
    }
  }
  for (let index = 1; index < screenshots.length; index += 1) {
    expect(screenshots[index].equals(screenshots[index - 1])).toBe(false);
  }
});

test("slider checkpoints change deterministic stages and produce distinct tutorial screenshots", async ({page}, testInfo) => {
  await seedPlanner(page, {mode: "COMMON_BOX", selectedCommonBoxId: "RSC-06"});
  await page.goto("/plan/build");
  const preview = await readyPreview(page);
  await expect(preview).toHaveAttribute("data-tutorial-geometry-cache", "3");
  const slider = page.getByRole("slider", {name: "Fold position"});
  const canvasRegion = page.locator(".tutorial-cardboard-canvas");
  const screenshots: Buffer[] = [];

  for (const checkpoint of FOLD_CHECKPOINTS) {
    await slider.fill(String(checkpoint.value));
    await expect(preview).toHaveAttribute("data-tutorial-progress", checkpoint.progress);
    await expect(preview).toHaveAttribute("data-tutorial-stage", checkpoint.stage);
    await expect(slider).toHaveAttribute("aria-valuetext", `${checkpoint.value} percent folded`);
    await page.waitForTimeout(100);
    screenshots.push(await canvasRegion.screenshot({path: testInfo.outputPath(`tutorial-fold-${checkpoint.value}.png`)}));
  }

  for (let index = 1; index < screenshots.length; index += 1) {
    expect(screenshots[index].equals(screenshots[index - 1])).toBe(false);
  }
});

test("repeated Build route mounts release and reacquire bounded resources without browser or WebGL errors", async ({page}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    const tracked = window as typeof window & {__tutorialWebglLosses?: number};
    tracked.__tutorialWebglLosses = 0;
    document.addEventListener("webglcontextlost", () => {
      tracked.__tutorialWebglLosses = (tracked.__tutorialWebglLosses ?? 0) + 1;
    }, true);
  });
  await seedPlanner(page);
  await page.goto("/plan/build");

  const resourceCounts: number[] = [];
  const cacheSizes: number[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const preview = await readyPreview(page);
    resourceCounts.push(Number(await preview.getAttribute("data-tutorial-geometry-resources")));
    cacheSizes.push(Number(await preview.getAttribute("data-tutorial-geometry-cache")));
    await page.locator(".planner-progress").getByRole("link", {name: /Fit/}).click();
    await expect(page).toHaveURL(/\/plan\/fit$/);
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.locator(".planner-progress").getByRole("link", {name: /Build/}).click();
    await expect(page).toHaveURL(/\/plan\/build$/);
  }

  expect(resourceCounts).toEqual([6, 6, 6]);
  expect(cacheSizes).toEqual([6, 6, 6]);
  expect(await page.evaluate(() => (window as typeof window & {__tutorialWebglLosses?: number}).__tutorialWebglLosses ?? 0)).toBe(0);
  expect(browserErrors).toEqual([]);
});

for (const fixture of [
  {name: "flat-sheet source", source: {mode: "FLAT_SHEET"}},
  {name: "unresolved Existing measurements", source: {mode: "EXISTING_BOX", measurementBasis: "NOT_SURE"}},
  {name: "selected too-small Common source", source: {mode: "COMMON_BOX", selectedCommonBoxId: "RSC-01"}},
]) {
  test(`${fixture.name} remains Canvas-free on Build`, async ({page}) => {
    await seedPlanner(page, fixture.source);
    await page.goto("/plan/build");
    await expect(page.getByText("Draft ready", {exact: true})).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".tutorial-cardboard-preview")).toHaveCount(0);
  });
}
