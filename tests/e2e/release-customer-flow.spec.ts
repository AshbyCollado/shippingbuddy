import {expect, test, type Page} from "@playwright/test";

const key = "shipping-buddy:planner-draft:v1";
const draft = {state: {draft: {schemaVersion: 1, draftId: "release-flow", updatedAt: "2026-08-11T00:00:00.000Z", unit: "in", protectionGoal: 2,
  item: {dimensions: {lengthMm: 406.4, widthMm: 406.4, heightMm: 406.4}, shapeProfile: {kind: "RECTANGULAR_BOX"}, weightKg: 3.2, fragility: "MODERATE", cushioning: {leftMm: 25.4, rightMm: 25.4, frontMm: 25.4, backMm: 25.4, bottomMm: 25.4, topMm: 25.4}, tolerance: {lengthTotalMm: 6, widthTotalMm: 6, heightTotalMm: 6}, allowRotation: true, keepUpright: false},
  source: {mode: "FLAT_SHEET", existingBox: {lengthMm: 508, widthMm: 508, heightMm: 508}, measurementBasis: "INSIDE", selectedCommonBoxId: "RSC-04", sheet: {lengthMm: 2032, widthMm: 1524}, pattern: "WRAP_BOX_V1"},
}, savedBoxes: []}, version: 1};

async function seed(page: Page) { await page.addInitScript(({key, stored}) => localStorage.setItem(key, JSON.stringify(stored)), {key, stored: draft}); }

test("release customer flow reaches a fitting Flat build with the canonical protected cube", async ({page}) => {
  await seed(page); await page.goto("/"); await page.getByRole("link", {name: /Plan my box/}).click();
  for (const route of ["protection", "source", "fit", "build"]) { await page.getByRole("link", {name: /Next/}).click(); await expect(page).toHaveURL(new RegExp(`/plan/${route}$`)); }
  await expect(page.getByText("18.24 × 18.24 × 18.24 in", {exact: true})).toBeVisible();
  const preview = page.locator(".cut-and-fold-preview"); await expect(preview).toBeVisible(); await expect(page.locator("canvas")).toHaveCount(1);
  await expect(preview).toHaveAttribute("data-construction-draw-calls", /^(?:[0-9]|[1-3][0-9]|40)$/);
  await expect(preview).toHaveAttribute("data-construction-textures", "0"); await expect(preview).toHaveAttribute("data-construction-live-references", "15");
  for (const label of [/Check the sheet/, /Press the fold/, /Cut the generated/, /Clear the loose/, /Fold the tabs/, /Tape the centre/, /Remeasure the/]) { await page.getByRole("navigation", {name: "Build actions"}).getByRole("button", {name: label}).click(); await expect(preview).toHaveAttribute("data-construction-playback", "PAUSED"); }
});
