import { expect, test } from "@playwright/test";
import { addDays, localDateIn } from "../lib/sprintDay";
import { insertSprintRows } from "../tests/support/sprints";
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
    // No horizontal overflow at either viewport, on every Vision view and wizard step (F9).
    const noOverflow = async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    };

    await signInViaMagicLink(page, user.email);

    // Visual language checks (SPEC F1): font, radius, hero size, sidebar width.
    await expect(page.getByTestId("empty-state")).toBeVisible();
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain("Plus Jakarta Sans");
    const radius = await page.locator(".card").first().evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe("20px");
    const sidebarWidth = await page.locator("[data-sidebar]").evaluate((el) => getComputedStyle(el).width);
    expect(sidebarWidth).toBe(isPhone ? "390px" : "266px");

    // Empty state: no vision yet → the Sprints sidebar says Locked, the card links to /vision.
    await expect(page.getByRole("heading", { name: "No sprint can start here yet" })).toBeVisible();
    await expect(page.locator("[data-sidebar]").getByText("Locked")).toHaveCount(3);
    await page.getByRole("link", { name: "Write the vision" }).click();
    await expect(page).toHaveURL(/\/vision$/);

    // F9 step 1: the sidebar reads 0 of 3; a past deadline shows the hint and does not submit.
    const visionSetup = page.getByTestId("vision-setup");
    await expect(visionSetup).toHaveAttribute("data-step", "1");
    await expect(page.locator("[data-sidebar]").getByText("0 of 3")).toBeVisible();
    // The sub line is in the DOM on both viewports; the phone chip row hides it (F8).
    const sideSub = (text: string) => (isPhone ? expect(page.locator("[data-sidebar]").getByText(text)).toBeHidden() : expect(page.locator("[data-sidebar]").getByText(text)).toBeVisible());
    await sideSub("Not written yet");
    await noOverflow();
    const saveVision = page.getByRole("button", { name: "Save & continue" });
    await expect(page.getByText("The vision unlocks every sprint.")).toBeVisible();
    await page.getByLabel("Vision", { exact: true }).fill("In a year I run three times a week and sleep seven hours.");
    await page.getByLabel("Deadline").fill("2020-01-01");
    await expect(page.getByText("The deadline must be in the future.")).toBeVisible();
    await expect(saveVision).toHaveAttribute("aria-disabled", "true");
    // Submitting the form (Enter in a field) is a no-op while the hint stands.
    await page.getByLabel("Proof").press("Enter");
    await expect(visionSetup).toHaveAttribute("data-step", "1");
    const nextYear = addDays(localDateIn("UTC", new Date()), 365);
    await page.getByLabel("Deadline").fill(nextYear);
    await expect(page.getByText("Name what would prove it happened.")).toBeVisible();
    await page.getByLabel("Proof").fill("Three runs a week held for a quarter");
    await expect(saveVision).toHaveAttribute("aria-disabled", "false");
    await saveVision.click();

    // Step 2: the vision alone unlocks the sprints; create the obstacle on the spot.
    await expect(page.getByTestId("vision-setup")).toHaveAttribute("data-step", "2");
    await expect(page.locator("[data-sidebar]").getByText("1 of 3")).toBeVisible();
    await expect(page.getByText("Pick or name one obstacle.")).toBeVisible();
    await noOverflow();
    await page.getByLabel("Situation").fill("Starting late");
    await page.getByLabel("Interferes").fill("what it does to your day");
    await page.getByRole("button", { name: "Save & continue" }).click();

    // Step 3: the rule, saved onto the impediment.
    await expect(page.getByTestId("vision-setup")).toHaveAttribute("data-step", "3");
    await expect(page.getByText("WHEN, THEN and the recovery criterion are all required.")).toBeVisible();
    await noOverflow();
    await page.getByLabel("WHEN", { exact: true }).fill("I notice myself delaying my first work block");
    await page.getByLabel("THEN", { exact: true }).fill("I start a 10-minute timer on the smallest executable task");
    await page.getByLabel("RECOVERED WHEN").fill("The timer is running within 10 minutes");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Overview: 3 of 3, the obstacle card, no sprints yet.
    const overview = page.getByTestId("vision-overview");
    await expect(overview).toBeVisible();
    await expect(page.getByTestId("vision-steps")).toHaveText("3 of 3 steps");
    await noOverflow();
    await expect(page.getByTestId("card-obstacle")).toContainText("Starting late");
    await expect(page.getByTestId("card-rule")).toContainText("WHEN I notice myself delaying my first work block → THEN I start a 10-minute timer on the smallest executable task");
    await expect(page.getByTestId("card-sprints")).toContainText("No sprints yet.");
    await expect(page.getByTestId("vision-meta")).toContainText("Not reviewed yet");
    await expect(page.locator("[data-sidebar]").getByText("3 of 3")).toBeVisible();

    // The Sprints sidebar now reads Ready on every area → create a sprint.
    await page.goto("/sprints/health");
    await expect(page.locator("[data-sidebar]").getByText("Ready")).toHaveCount(3);
    await page.getByRole("link", { name: "Create a Health sprint" }).click();
    await expect(page).toHaveURL(/\/sprints\/new\?area=health$/);
    await expect(page.getByTestId("wizard-vision")).toContainText("In a year I run three times a week");
    await noOverflow();

    // Step 1
    await page.getByLabel("Sprint outcome").fill("Save $8,000 toward the emergency fund");
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 2 (money, USD)
    await noOverflow();
    await page.getByLabel(/Sprint goal/).fill("8000");
    await page.getByLabel("Usage 1 label").fill("Rent");
    await page.getByLabel("Usage 1 amount").fill("2800");
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 3
    await noOverflow();
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
    await noOverflow();

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
    // F9: the vision's obstacle is a global impediment with its rule, so it is offered here.
    await page.getByTestId("wizard-impediments").getByRole("checkbox", { name: /Starting late/ }).click();
    await expect(page.getByTestId("wizard-impediments").getByRole("checkbox", { name: /Starting late/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Designate the highest impediment.")).toBeVisible();
    await page.getByTestId("wizard-highest").getByRole("radio", { name: /Starting late/ }).click();
    // The rule written on the Vision tab is complete, so no proof inputs open.
    await expect(page.getByTestId("wizard-highest").getByLabel("WHEN", { exact: true })).toHaveCount(0);
    // A second impediment created inline still works (the create row is unchanged).
    await page.getByLabel("Create a new impediment").fill("Phone distraction");
    await page.getByTestId("wizard-impediments").getByRole("button", { name: "Create" }).click();
    await expect(page.getByTestId("wizard-impediments").getByRole("checkbox", { name: "Phone distraction" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Select 1–3 execution cues.")).toBeVisible();
    // F6: a cue is a WHEN → REMIND pair; Create waits for both.
    const cueSetup = page.getByTestId("wizard-cues");
    const createCue = cueSetup.getByRole("button", { name: "Create" });
    await cueSetup.getByLabel("REMIND").fill("Ask how much this pays");
    await expect(createCue).toBeDisabled();
    await cueSetup.getByLabel("WHEN", { exact: true }).fill("I schedule anything");
    await expect(createCue).toBeEnabled();
    await createCue.click();
    await expect(cueSetup.getByRole("checkbox", { name: "Ask how much this pays" })).toHaveAttribute("aria-checked", "true");
    await expect(cueSetup.getByRole("checkbox", { name: "Ask how much this pays" })).toContainText("WHEN I schedule anything");
    // F7: the first picked cue is the focus by default; the radio is there to change it.
    await expect(page.getByTestId("wizard-focus").getByRole("radio", { name: "Ask how much this pays" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Confirm the outcome advances the vision.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Vision alignment" }).click();
    await expect(start).toBeEnabled();
    await start.click();

    // Today, Day 1 — the journal (F8): title, progress block, timeline, Today card, rail.
    await expect(page).toHaveURL(/\/sprints\/health$/);
    await expect(page.getByTestId("journal-title")).toHaveText("Save $8,000 toward the emergency fund");
    expect(await page.getByTestId("journal-title").evaluate((el) => getComputedStyle(el).fontSize)).toBe("30px");
    await expect(page.getByTestId("day-label")).toHaveText("Day 1 of 14");
    const today = page.getByTestId("today-card");
    await expect(today).toHaveAttribute("data-state", "planning");
    const hero = page.locator("[data-hero]");
    await expect(hero).toHaveText("572");
    expect(await hero.evaluate((el) => getComputedStyle(el).fontSize)).toBe("64px");
    await expect(page.getByTestId("sprint-progress").locator(".j-seg")).toHaveCount(14);
    // Per-day pace is a whole currency unit (8000 / 14 rounds up to 572), never cents.
    await expect(page.getByTestId("sprint-progress")).toContainText("0 of 8,000 USD · 572 a day finishes it");
    await expect(page.getByTestId("mantra")).toHaveText("“Boring money is the money that stays.”");
    await expect(page.getByTestId("streak-label")).toHaveText("No streak");
    // The Dusk palette is on (F8): the accent on the root is the README's.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("#5b5bd6");
    // Timeline on Day 1: no Yesterday, a folded Tomorrow, the rest folded.
    const rows = page.getByTestId("timeline").getByTestId("day-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("Tomorrow");
    await expect(rows.nth(2)).toContainText("Rest of the sprint");

    // F2: the rail's Highest card with WHEN → THEN; the cues card with the focus.
    const highest = page.getByTestId("highest-impediment");
    await expect(highest.getByTestId("highest-name")).toHaveText("Starting late");
    expect(await highest.getByTestId("highest-name").evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    await expect(highest.getByTestId("proof-when")).toHaveText("I notice myself delaying my first work block");
    await expect(highest.getByTestId("proof-then")).toHaveText("I start a 10-minute timer on the smallest executable task");
    await expect(highest.getByTestId("proof-recover")).toHaveText("The timer is running within 10 minutes");
    await expect(highest.getByTestId("also-watching")).toContainText("2 of 5");
    await expect(page.getByTestId("sprint-items")).toContainText("1 of 3");
    await expect(page.getByTestId("sprint-items").getByText("Ask how much this pays")).toBeVisible();
    await expect(page.getByTestId("sprint-items").getByText("WHEN I schedule anything")).toBeVisible();
    // F7: the focus cue carries the tag and no Remove.
    const focusRow = page.getByTestId("sprint-items").getByTestId("sprint-item").filter({ hasText: "Ask how much this pays" });
    await expect(focusRow.getByTestId("focus-tag")).toHaveText("FOCUS");
    await expect(focusRow.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    // F6: the Today Add-cue picker's create row is a WHEN + REMIND pair too.
    await page.getByRole("button", { name: "Add cue" }).click();
    const picker = page.getByRole("dialog");
    const createInPicker = picker.getByRole("button", { name: "Create" });
    await picker.getByLabel("REMIND").fill("Close the laptop at nine");
    await expect(createInPicker).toHaveAttribute("aria-disabled", "true");
    await picker.getByLabel("WHEN", { exact: true }).fill("the clock shows 9 pm");
    await expect(createInPicker).toHaveAttribute("aria-disabled", "false");
    await createInPicker.click();
    await expect(picker.getByRole("radio", { name: /Close the laptop at nine/ })).toHaveAttribute("aria-checked", "true");
    await picker.getByRole("button", { name: "Add to sprint" }).click();
    await expect(page.getByTestId("sprint-items")).toContainText("2 of 3");
    await expect(page.getByTestId("sprint-items").getByText("WHEN the clock shows 9 pm")).toBeVisible();
    // F7: "Set as focus" moves the tag to the new cue and frees the old one.
    await page.getByRole("button", { name: "Set as focus: Close the laptop at nine" }).click();
    const newFocusRow = page.getByTestId("sprint-items").getByTestId("sprint-item").filter({ hasText: "Close the laptop at nine" });
    await expect(newFocusRow.getByTestId("focus-tag")).toHaveText("FOCUS");
    await expect(focusRow.getByTestId("focus-tag")).toHaveCount(0);
    await expect(focusRow.getByRole("button", { name: "Remove Ask how much this pays" })).toBeVisible();
    await page.getByRole("button", { name: "Set as focus: Ask how much this pays" }).click();
    await expect(focusRow.getByTestId("focus-tag")).toHaveText("FOCUS");

    // F3: the plan lives on the timeline's future rows. The sprint started custom; day 1
    // is today, day 7 is the zero the wizard saved, and day 2's intention was pre-filled.
    const timeline = page.getByTestId("timeline");
    await rows.nth(2).getByRole("button", { name: /Rest of the sprint/ }).click();
    await expect(timeline.getByTestId("plan-target-7")).toHaveText("0");
    await expect(timeline.getByTestId("plan-target-8")).toHaveText("1,142");
    await expect(timeline.locator('[data-day="1"]')).toHaveAttribute("data-kind", "today");
    await expect(timeline.locator('[data-day="8"]')).toHaveAttribute("data-kind", "future");
    const day2 = await admin.from("sprint_days").select("intention").eq("user_id", user.id).eq("day_index", 2).single();
    expect(day2.error).toBeNull();
    expect(day2.data!.intention).toBe("Move the second $600 before lunch.");

    // Edit the future plan from Tomorrow's row: day 1 has no input, Save waits for balance, then persists.
    await rows.nth(1).getByRole("button", { name: /Tomorrow/ }).click();
    await timeline.locator('[data-day="2"]').getByRole("button", { name: "edit" }).click();
    await expect(page.getByLabel("Day 1 target")).toHaveCount(0);
    await expect(page.getByLabel("Day 14 target")).toHaveValue("571");
    const savePlan = page.getByRole("button", { name: "Save plan" });
    await expect(savePlan).toBeDisabled();
    await expect(page.getByText("Nothing has changed yet.")).toBeVisible();
    await page.getByLabel("Day 14 target").fill("0");
    await expect(page.getByTestId("plan-delta")).toHaveText("−571 USD below goal");
    await expect(savePlan).toBeDisabled();
    await page.getByLabel("Day 13 target").fill("1142");
    await expect(page.getByTestId("plan-delta")).toHaveText("Balanced");
    await expect(savePlan).toBeEnabled();
    await savePlan.click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(timeline.getByTestId("plan-target-14")).toHaveText("0");
    await expect(timeline.getByTestId("plan-target-13")).toHaveText("1,142");
    await page.reload();
    await page.getByTestId("timeline").getByRole("button", { name: /Rest of the sprint/ }).click();
    await expect(page.getByTestId("timeline").getByTestId("plan-target-14")).toHaveText("0");
    await expect(page.getByTestId("timeline").locator('[data-day="1"]')).toHaveAttribute("data-kind", "today");
    await expect(hero).toHaveText("572");

    // Rule 28: no HIT/MISS labels anywhere in the rendered DOM.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\b(HIT|MISS)\b/);

    // The page never scrolls sideways, with the folds open and the plan in edit mode.
    await noOverflow();
    // Every text field renders at 16px or more, so iOS Safari never zooms on focus (audit #1).
    // Includes the plan's edit inputs, the smallest fields on the page.
    const smallFields = async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
          .filter((el) => el.type !== "hidden" && el.type !== "checkbox")
          .map((el) => ({ label: el.getAttribute("aria-label") ?? el.id, size: parseFloat(getComputedStyle(el).fontSize) }))
          .filter((f) => f.size < 16),
      );
    await page.getByRole("button", { name: "Custom · edit" }).click();
    expect(await smallFields()).toEqual([]);
    await noOverflow();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.screenshot({ path: `test-results/today-${testInfo.project.name}.png`, fullPage: true });

    // Daily Intention — the first line of the Today card — autosaves on blur and survives a reload.
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
    await expect(page.getByTestId("sprint-progress")).toContainText("0%");

    // Close Day 1 inline on the Today card (F8): the actual, then the F7 questions.
    await today.getByRole("button", { name: "Close the day" }).click();
    await expect(today).toHaveAttribute("data-state", "reviewing");
    await expect(today).toContainText("Closing Day 1 · target 572");
    const confirm = today.getByRole("button", { name: "Confirm close" });
    await expect(confirm).toBeDisabled();
    await expect(today.locator("#close-hint")).toHaveText("Enter today's actual — zero is truthful");
    await today.getByLabel("Actual result").fill("600");
    await expect(confirm).toBeEnabled();
    // F7: observations. The focus cue is asked first; the highest's occurrence opens the
    // response questions, and the close waits for both answers.
    const use = today.getByTestId("use-group");
    await expect(use.getByRole("button").first()).toContainText("Ask how much this pays");
    await expect(use.getByRole("button").first().getByTestId("focus-tag")).toHaveText("FOCUS");
    await expect(today.getByTestId("response-group")).toHaveCount(0);
    await today.getByTestId("occurrence-group").getByRole("button", { name: "Starting late" }).click();
    await expect(today.getByTestId("response-group")).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(today.locator("#close-hint")).toHaveText("Did the response run?");
    await today.getByTestId("response-group").getByRole("radio", { name: "Partially" }).click();
    await expect(today.locator("#close-hint")).toHaveText("Did you recover?");
    await expect(confirm).toBeDisabled();
    await today.getByTestId("recovery-group").getByRole("radio", { name: "Yes" }).click();
    await expect(confirm).toBeEnabled();
    await today.getByTestId("impact-group").getByRole("radio", { name: "Some" }).click();
    // Tasks are read-only while closing; the cue group stays untouched (stored as unanswered).
    await expect(today.getByLabel("Task 1")).toBeDisabled();
    await today.getByLabel("Note").fill("The timer worked.");
    await confirm.click();

    // The card flips to Closed: result, summary line, note, "Set up tomorrow".
    await expect(today).toHaveAttribute("data-state", "closed");
    await expect(page.getByTestId("closed-actual")).toHaveText("600");
    await expect(page.getByTestId("closed-actual")).toHaveAttribute("data-state", "at-or-above");
    await expect(page.getByTestId("day-summary")).toHaveText("Showed up: Starting late · Response partially ran · recovered · Cost: some");
    await expect(today.getByText("“The timer worked.”")).toBeVisible();
    await expect(page.getByTestId("day-locked")).toHaveText("Day closed · locked · tomorrow's target 572");
    const setup = page.getByTestId("setup-tomorrow");
    await expect(setup).toContainText("Set up tomorrow · Day 2");
    // Untouched cues are offered; the focus cue never is.
    await expect(setup.getByTestId("quiet-cue")).toHaveCount(1);
    await expect(setup.getByTestId("quiet-cue")).toContainText("Close the laptop at nine");
    // F9 golden path carries a second impediment (Phone distraction), untouched at close → offered.
    await expect(setup.getByTestId("quiet-impediment")).toHaveCount(1);
    await expect(setup.getByTestId("quiet-impediment")).toContainText("Phone distraction");
    await setup.getByRole("button", { name: "Remove Close the laptop at nine" }).click();
    await expect(setup.getByTestId("quiet-cue")).toHaveCount(0);
    await expect(page.getByTestId("sprint-items")).toContainText("1 of 3");
    await setup.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("setup-tomorrow")).toHaveCount(0);
    // F5: an on-time close starts the streak; the progress block moved on.
    await expect(page.getByTestId("streak-label")).toHaveText("1-day streak");
    await expect(page.getByTestId("sprint-progress")).toContainText("600 of 8,000 USD");
    await expect(page.getByTestId("sprint-progress").locator('.j-seg[data-day="1"]')).toHaveAttribute("data-closed", "true");
    // F7: the day row carries the highest's answers and snapshot; one observation row per
    // offered item, the untouched cue group as unanswered.
    const dayRow = await admin.from("sprint_days").select("id, response, recovered, impact, proof_recover").eq("user_id", user.id).eq("day_index", 1).single();
    expect(dayRow.data).toMatchObject({ response: "partially", recovered: "yes", impact: "some", proof_recover: "The timer is running within 10 minutes" });
    const impRows = await admin.from("day_impediment_observations").select("name, occurred, was_highest").eq("sprint_day_id", dayRow.data!.id).order("name");
    expect(impRows.data).toEqual([
      { name: "Phone distraction", occurred: "no", was_highest: false },
      { name: "Starting late", occurred: "yes", was_highest: true },
    ]);
    const cueRows = await admin.from("day_cue_observations").select("name, used, was_focus").eq("sprint_day_id", dayRow.data!.id).order("name");
    expect(cueRows.data).toEqual([
      { name: "Ask how much this pays", used: "unanswered", was_focus: true },
      { name: "Close the laptop at nine", used: "unanswered", was_focus: false },
    ]);
    // Reload: still locked; intention read-only, tasks read-only, no close button, no "Set up tomorrow".
    await page.reload();
    await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "closed");
    await expect(page.getByTestId("day-summary")).toHaveText("Showed up: Starting late · Response partially ran · recovered · Cost: some");
    await expect(page.getByTestId("intention-locked")).toHaveText("Today I will move the $600 before lunch.");
    await expect(page.getByLabel("Daily intention")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close the day" })).toHaveCount(0);
    await expect(page.getByTestId("setup-tomorrow")).toHaveCount(0);
    await noOverflow();
    const lockedTasks = page.getByTestId("tasks-card");
    await expect(lockedTasks.getByTestId("tasks-hint")).toHaveText("Locked with the closed day");
    await expect(lockedTasks.getByLabel("Task 1")).toBeDisabled();
    await expect(lockedTasks.getByRole("checkbox", { name: "Done: Call the bank about the fee" })).toBeDisabled();
    await expect(lockedTasks.getByLabel("New task")).toHaveCount(0);
    await expect(lockedTasks.getByRole("button", { name: "Add task" })).toHaveCount(0);
    await expect(lockedTasks.getByRole("button", { name: /Remove task/ })).toHaveCount(0);

    // Sidebar reflects the sprint: label · meta · outcome, no streak line, no New Sprint button.
    await expect(page.locator("[data-sidebar]").getByText("Day 1/14")).toBeVisible();
    // The outcome line is in the DOM on both viewports; the phone's chip row hides it.
    const sideOutcome = page.locator("[data-sidebar]").getByText("Save $8,000 toward the emergency fund");
    if (isPhone) await expect(sideOutcome).toBeHidden();
    else await expect(sideOutcome).toBeVisible();
    await expect(page.locator("[data-sidebar]").getByRole("link", { name: "New Sprint" })).toHaveCount(0);

    // F8 night mode: the header toggle sets a cookie; the next paint is already dark.
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    expect((await page.context().cookies()).find((c) => c.name === "theme")?.value).toBe("night");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page-bg").trim())).toBe("#131320");
    await page.screenshot({ path: `test-results/today-night-${testInfo.project.name}.png`, fullPage: true });
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "night");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page-bg").trim())).toBe("#f9f9fd");

    // F9: the sprint appears under "Sprints behind this vision"; Review → Still true stamps today.
    await page.goto("/vision");
    const visionSprint = page.getByTestId("card-sprints").getByTestId("vision-sprint");
    await expect(visionSprint).toHaveCount(1);
    await expect(visionSprint).toContainText("Health");
    await expect(visionSprint).toContainText("Save $8,000 toward the emergency fund");
    await expect(visionSprint).toContainText("Day 1 of 14");
    await page.getByRole("button", { name: "Review vision" }).click();
    const reviewCard = page.getByTestId("vision-review");
    await expect(reviewCard).toContainText("Proof you named: Three runs a week held for a quarter. 1 sprint has run behind it.");
    await reviewCard.getByLabel("Review note").fill("Ran Monday and Wednesday.");
    await reviewCard.getByRole("button", { name: "Still true · mark reviewed" }).click();
    const reviewedStamp = `Reviewed ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    await expect(page.getByTestId("vision-meta")).toContainText(reviewedStamp);
    await sideSub(reviewedStamp);
    await expect(page.getByTestId("vision-review")).toHaveCount(0);
    // Replace arms on the first tap and disarms on blur; nothing is archived.
    await page.getByTestId("vision-replace").click();
    await expect(page.getByTestId("vision-replace")).toHaveText("Tap again to archive it and start over");
    await page.getByRole("button", { name: "Review vision" }).focus();
    await expect(page.getByTestId("vision-replace")).toHaveText("Replace");
    await noOverflow();
    // DB: one active vision with the obstacle set, one review row.
    const visions = await admin.from("visions").select("id, obstacle_id, archived_at").eq("user_id", user.id);
    expect(visions.data).toHaveLength(1);
    expect(visions.data![0].archived_at).toBeNull();
    expect(visions.data![0].obstacle_id).not.toBeNull();
    const reviews = await admin.from("vision_reviews").select("verdict, note").eq("user_id", user.id);
    expect(reviews.data).toEqual([{ verdict: "still_true", note: "Ran Monday and Wednesday." }]);

    // F2 library: the impediment is in sprint history; archiving it is blocked because
    // it is the sprint's highest impediment (rule 20), and nothing changed.
    await page.goto("/vision/impediments");
    await expect(page.locator("[data-sidebar]").getByText("Impediments")).toBeVisible();
    const item = page.getByTestId("library-item").filter({ hasText: "Starting late" });
    // F6: the card shows the five labelled parts and the three-state usage line.
    await expect(item.getByText("In an active sprint")).toBeVisible();
    await expect(item.locator("[data-part=situation]")).toHaveText("Starting late");
    await expect(item.locator("[data-part=interferes]")).toHaveText("what it does to your day");
    await expect(item.locator("[data-part=recovered]")).toHaveText("The timer is running within 10 minutes");
    await expect(page.getByTestId("library-count")).toHaveText("2 · 0 archived");
    await item.getByRole("button", { name: "Archive" }).click();
    // F9: the vision's obstacle is guarded before any sprint rule is consulted.
    await expect(item.getByRole("alert")).toContainText("This impediment is the vision's main obstacle.");
    await page.reload();
    await expect(page.getByTestId("library-item").filter({ hasText: "Starting late" })).toBeVisible();
    await page.getByRole("button", { name: /Show archived/ }).click();
    await expect(page.getByText("Nothing archived yet.")).toBeVisible();

    // An unused cue can be deleted; a used one only archived (rule 19).
    await page.goto("/vision/cues");
    // F6: the library Add form needs WHEN and REMIND; the hint names both until they are filled.
    const addCue = page.getByTestId("library-add");
    const addButton = page.getByRole("button", { name: "Add", exact: true });
    await addCue.getByLabel("REMIND").fill("Temporary cue");
    await expect(addButton).toHaveAttribute("aria-disabled", "true");
    await expect(addCue.getByText("WHEN and REMIND are both needed.")).toBeVisible();
    await addCue.getByLabel("WHEN", { exact: true }).fill("I open the calendar");
    await expect(addButton).toHaveAttribute("aria-disabled", "false");
    await addButton.click();
    const temp = page.getByTestId("library-item").filter({ hasText: "Temporary cue" });
    await expect(temp.getByText("Unused")).toBeVisible();
    await expect(temp.locator("[data-part=when]")).toHaveText("I open the calendar");
    await expect(temp.locator("[data-part=remind]")).toHaveText("Temporary cue");
    await temp.getByRole("button", { name: "Delete" }).click();
    await expect(temp).toHaveCount(0);
    const used = page.getByTestId("library-item").filter({ hasText: "Ask how much this pays" });
    await expect(used.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(used.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("F5: a missed day is backfilled from the plan; it counts, the streak stays broken", async ({ page }) => {
    // A wealth sprint whose day 3 is today (UTC), seeded straight into the tables: days 1
    // and 2 are already missed. start_sprint only accepts today or tomorrow. Goal 1,400 USD
    // as 14 × 100 USD.
    const todayUtc = localDateIn("UTC", new Date());
    const sprint = await insertSprintRows(admin, user.id, { startDate: addDays(todayUtc, -2), tz: "UTC", target: 10_000, outcome: "Bank the side income", mantra: "Small deposits, every day." });
    // F7: memberships dated from day 1, so the backfill dialog offers one cue (the focus) and one impediment (the highest).
    const seededCue = await admin.from("cues").insert({ user_id: user.id, name: "Check the balance first", cue_when: "I open the banking app" }).select("id").single();
    const seededImp = await admin.from("impediments").insert({ user_id: user.id, name: "Impulse spend", proof_when: "I see a deal", proof_then: "I wait a day", proof_recover: "No purchase that day" }).select("id").single();
    if (seededCue.error || seededImp.error) throw new Error((seededCue.error ?? seededImp.error)!.message);
    const addedAt = `${addDays(todayUtc, -2)}T00:00:00Z`;
    const memberships = await Promise.all([
      admin.from("sprint_cues").insert({ sprint_id: sprint.sprintId, user_id: user.id, cue_id: seededCue.data.id, is_focus: true, added_at: addedAt }),
      admin.from("sprint_impediments").insert({ sprint_id: sprint.sprintId, user_id: user.id, impediment_id: seededImp.data.id, is_highest: true, added_at: addedAt }),
    ]);
    for (const m of memberships) if (m.error) throw new Error(m.error.message);

    await signInViaMagicLink(page, user.email);
    await page.goto("/sprints/wealth");
    await expect(page.getByTestId("day-label")).toHaveText("Day 3 of 14");
    await expect(page.getByTestId("streak-label")).toHaveText("No streak");
    // Day 3: Day 1 sits in the folded past, Day 2 is Yesterday; both missed.
    const timeline = page.getByTestId("timeline");
    await timeline.getByRole("button", { name: /Earlier in the sprint/ }).click();
    await timeline.getByRole("button", { name: /Yesterday/ }).click();
    await expect(timeline.locator('[data-day="1"]')).toHaveAttribute("data-kind", "missed");
    await expect(timeline.locator('[data-day="2"]')).toHaveAttribute("data-kind", "missed");
    await expect(timeline.locator('[data-day="3"]')).toHaveAttribute("data-kind", "today");
    await expect(timeline.getByRole("button", { name: /Backfill day/ })).toHaveCount(2);

    await timeline.getByRole("button", { name: "Backfill day 1" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("close-step")).toHaveText("Backfill day 1 · step 1 of 2");
    await expect(dialog.getByTestId("close-note")).toContainText("never repairs the streak");
    await dialog.getByLabel("Actual result").fill("50");
    await dialog.getByRole("button", { name: "Continue" }).click();
    // F7: None on both groups; nothing blocks the close and every offered item is stored as `no`.
    await expect(dialog.getByTestId("use-group").getByTestId("focus-tag")).toHaveText("FOCUS");
    await dialog.getByTestId("use-none").click();
    await dialog.getByTestId("occurrence-none").click();
    await expect(dialog.getByTestId("response-group")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close the day" }).click();
    await expect(page.getByRole("dialog").getByText("Day 1 backfilled")).toBeVisible();
    await expect(page.getByRole("dialog").getByTestId("result-streak")).toHaveText("0 days · unchanged by a backfill");
    // 50 against 100 is the red state, and the result's cumulative is the whole sprint's.
    await expect(page.getByTestId("result-actual")).toHaveAttribute("data-state", "under");
    await expect(page.getByRole("dialog")).toContainText("50 USD · 4% of goal");
    // The result screen (78px) lives on the backfill path only (F8).
    expect(await page.getByTestId("result-actual").evaluate((el) => getComputedStyle(el).fontSize)).toBe("78px");
    await page.getByRole("button", { name: "Back to today" }).click();

    // Counted toward totals, gone from the backfill offers, streak untouched, day 2 still missed.
    const day1 = timeline.locator('[data-day="1"]');
    await expect(day1).toHaveAttribute("data-kind", "closed");
    await expect(day1).toContainText("50 of 100");
    await expect(day1.locator(".j-verdict")).toHaveAttribute("data-state", "under");
    await expect(timeline.getByRole("button", { name: /Backfill day/ })).toHaveCount(1);
    // Derived totals past day 1: 1,350 left over the 12 open days from day 3 → 113 a day, rounded up to a whole unit.
    await expect(page.getByTestId("sprint-progress")).toContainText("4%");
    await expect(page.getByTestId("sprint-progress")).toContainText("50 of 1,400 USD · 113 a day finishes it");
    await expect(page.getByTestId("streak-label")).toHaveText("No streak");
    const closed = await admin.from("sprint_days").select("id, closed_on_time, actual, response").eq("sprint_id", sprint.sprintId).eq("day_index", 1).single();
    expect(closed.data).toMatchObject({ closed_on_time: false, actual: 5000, response: null });
    const noCue = await admin.from("day_cue_observations").select("name, used, was_focus").eq("sprint_day_id", closed.data!.id);
    expect(noCue.data).toEqual([{ name: "Check the balance first", used: "no", was_focus: true }]);
    const noImp = await admin.from("day_impediment_observations").select("name, occurred, was_highest").eq("sprint_day_id", closed.data!.id);
    expect(noImp.data).toEqual([{ name: "Impulse spend", occurred: "no", was_highest: true }]);
  });
});
