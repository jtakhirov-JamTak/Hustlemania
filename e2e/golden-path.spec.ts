import { expect, test } from "@playwright/test";
import { deleteUser, seedUser, signInViaMagicLink } from "./helpers";

test.describe.configure({ mode: "serial" });

test("unauthenticated /sprints redirects to /login", async ({ page }) => {
  await page.goto("/sprints");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("an email without an account gets an error and no user is created", async ({ page }) => {
  const stranger = `stranger-${Date.now()}@test.local`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(stranger);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("This email is not on the invite list.");
  await expect(page.getByLabel("Email")).toHaveValue(stranger);
});

test.describe("golden path", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await seedUser("golden");
  });

  test.afterAll(async () => {
    await deleteUser(user?.id);
  });

  test("sign in → Vision → start Sprint → Day 1 → close → locked after reload", async ({ page }, testInfo) => {
    const isPhone = testInfo.project.name === "phone";

    await signInViaMagicLink(page, user.email);

    // Visual language checks (SPEC F1): font, radius, hero size, sidebar width.
    await expect(page.getByTestId("empty-state")).toBeVisible();
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain("Plus Jakarta Sans");
    const radius = await page.locator(".card").first().evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe("20px");
    const sidebarWidth = await page.locator("[data-sidebar]").evaluate((el) => getComputedStyle(el).width);
    expect(sidebarWidth).toBe(isPhone ? "390px" : "266px");

    // Empty state: no vision yet → write it.
    await expect(page.getByRole("heading", { name: "No sprint can start here yet" })).toBeVisible();
    await page.getByRole("link", { name: /Write the .* vision/ }).click();
    await expect(page).toHaveURL(/\/vision\/health$/);
    await page.getByLabel("The vision").fill("In a year I run three times a week and sleep seven hours.");
    await page.getByRole("button", { name: "Save vision" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // Back to Sprints: the area is now Ready → create a sprint.
    await page.goto("/sprints/health");
    await page.getByRole("link", { name: "Create a Health sprint" }).click();
    await expect(page).toHaveURL(/\/sprints\/new\?area=health$/);

    // Step 1
    await page.getByLabel("Sprint outcome").fill("Save $8,000 toward the emergency fund");
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 2 (money, USD)
    await page.getByLabel(/Sprint goal/).fill("8000");
    await page.getByLabel("Usage 1 label").fill("Rent");
    await page.getByLabel("Usage 1 amount").fill("2800");
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 3
    await page.getByRole("button", { name: "Confidence 7" }).click();
    await page.getByLabel("Why this sprint matters").fill("A cushion buys calm.");
    await page.getByLabel(/Celebration/).fill("Dinner at the lake");
    await page.getByLabel(/Mantra/).fill("Boring money is the money that stays.");
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 4: 14 targets sum to the goal; rounding note present (8000 / 14 is uneven).
    await expect(page.getByText("Planned 8,000 USD · Goal 8,000 USD · balanced")).toBeVisible();
    await expect(page.getByText(/does not split evenly/)).toBeVisible();
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Start sprint" }).click();

    // Today, Day 1.
    await expect(page).toHaveURL(/\/sprints\/health$/);
    await expect(page.getByTestId("day-label")).toHaveText("Day 1 / 14");
    const hero = page.locator("[data-hero]");
    await expect(hero).toHaveText("572");
    expect(await hero.evaluate((el) => getComputedStyle(el).fontSize)).toBe(isPhone ? "64px" : "92px");
    await expect(page.getByTestId("day-strip").locator("[data-day]")).toHaveCount(14);
    // Per-day remaining is a whole currency unit (8000 / 14 rounds up to 572), never cents.
    await expect(page.getByTestId("target-hero")).toContainText("14 days left · 572 USD a day");
    await expect(page.getByRole("blockquote")).toHaveText("Boring money is the money that stays.");

    // Rule 28: no HIT/MISS labels anywhere in the rendered DOM.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\b(HIT|MISS)\b/);

    // The page never scrolls sideways (the 14-day strip scrolls inside its own box).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/today-${testInfo.project.name}.png`, fullPage: true });

    // Daily Intention autosaves on blur and survives a reload.
    await page.getByLabel("Daily intention").fill("Today I will move the $600 before lunch.");
    await page.getByLabel("Daily intention").blur();
    await expect(page.getByTestId("intention-card").getByText("Saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Daily intention")).toHaveValue("Today I will move the $600 before lunch.");

    // Close Day 1 with an actual above target → green result, then locked.
    await page.getByRole("button", { name: "Enter actual result" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Today's target was 572 USD.", { exact: false })).toBeVisible();
    await dialog.getByLabel("Actual result").fill("600");
    await dialog.getByRole("button", { name: "Close the day" }).click();

    const result = page.getByTestId("result-actual");
    await expect(result).toHaveText("600");
    await expect(result).toHaveAttribute("data-state", "at-or-above");
    expect(await result.evaluate((el) => getComputedStyle(el).fontSize)).toBe("78px");
    await expect(page.getByRole("dialog").getByText("Tomorrow's target", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to today" }).click();

    await expect(page.getByText("Day closed · locked")).toBeVisible();
    await expect(page.getByTestId("closed-actual")).toHaveText("600 USD");
    await expect(page.getByTestId("closed-actual")).toHaveAttribute("data-state", "at-or-above");
    await expect(page.getByTestId("day-strip").locator('[data-day="1"]')).toHaveAttribute("data-state", "at-or-above");

    // Reload: still locked; intention read-only; the close button is gone.
    await page.reload();
    await expect(page.getByText("Day closed · locked")).toBeVisible();
    await expect(page.getByLabel("Daily intention")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enter actual result" })).toHaveCount(0);

    // Sidebar reflects the sprint.
    await expect(page.locator("[data-sidebar]").getByText("Day 1/14")).toBeVisible();
  });
});
