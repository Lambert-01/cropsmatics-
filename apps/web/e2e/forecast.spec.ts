import { expect, test } from "@playwright/test";

test("canonical forecast selection renders and has no horizontal overflow", async ({ page }, info) => {
  await page.goto("/interventions?period=2026B&crop=Maize&district=Bugesera&defaults=none");
  await page.getByRole("tab", { name: "Predictions", exact: true }).click();
  const workspace = page.getByRole("region", { name: "Forecasts", exact: true });
  await expect(workspace.getByText("Maize / Season B / Bugesera", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Maize / yield / Bugesera / Season B", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Maize / yield / Bugesera / Season A", { exact: true })).toHaveCount(0);
  await workspace.getByText("Why withheld?", { exact: true }).click();
  await expect(workspace.getByText(/published record is too short/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await workspace.screenshot({ path: info.outputPath("forecast-scoped.png") });
});

test("a forecast request failure has a visible retry action", async ({ page }) => {
  await page.route("**/analytics/forecast-status?**", (route) => route.abort("failed"));
  await page.goto("/interventions?period=2026B&crop=Maize&defaults=none");
  await page.getByRole("tab", { name: "Predictions", exact: true }).click();
  const workspace = page.getByRole("region", { name: "Forecasts", exact: true });
  await expect(workspace.getByText("Forecast information could not be loaded.", { exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: /retry/i })).toBeVisible();
  await expect(workspace.getByText("No forecast target covers this selection", { exact: true })).toHaveCount(0);
});

test("predictions remain reachable when overview fails", async ({ page }) => {
  await page.route("**/dashboard/overview?**", (route) => route.abort("failed"));
  await page.goto("/interventions?period=2026B&crop=Maize&defaults=none");
  await expect(page.getByRole("tab", { name: "Predictions", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Forecasts", exact: true })
    .getByText("Forecast outlook", { exact: true })).toBeVisible();
});
