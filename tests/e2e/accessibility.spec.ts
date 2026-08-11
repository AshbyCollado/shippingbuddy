import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";
import type {PlannerDraft} from "@/planner/draft";

const key = "shipping-buddy:planner-draft:v1";
const baseDraft: PlannerDraft = {schemaVersion: 1, draftId: "issue14-axe", updatedAt: "2026-08-11T00:00:00.000Z", unit: "in", protectionGoal: 2,
  item: {dimensions: {lengthMm: 406.4, widthMm: 406.4, heightMm: 406.4}, shapeProfile: {kind: "RECTANGULAR_BOX" as const}, weightKg: 3.2, fragility: "MODERATE" as const, cushioning: {leftMm: 25.4, rightMm: 25.4, frontMm: 25.4, backMm: 25.4, bottomMm: 25.4, topMm: 25.4}, tolerance: {lengthTotalMm: 6, widthTotalMm: 6, heightTotalMm: 6}, allowRotation: true, keepUpright: false},
  source: {mode: "EXISTING_BOX" as const, existingBox: {lengthMm: 508, widthMm: 508, heightMm: 508}, measurementBasis: "INSIDE" as const, selectedCommonBoxId: "RSC-04", sheet: {lengthMm: 2032, widthMm: 1524}, pattern: "WRAP_BOX_V1" as const},
};

async function seed(page: Page, draft: PlannerDraft) {
  const stored = {state: {draft, savedBoxes: []}, version: 1};
  await page.addInitScript(({storageKey, value}) => window.localStorage.setItem(storageKey, JSON.stringify(value)), {storageKey: key, value: stored});
}

async function expectNoSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({page}).analyze();
  expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
}

function sourceDraft(source: Partial<PlannerDraft["source"]>): PlannerDraft {
  return {...baseDraft, source: {...baseDraft.source, ...source}};
}

test("home and every planner question route have no serious or critical Axe violations", async ({page}) => {
  for (const route of ["/", "/plan/item", "/plan/protection", "/plan/source", "/plan/fit", "/plan/build"]) { await page.goto(route); await expectNoSeriousOrCritical(page); }
});

test("fitting Flat, Common, and Existing Builds have no serious or critical Axe violations", async ({page}) => {
  for (const draft of [
    sourceDraft({mode: "FLAT_SHEET", sheet: {lengthMm: 2032, widthMm: 1524}}),
    sourceDraft({mode: "COMMON_BOX", selectedCommonBoxId: "RSC-06"}),
    baseDraft,
  ]) {
    await seed(page, draft); await page.goto("/plan/build"); await expectNoSeriousOrCritical(page);
  }
});

test("blocked Existing, Common, and Flat Builds have no serious or critical Axe violations", async ({page}) => {
  for (const draft of [
    sourceDraft({mode: "EXISTING_BOX", existingBox: {lengthMm: 100, widthMm: 100, heightMm: 100}, measurementBasis: "NOT_SURE"}),
    sourceDraft({mode: "COMMON_BOX", selectedCommonBoxId: "RSC-01"}),
    sourceDraft({mode: "FLAT_SHEET", sheet: {lengthMm: 100, widthMm: 100}}),
  ]) {
    await seed(page, draft); await page.goto("/plan/build"); await expectNoSeriousOrCritical(page);
  }
});

test("320 Flat and 390 RSC Builds have no serious or critical Axe violations", async ({page}) => {
  await page.setViewportSize({width: 320, height: 800}); await seed(page, sourceDraft({mode: "FLAT_SHEET"})); await page.goto("/plan/build"); await expectNoSeriousOrCritical(page);
  await page.setViewportSize({width: 390, height: 844}); await seed(page, baseDraft); await page.goto("/plan/build"); await expectNoSeriousOrCritical(page);
});
