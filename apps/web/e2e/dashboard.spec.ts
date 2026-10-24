import { expect, test, type Page } from "@playwright/test";

/**
 * Overview (`/dashboard`) in a real rendered browser.
 *
 * The centrepiece is the chart-persistence regression: three defects used to
 * make a chart appear and then disappear (a derived filter written back into
 * the URL, a query key built from the raw filter object, and `isLoading`
 * blanking a loaded chart during a background refetch). Unit tests cover the
 * rules; this test proves the *rendered* chart survives a scope change,
 * watching the DOM continuously from just before the interaction until the
 * refetch has settled.
 */

/** Watch the document and report whether any Recharts wrapper ever unmounted. */
async function watchForChartLoss(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = { lost: false, watching: true };
    (window as unknown as { __chartWatch: typeof state }).__chartWatch = state;
    const observer = new MutationObserver(() => {
      if (!state.watching) return;
      if (!document.querySelector(".recharts-wrapper")) state.lost = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function chartWasNeverLost(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __chartWatch?: { lost: boolean; watching: boolean } }).__chartWatch?.lost === false,
  );
}

async function stopWatching(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as unknown as { __chartWatch?: { watching: boolean } }).__chartWatch;
    if (state) state.watching = false;
  });
}

test.describe("Overview", () => {
  test("loads the opening viewport: heading, scope control, KPIs and charts", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: /National Crop Intelligence Overview/i }),
    ).toBeVisible();

    // Compact period scope: the all-periods scope plus the year control.
    await expect(page.getByRole("button", { name: "All published periods", exact: true })).toBeVisible();
    await expect(page.getByLabel("Year", { exact: true })).toBeVisible();

    // Headline KPIs and at least one real chart render from API data.
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Scope: /).first()).toBeVisible();
  });

  test("scope line and charts stay on screen across a period change", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });

    // Continuous DOM watch from before the interaction until after the refetch.
    await watchForChartLoss(page);

    // Pick a published year, then one of its seasons: one canonical period.
    // The response waiter is attached *before* the interaction so it cannot
    // race a request that has already completed.
    await page.getByLabel("Year", { exact: true }).selectOption("2025");
    await expect(page).toHaveURL(/year=2025/);
    const overviewResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/dashboard/overview") &&
        response.url().includes("period_code=2025B") &&
        response.status() === 200,
    );
    await page.getByLabel("Season", { exact: true }).selectOption("B");
    await expect(page).toHaveURL(/period=2025B/);
    await overviewResponse;
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Scope: 2025 Season B")).toBeVisible();

    // The regression, asserted directly: the chart never left the document at
    // any point during the change — not even for one mutation.
    expect(await chartWasNeverLost(page)).toBe(true);
    await stopWatching(page);
  });

  test("rapid period switching keeps exactly one scope description in the URL", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });

    await page.getByLabel("Year", { exact: true }).selectOption("2024");
    await page.getByLabel("Season", { exact: true }).selectOption("A");
    await expect(page).toHaveURL(/period=2024A/);

    // The old year/season pair must be gone: one description of the scope.
    const url = new URL(page.url());
    expect(url.searchParams.get("period")).toBe("2024A");
    expect(url.searchParams.get("year")).toBeNull();
    expect(url.searchParams.get("season")).toBeNull();

    // Switching again stays canonical: re-pick the year (a pinned release
    // clears it, by design), then another season.
    await page.getByLabel("Year", { exact: true }).selectOption("2024");
    await expect(page).toHaveURL(/year=2024/);
    await page.getByLabel("Season", { exact: true }).selectOption("B");
    await expect(page).toHaveURL(/period=2024B/);
    const afterUrl = new URL(page.url());
    expect(afterUrl.searchParams.get("year")).toBeNull();
    expect(afterUrl.searchParams.get("season")).toBeNull();
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });
  });

  test("coverage popover lists the published axis, one interaction away", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Coverage/i }).first().click();

    const dialog = page.getByRole("dialog", { name: "Publication coverage" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/202[2-6]/);
  });

  test("reset returns to the all-published-periods scope", async ({ page }) => {
    await page.goto("/dashboard?period=2025B");
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });

    // The responsive filter bar calls the action "Clear all"; it writes the
    // explicit history scope on both desktop and mobile layouts.
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(page).toHaveURL(/view=history/);
    const url = new URL(page.url());
    expect(url.searchParams.get("period")).toBeNull();
  });
});
