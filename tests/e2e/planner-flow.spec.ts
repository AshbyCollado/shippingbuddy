import {expect, test} from "@playwright/test";

test("homepage CTA walks the question-only route shell to the review boundary", async ({page}) => {
  await page.goto("/");
  await page.getByRole("link", {name: /Plan my box/}).click();
  await expect(page).toHaveURL(/\/plan\/item$/);
  await expect(page.getByRole("heading", {name: "What are you packing?"})).toBeVisible();

  await page.getByRole("link", {name: /Next/}).click();
  await expect(page).toHaveURL(/\/plan\/protection$/);
  await expect(page.getByRole("heading", {name: "How protected should it be?"})).toBeVisible();

  await page.getByRole("link", {name: /Next/}).click();
  await expect(page).toHaveURL(/\/plan\/source$/);
  await expect(page.getByRole("button", {name: /A box I have/})).toBeVisible();
  await expect(page.getByRole("button", {name: /A standard box/})).toBeVisible();
  await expect(page.getByRole("button", {name: /Use flattened cardboard/})).toHaveCount(0);
  await page.getByRole("button", {name: /Advanced: flattened cardboard/}).click();
  await expect(page.getByRole("button", {name: /Use flattened cardboard/})).toBeVisible();

  await page.getByRole("link", {name: /Next/}).click();
  await expect(page).toHaveURL(/\/plan\/fit$/);
  await expect(page.getByRole("heading", {name: "Check the space around your item"})).toBeVisible();

  await page.getByRole("link", {name: /Next/}).click();
  await expect(page).toHaveURL(/\/plan\/build$/);
  await expect(page.getByRole("heading", {name: "Ready to build your plan"})).toBeVisible();
  await expect(page.getByText("Measurements captured", {exact: true})).toBeVisible();
});

test("answers survive browser Back and a reload", async ({page}) => {
  await page.goto("/plan/item");
  const length = page.getByRole("spinbutton", {name: "Length in", exact: true});
  await expect(length).toBeEnabled();
  await length.fill("15");
  await length.press("Tab");
  await page.getByRole("link", {name: /Next/}).click();
  await expect(page.getByRole("heading", {name: "How protected should it be?"})).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/item$/);
  await expect(length).toHaveValue("15");

  await page.getByRole("link", {name: /Next/}).click();
  await expect(page).toHaveURL(/\/plan\/protection$/);
  await expect(page.getByRole("heading", {name: "How protected should it be?"})).toBeVisible();
  await page.getByRole("link", {name: /Next/}).click();
  await expect(page).toHaveURL(/\/plan\/source$/);
  await page.getByRole("button", {name: /A standard box/}).click();
  await page.reload();
  await expect(page.getByRole("button", {name: /A standard box/})).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", {name: /Item/}).first().click();
  await expect(page.getByRole("spinbutton", {name: "Length in", exact: true})).toHaveValue("15");
});

test("planner routes stay free of canvas/WebGL and expose hydration-safe server controls", async ({page, request}) => {
  const initialMarkup = await request.get("/plan/item");
  expect(await initialMarkup.text()).toContain('disabled=""');

  for (const route of ["item", "protection", "source", "fit", "build"]) {
    await page.goto(`/plan/${route}`);
    await expect(page.locator("canvas")).toHaveCount(0);
  }

  await expect(page.getByRole("heading", {name: "Ready to build your plan"})).toBeVisible();
  await expect(page.getByText("visual build instructions", {exact: false})).toBeVisible();
});

test("320px and 390px planner pages do not horizontally overflow", async ({page}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height: 800});
    for (const route of ["item", "protection", "source", "fit", "build"]) {
      await page.goto(`/plan/${route}`);
      await expect(page.getByText("Draft ready", {exact: true})).toBeVisible();
      const widths = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    }
  }
});
