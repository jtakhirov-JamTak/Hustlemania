import { expect, test } from "@playwright/test";
import { admin, deleteUser, seedUser, signInViaMagicLink } from "./helpers";

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
    const summary = page.getByTestId("plan-summary");
    await expect(summary).toContainText("Planned 8,000 USD");
    await expect(summary).toContainText("Goal · locked 8,000 USD");
    await expect(page.getByTestId("plan-delta")).toHaveText("Balanced");
    await expect(page.getByText(/does not split evenly/)).toBeVisible();

    // F3: Custom mode — every day is editable before the start, today included. Zeroing
    // day 7 leaves the plan 571 short; nothing is redistributed, and Start stays off
    // until the user loads the difference onto another day.
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await expect(page.getByLabel("Day 1 target")).toHaveValue("572");
    await expect(page.getByLabel("Day 7 target")).toHaveValue("571");
    await page.getByLabel("Day 7 target").fill("0");
    await expect(page.getByTestId("plan-delta")).toHaveText("−571 USD below goal");
    await expect(page.getByTestId("plan-delta")).toHaveAttribute("data-state", "below");
    await expect(page.getByLabel("Day 8 target")).toHaveValue("571");
    await expect(page.getByText("The 14 targets must add up to the goal.")).toBeVisible();
    await page.getByLabel("Day 8 target").fill("1143");
    await expect(page.getByTestId("plan-delta")).toHaveText("+1 USD above goal");
    await page.getByLabel("Day 8 target").fill("1142");
    await expect(page.getByTestId("plan-delta")).toHaveText("Balanced");
    await expect(page.getByText("The 14 targets must add up to the goal.")).toHaveCount(0);

    // F3: pre-plan an intention for day 2.
    await page.getByTestId("intentions-toggle").click();
    await page.getByLabel(/^D2 /).fill("Move the second $600 before lunch.");

    // F2: the sprint cannot start without impediments, a highest with WHEN → THEN, and cues.
    const start = page.getByRole("button", { name: "Start sprint" });
    await expect(start).toBeDisabled();
    await expect(page.getByText("Select 1–5 impediments.")).toBeVisible();
    await page.getByLabel("Create a new impediment").fill("Starting late");
    await page.getByTestId("wizard-impediments").getByRole("button", { name: "Create" }).click();
    await expect(page.getByTestId("wizard-impediments").getByRole("checkbox", { name: "Starting late" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Designate the highest impediment.")).toBeVisible();
    await page.getByTestId("wizard-highest").getByRole("radio", { name: /Starting late/ }).click();
    await expect(page.getByText("The highest impediment needs a WHEN → THEN.")).toBeVisible();
    await page.getByLabel("WHEN").fill("I notice myself delaying my first work block");
    await page.getByLabel("THEN").fill("I start a 10-minute timer on the smallest executable task");
    await expect(page.getByText("Select 1–3 execution cues.")).toBeVisible();
    await page.getByLabel("Create a new execution cue").fill("Ask how much this pays");
    await page.getByTestId("wizard-cues").getByRole("button", { name: "Create" }).click();
    await expect(page.getByTestId("wizard-cues").getByRole("checkbox", { name: "Ask how much this pays" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Confirm the outcome advances the vision.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Vision alignment" }).click();
    await expect(start).toBeEnabled();
    await start.click();

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

    // F2: Highest Impediment card with WHEN → THEN; collapsed row with counts.
    const highest = page.getByTestId("highest-impediment");
    await expect(highest.getByTestId("highest-name")).toHaveText("Starting late");
    expect(await highest.getByTestId("highest-name").evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
    await expect(highest.getByTestId("proof-when")).toHaveText("I notice myself delaying my first work block");
    await expect(highest.getByTestId("proof-then")).toHaveText("I start a 10-minute timer on the smallest executable task");
    await expect(page.getByTestId("sprint-items-toggle")).toHaveText("▸ Other impediments (0) · Execution cues (1)");
    await page.getByTestId("sprint-items-toggle").click();
    await expect(page.getByTestId("sprint-items").getByText("Ask how much this pays")).toBeVisible();
    await page.getByTestId("sprint-items-toggle").click();

    // F3: the 14-day plan on Today. The sprint started custom; day 1 is locked (it is
    // today), day 7 is the zero the wizard saved, and day 2's intention was pre-filled.
    const plan = page.getByTestId("plan-card");
    await expect(plan.getByTestId("plan-target-7")).toHaveText("0");
    await expect(plan.getByTestId("plan-target-8")).toHaveText("1,142");
    await expect(plan.locator('[data-day="1"]')).toHaveAttribute("data-locked", "true");
    await expect(plan.locator('[data-day="2"]')).toHaveAttribute("data-locked", "false");
    const day2 = await admin.from("sprint_days").select("intention").eq("user_id", user.id).eq("day_index", 2).single();
    expect(day2.error).toBeNull();
    expect(day2.data!.intention).toBe("Move the second $600 before lunch.");

    // Edit the future plan: day 1 has no input, Save waits for balance, then persists.
    await plan.getByRole("button", { name: "Custom · edit" }).click();
    await expect(plan.getByLabel("Day 1 target")).toHaveCount(0);
    await expect(plan.getByLabel("Day 14 target")).toHaveValue("571");
    const savePlan = plan.getByRole("button", { name: "Save plan" });
    await expect(savePlan).toBeDisabled();
    await expect(plan.getByText("Nothing has changed yet.")).toBeVisible();
    await plan.getByLabel("Day 14 target").fill("0");
    await expect(plan.getByTestId("plan-delta")).toHaveText("−571 USD below goal");
    await expect(savePlan).toBeDisabled();
    await plan.getByLabel("Day 13 target").fill("1142");
    await expect(plan.getByTestId("plan-delta")).toHaveText("Balanced");
    await expect(savePlan).toBeEnabled();
    await savePlan.click();
    await expect(plan.getByText("Saved")).toBeVisible();
    await expect(plan.getByTestId("plan-target-14")).toHaveText("0");
    await expect(plan.getByTestId("plan-target-13")).toHaveText("1,142");
    await page.reload();
    await expect(page.getByTestId("plan-card").getByTestId("plan-target-14")).toHaveText("0");
    await expect(page.getByTestId("plan-card").getByTestId("plan-target-1")).toHaveText("572");
    await expect(hero).toHaveText("572");

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

    // F4: tasks. Enter adds and re-offers a blank row; blur adds too; done toggles;
    // remove archives; everything survives a reload; the target hero never moves.
    const tasks = page.getByTestId("tasks-card");
    await expect(tasks.getByTestId("task-row")).toHaveCount(0);
    await tasks.getByLabel("New task").fill("Call the bank about the fee");
    await tasks.getByLabel("New task").press("Enter");
    await expect(tasks.getByTestId("task-row")).toHaveCount(1);
    await expect(tasks.getByLabel("New task")).toHaveValue("");
    await expect(tasks.getByLabel("New task")).toBeFocused();
    await tasks.getByLabel("New task").fill("Move the $600");
    await tasks.getByLabel("New task").blur();
    await expect(tasks.getByTestId("task-row")).toHaveCount(2);
    await expect(tasks.getByTestId("tasks-hint")).toHaveText("Saved");
    const bankDone = tasks.getByRole("checkbox", { name: "Done: Call the bank about the fee" });
    await bankDone.click();
    await expect(bankDone).toHaveAttribute("aria-checked", "true");
    await tasks.getByRole("button", { name: "Remove task: Move the $600" }).click();
    await expect(tasks.getByTestId("task-row")).toHaveCount(1);
    // The rows update optimistically; wait for both writes to land (the remove is an
    // archive, not a delete — History keeps the row) before the reload aborts them.
    await expect
      .poll(async () => {
        const r = await admin.from("tasks").select("text, done, archived_at").eq("user_id", user.id).order("created_at");
        return r.data?.map((t) => `${t.text} | done=${t.done} | archived=${t.archived_at !== null}`);
      })
      .toEqual(["Call the bank about the fee | done=true | archived=false", "Move the $600 | done=false | archived=true"]);
    await page.reload();
    await expect(page.getByTestId("tasks-card").getByTestId("task-row")).toHaveCount(1);
    await expect(page.getByTestId("tasks-card").getByLabel("Task 1")).toHaveValue("Call the bank about the fee");
    await expect(page.getByTestId("tasks-card").getByRole("checkbox", { name: "Done: Call the bank about the fee" })).toHaveAttribute("aria-checked", "true");
    // Rule 15: a completed task changed no total.
    await expect(hero).toHaveText("572");
    await expect(page.getByTestId("target-hero")).toContainText("0% of goal");

    // Close Day 1 with an actual above target → two-step dialog → green result, then locked.
    await page.getByRole("button", { name: "Enter actual result" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("close-step")).toHaveText("Close day 1 · step 1 of 2");
    await expect(dialog.getByText("Today's target was 572 USD.", { exact: false })).toBeVisible();
    const cont = dialog.getByRole("button", { name: "Continue" });
    await expect(cont).toBeDisabled();
    await dialog.getByLabel("Actual result").fill("600");
    await expect(dialog.getByText("Say which impediments hurt, or none.")).toBeVisible();
    await dialog.getByRole("checkbox", { name: /Starting late/ }).click();
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(dialog.getByTestId("close-step")).toHaveText("Close day 1 · step 2 of 2");
    const close = dialog.getByRole("button", { name: "Close the day" });
    await expect(close).toBeDisabled();
    await dialog.getByRole("checkbox", { name: "Ask how much this pays" }).click();
    await expect(close).toBeEnabled();
    await close.click();

    const result = page.getByTestId("result-actual");
    await expect(result).toHaveText("600");
    await expect(result).toHaveAttribute("data-state", "at-or-above");
    expect(await result.evaluate((el) => getComputedStyle(el).fontSize)).toBe("78px");
    await expect(page.getByRole("dialog").getByText("Tomorrow's target", { exact: true })).toBeVisible();
    // F5: an on-time close starts the streak.
    await expect(page.getByRole("dialog").getByTestId("result-streak")).toHaveText("1 day");
    await page.getByRole("button", { name: "Back to today" }).click();

    await expect(page.getByText("Day closed · locked")).toBeVisible();
    await expect(page.getByTestId("streak-label")).toHaveText("1-day streak");
    await expect(page.locator("[data-sidebar]").getByTestId("side-note").filter({ hasText: "1-day streak" })).toHaveCount(1);
    await expect(page.getByTestId("closed-actual")).toHaveText("600 USD");
    await expect(page.getByTestId("closed-actual")).toHaveAttribute("data-state", "at-or-above");
    await expect(page.getByTestId("day-strip").locator('[data-day="1"]')).toHaveAttribute("data-state", "at-or-above");

    // Reload: still locked; intention and tasks read-only; the close button is gone.
    await page.reload();
    await expect(page.getByText("Day closed · locked")).toBeVisible();
    await expect(page.getByLabel("Daily intention")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enter actual result" })).toHaveCount(0);
    const lockedTasks = page.getByTestId("tasks-card");
    await expect(lockedTasks.getByTestId("tasks-hint")).toHaveText("Locked with the closed day");
    await expect(lockedTasks.getByLabel("Task 1")).toBeDisabled();
    await expect(lockedTasks.getByRole("checkbox", { name: "Done: Call the bank about the fee" })).toBeDisabled();
    await expect(lockedTasks.getByLabel("New task")).toHaveCount(0);
    await expect(lockedTasks.getByRole("button", { name: "Add task" })).toHaveCount(0);
    await expect(lockedTasks.getByRole("button", { name: /Remove task/ })).toHaveCount(0);

    // Sidebar reflects the sprint.
    await expect(page.locator("[data-sidebar]").getByText("Day 1/14")).toBeVisible();

    // F2 library: the impediment is in sprint history; archiving it is blocked because
    // it is the sprint's highest impediment (rule 20), and nothing changed.
    await page.goto("/vision/impediments");
    await expect(page.locator("[data-sidebar]").getByText("Impediments")).toBeVisible();
    const item = page.getByTestId("library-item").filter({ hasText: "Starting late" });
    await expect(item.getByText("In sprint history")).toBeVisible();
    await item.getByRole("button", { name: "Archive" }).click();
    await expect(item.getByRole("alert")).toContainText("Archive is blocked");
    // The first violated rule is reported: with one impediment, rule 4 fires before rule 5.
    await expect(item.getByRole("alert")).toContainText("it would be left without an impediment");
    await page.reload();
    await expect(page.getByTestId("library-item").filter({ hasText: "Starting late" })).toBeVisible();
    await page.getByRole("button", { name: /Show archived/ }).click();
    await expect(page.getByText("Nothing archived yet.")).toBeVisible();

    // An unused cue can be deleted; a used one only archived (rule 19).
    await page.goto("/vision/cues");
    await page.getByLabel("Name").fill("Temporary cue");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const temp = page.getByTestId("library-item").filter({ hasText: "Temporary cue" });
    await expect(temp.getByText("Unused")).toBeVisible();
    await temp.getByRole("button", { name: "Delete" }).click();
    await expect(temp).toHaveCount(0);
    const used = page.getByTestId("library-item").filter({ hasText: "Ask how much this pays" });
    await expect(used.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(used.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("F5: a missed day is backfilled from the plan; it counts, the streak stays broken", async ({ page }) => {
    // A wealth sprint whose day 3 is today (UTC), seeded straight into the tables: days 1
    // and 2 are already missed. start_sprint only accepts today or tomorrow.
    const todayUtc = new Date().toISOString().slice(0, 10);
    const day = (offset: number) => new Date(Date.parse(todayUtc) + offset * 86_400_000).toISOString().slice(0, 10);
    const vision = await admin.from("visions").insert({ user_id: user.id, area: "wealth", body: "A wealth vision" }).select("id").single();
    if (vision.error) throw new Error(vision.error.message);
    const sprint = await admin
      .from("sprints")
      .insert({
        user_id: user.id,
        vision_id: vision.data.id,
        area: "wealth",
        outcome: "Bank the side income",
        measurement: "money",
        currency: "USD",
        amount: 140_000,
        confidence: 6,
        why: "why",
        celebration: "celebration",
        mantra: "Small deposits, every day.",
        tz: "UTC",
        start_date: day(-2),
        end_date: day(11),
      })
      .select("id")
      .single();
    if (sprint.error) throw new Error(sprint.error.message);
    const rows = Array.from({ length: 14 }, (_, i) => ({ sprint_id: sprint.data.id, user_id: user.id, day_index: i + 1, date: day(i - 2), target: 10_000 }));
    const days = await admin.from("sprint_days").insert(rows);
    if (days.error) throw new Error(days.error.message);

    await signInViaMagicLink(page, user.email);
    await page.goto("/sprints/wealth");
    await expect(page.getByTestId("day-label")).toHaveText("Day 3 / 14");
    await expect(page.getByTestId("streak-label")).toHaveText("No streak");
    const plan = page.getByTestId("plan-card");
    await expect(plan.locator('[data-day="1"]')).toHaveAttribute("data-missed", "true");
    await expect(plan.locator('[data-day="2"]')).toHaveAttribute("data-missed", "true");
    await expect(plan.locator('[data-day="3"]')).not.toHaveAttribute("data-missed", "true");
    await expect(plan.getByRole("button", { name: /Backfill day/ })).toHaveCount(2);

    await plan.getByRole("button", { name: "Backfill day 1" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("close-step")).toHaveText("Backfill day 1 · step 1 of 2");
    await expect(dialog.getByTestId("close-note")).toContainText("never repairs the streak");
    await dialog.getByLabel("Actual result").fill("50");
    await dialog.getByTestId("hurt-none").click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByTestId("helped-none").click();
    await dialog.getByRole("button", { name: "Close the day" }).click();
    await expect(page.getByRole("dialog").getByText("Day 1 backfilled")).toBeVisible();
    await expect(page.getByRole("dialog").getByTestId("result-streak")).toHaveText("0 days · unchanged by a backfill");
    await page.getByRole("button", { name: "Back to today" }).click();

    // Counted toward totals, gone from the backfill offers, streak untouched, day 2 still missed.
    await expect(plan.locator('[data-day="1"]')).toContainText("actual 50");
    await expect(plan.getByRole("button", { name: /Backfill day/ })).toHaveCount(1);
    await expect(page.getByTestId("target-hero")).toContainText("50 USD");
    await expect(page.getByTestId("streak-label")).toHaveText("No streak");
    const closed = await admin.from("sprint_days").select("closed_on_time, actual").eq("sprint_id", sprint.data.id).eq("day_index", 1).single();
    expect(closed.data).toEqual({ closed_on_time: false, actual: 5000 });
  });
});
