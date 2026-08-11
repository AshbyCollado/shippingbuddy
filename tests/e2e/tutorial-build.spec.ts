import {expect, test, type Page} from "@playwright/test";

const STORAGE_KEY = "shipping-buddy:planner-draft:v1";
const FOUNDATION_COMMIT = "ba9e8b6b73044d48e4c362ecfbe1a3ffe504adf8";
const OUTPUT_MODE = "legacy-linear-no-tone-mapping";
const FOLD_CHECKPOINTS = [
  {value: 0, progress: "0.000", stage: "OPENING"},
  {value: 37, progress: "0.370", stage: "LOWER_FLAPS"},
  {value: 65, progress: "0.650", stage: "UPPER_FLAPS"},
  {value: 100, progress: "1.000", stage: "CLOSURE"},
] as const;

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

test("exact tutorial proportions retain deterministic fold checkpoints", async ({page}, testInfo) => {
  testInfo.snapshotSuffix = "";
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
