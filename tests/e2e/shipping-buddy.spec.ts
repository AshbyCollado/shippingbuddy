import {expect, test} from "@playwright/test";

test("renders a usable plan and keeps the result views connected", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", {name: "Find a box — or build one that fits."})).toBeVisible();
  await expect(page.getByRole("img", {name: /3D packaging preview/})).toBeVisible();
  await expect(page.getByRole("heading", {name: "What are you starting with?"})).toBeVisible();
  await expect(page.locator(".source-detail-copy")).toContainText("A blank sheet you will cut and fold.");
  await page.getByRole("tab", {name: "Cutting layout"}).click();
  await expect(page.getByRole("heading", {name: "Calculated cutting layout"})).toBeVisible();
  await page.getByRole("tab", {name: "Instructions"}).click();
  await expect(page.getByRole("heading", {name: "Four calm, numbered steps"})).toBeVisible();
});

test("uses clean inch checkpoints and keeps the mm view synchronized", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const length = page.getByRole("spinbutton", {name: "Length in", exact: true});
  await expect(length).toHaveValue("14");
  await page.getByRole("button", {name: "Increase Length"}).click();
  await expect(length).toHaveValue("14.25");
  await page.getByRole("button", {name: "Increase Length"}).click();
  await expect(length).toHaveValue("14.50");
  await length.click();
  await page.mouse.wheel(0, -100);
  await expect(length).toHaveValue("14.75");
  await page.getByRole("button", {name: "mm", exact: true}).click();
  await expect(page.getByRole("spinbutton", {name: "Length mm", exact: true})).toHaveValue("374.65");
  await page.getByRole("button", {name: "in", exact: true}).click();
  await expect(page.getByRole("spinbutton", {name: "Length in", exact: true})).toHaveValue("14.75");
});

test("exports the calculated cutting layout", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: "Export SVG", exact: true}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shipping-buddy-wrap-box.svg");
});

test("automatically expands an undersized sheet to a safe quarter-inch stock size", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("spinbutton", {name: "Length in", exact: true}).fill("20");
  await page.getByRole("spinbutton", {name: "Length in", exact: true}).press("Tab");
  const sheetLength = page.getByRole("spinbutton", {name: "Sheet length in", exact: true});
  const sheetWidth = page.getByRole("spinbutton", {name: "Sheet width in", exact: true});
  await expect(sheetLength).toHaveValue("51.75");
  await expect(sheetWidth).toHaveValue("64");
  await expect(page.getByRole("status")).toContainText("Sheet automatically expanded to");
  await expect(page.getByRole("heading", {name: "A wrap box that fits your item"})).toBeVisible();
  await sheetLength.fill("19.69");
  await sheetLength.press("Tab");
  await expect(sheetLength).toHaveValue("51.75");
});

test("uses integer protection goals and explains advanced clearance", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const goal = page.getByRole("slider", {name: "Protection goal"});
  await expect(goal).toHaveValue("2");
  await goal.press("ArrowRight");
  await expect(goal).toHaveValue("3");
  await expect(page.getByText("Goal 3 · 1.50 in on every face", {exact: true})).toBeVisible();
  await page.getByRole("button", {name: /Extra fit clearance/}).click();
  await expect(page.getByText("Adds empty room beyond cushioning so the item is not squeezed.", {exact: false})).toBeVisible();
  await expect(page.getByRole("spinbutton", {name: "Extra room in", exact: true})).toHaveValue("0.24");
});

test("stays within the viewport at compact mobile width", async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const bounds = await page.evaluate(() => ({scrollWidth: document.body.scrollWidth, viewportWidth: document.documentElement.clientWidth}));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewportWidth);
});

test("keeps each chosen RSC source separate from cutting geometry", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", {name: /Common box Choose a representative/}).click();
  const catalog = page.getByRole("radiogroup", {name: "Representative RSC catalog"});
  await expect(catalog.getByRole("radio")).toHaveCount(5);
  await catalog.getByRole("radio", {name: /Representative RSC · Small/}).click();
  await expect(page.getByText(/Representative RSC · Small is too small/)).toBeVisible();
  await catalog.getByRole("radio", {name: /Representative RSC · Large/}).click();
  await expect(page.getByRole("heading", {name: "An unchanged box that fits your item"})).toBeVisible();
  await page.getByRole("tab", {name: "Cutting layout"}).click();
  await expect(page.getByRole("heading", {name: "Assembly diagram"})).toBeVisible();
  await expect(page.getByText("Cutting export unavailable")).toBeVisible();
  await page.getByRole("button", {name: /Existing box Enter the inside/}).click();
  await expect(page.getByRole("spinbutton", {name: "Inside length in"})).toBeVisible();
});

test("keeps every common-box card selectable and explains fit or rejection", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", {name: /Common box Choose a representative/}).click();
  const catalog = page.getByRole("radiogroup", {name: "Representative RSC catalog"});
  const cards = catalog.getByRole("radio");
  await expect(cards).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const card = cards.nth(index);
    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    await expect(card.locator(".catalog-fit")).toBeVisible();
    const fitLabel = await card.locator(".catalog-fit").innerText();
    if (fitLabel.startsWith("Fits")) await expect(page.getByRole("heading", {name: "An unchanged box that fits your item"})).toBeVisible();
    else await expect(page.getByRole("heading", {name: "That box does not fit"})).toBeVisible();
  }
});

test("walks the staged animation through semantic checkpoints", async ({page}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const preview = page.getByRole("img", {name: /3D packaging preview/});
  const progress = page.getByRole("slider", {name: "Animation progress"});
  await expect(preview).toHaveAttribute("aria-label", "3D packaging preview at 0 percent");
  await expect(page.getByText("Reveal the sheet and item", {exact: true})).toBeVisible();
  await expect(page.locator(".scene-stage-3d canvas")).toBeVisible();
  await progress.fill("0.35");
  await expect(page.locator(".scene-stage-3d")).toHaveAttribute("data-animation-stage", "cutting");
  expect(Number(await page.locator(".scene-stage-3d").getAttribute("data-cut-progress"))).toBeGreaterThan(0);
  await page.getByRole("button", {name: "Replay"}).click();
  await page.getByRole("button", {name: "Next step"}).click();
  await expect(page.getByText("Show the protected envelope", {exact: true})).toBeVisible();
  for (let step = 0; step < 9; step += 1) await page.getByRole("button", {name: "Next step"}).click();
  await expect(preview).toHaveAttribute("aria-label", "3D packaging preview at 100 percent");
  await expect(page.getByText("Finished calculated package", {exact: true})).toBeVisible();
  await expect(page.locator(".scene-stage-3d")).toHaveAttribute("data-animation-stage", "present");
  await expect(page.locator(".scene-stage-3d")).toHaveAttribute("data-seal-progress", "1.000");
  await expect(page.locator(".scene-stage-3d")).toHaveAttribute("data-sealed-seam", "visible");
  await expect(page.locator(".scene-stage-3d")).toHaveAttribute("data-final-closed", "true");
  await expect(page.locator(".scene-stage-3d")).toHaveAttribute("data-detached-panels", "0");
  expect(Number(await page.locator(".scene-stage-3d").getAttribute("data-cut-count"))).toBeGreaterThan(6);
  await expect(page.getByRole("button", {name: "Next step"})).toBeDisabled();
  expect(consoleErrors).toEqual([]);
});

test("captures every wrap checkpoint with generated cut and scrap geometry", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const expectedCaptions = [
    "Reveal the sheet and item",
    "Show the protected envelope",
    "Mark score lines",
    "Trace the cut boundaries",
    "Cut the net",
    "Clear the scrap",
    "Fold the joining tabs",
    "Raise the side walls",
    "Close the top flaps",
    "Tape the centre seam",
    "Finished calculated package",
  ];
  const next = page.getByRole("button", {name: "Next step"});
  for (let index = 0; index < expectedCaptions.length; index += 1) {
    await expect(page.getByText(expectedCaptions[index], {exact: true})).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({path: `test-results/wrap-checkpoint-${String(index + 1).padStart(2, "0")}.png`});
    if (index < expectedCaptions.length - 1) await next.click();
  }
});

test("existing-box animation starts with the box and never shows cut or scrap stages", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", {name: /Existing box Enter the inside/}).click();
  const preview = page.locator(".scene-stage-3d");
  await expect(page.getByText("Show your existing box", {exact: true})).toBeVisible();
  await expect(preview).toHaveAttribute("data-cut-count", "0");
  await expect(preview).toHaveAttribute("data-scrap-count", "0");
  await page.screenshot({path: "test-results/existing-box-start.png"});
  await page.getByRole("button", {name: "Next step"}).click();
  await expect(page.getByText("Place the protected item", {exact: true})).toBeVisible();
});

test("play advances, pause holds, and speed selection completes the animation", async ({page}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const progress = page.getByRole("slider", {name: "Animation progress"});
  await page.getByRole("button", {name: "Play animation"}).click();
  await page.waitForTimeout(450);
  expect(Number(await progress.inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", {name: "Pause animation"}).click();
  const pausedValue = await progress.inputValue();
  await page.waitForTimeout(350);
  await expect(progress).toHaveValue(pausedValue);
  await page.getByRole("button", {name: "Replay"}).click();
  const speed = page.getByRole("combobox", {name: "Playback speed"});
  await speed.selectOption("2");
  await page.getByRole("button", {name: "Play animation"}).click();
  await page.waitForTimeout(4_900);
  await expect(progress).toHaveValue("1");
});
