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

    // Visual language checks (SPEC F1, U1): font, radius, hero size, the sidebar as a chip row on every width.
    await expect(page.getByTestId("empty-state")).toBeVisible();
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain("Plus Jakarta Sans");
    const radius = await page.locator(".card").first().evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe("20px");
    const sidebarWidth = await page.locator("[data-sidebar]").evaluate((el) => getComputedStyle(el).width);
    expect(sidebarWidth).toBe(isPhone ? "390px" : "1280px");
    const sidebarBox = await page.locator("[data-sidebar]").boundingBox();
    const mainBox = await page.locator("main").boundingBox();
    expect(sidebarBox && mainBox && mainBox.y >= sidebarBox.y + sidebarBox.height).toBe(true);

    // Empty state: no vision yet → the Sprints sidebar says Locked, the card links to /vision.
    await expect(page.getByRole("heading", { name: "No sprint can start here yet" })).toBeVisible();
    await expect(page.locator("[data-sidebar]").getByText("Locked")).toHaveCount(3);
    // U1: /sprints lands on the first Area, so that chip is selected and shows its sub line; a chip
    // that is not selected keeps its sub line off screen (clip, not display:none) on every width.
    await expect(page.locator("[data-sidebar] .side-link-on").getByText("Vision not finished")).toBeVisible();
    await expect(page.locator("[data-sidebar] .side-link:not(.side-link-on)").getByText("Vision not finished").first()).toHaveCSS("clip", "rect(0px, 0px, 0px, 0px)");
    await page.getByRole("link", { name: "Write the vision" }).click();
    await expect(page).toHaveURL(/\/vision$/);

    // F16 step 1 (Picture): the sidebar reads 0 of 3; a blank picture shows the hint and does not submit.
    const visionSetup = page.getByTestId("vision-setup");
    await expect(visionSetup).toHaveAttribute("data-step", "1");
    await expect(page.locator("[data-sidebar]").getByText("0 of 3")).toBeVisible();
    // U1: the selected chip is the one that expands, so its sub line is visible on both viewports.
    const sideSub = (text: string) => expect(page.locator("[data-sidebar]").getByText(text)).toBeVisible();
    await sideSub("Not written yet");
    await noOverflow();
    const saveVision = page.getByRole("button", { name: "Save & continue" });
    await expect(page.getByText("Picture the day before moving on.")).toBeVisible();
    await expect(saveVision).toHaveAttribute("aria-disabled", "true");
    // Chromium recognises speech, so the box carries its Dictate button (the API itself is not exercised headless).
    await expect(page.getByRole("button", { name: "Dictate the picture" })).toBeVisible();
    // Submitting the form (Enter in a field) is a no-op while the hint stands.
    const picture = page.getByRole("textbox", { name: "Picture", exact: true });
    await picture.press("Enter");
    await expect(visionSetup).toHaveAttribute("data-step", "1");
    await picture.fill("Morning run before the kids wake; midday I say no to a one-off; evening the draft is sent.");
    await expect(saveVision).toHaveAttribute("aria-disabled", "false");
    await saveVision.click();

    // Step 2 (Goal): the goal, its proof, a confidence of 5 → the reason is required.
    await expect(page.getByTestId("vision-setup")).toHaveAttribute("data-step", "2");
    await expect(page.locator("[data-sidebar]").getByText("1 of 3")).toBeVisible();
    await expect(page.getByText("Say the goal.")).toBeVisible();
    await noOverflow();
    // F17: the goal and its proof are one box, sorted into two parts (the stub under PARSE_STUB=1).
    await expect(page.getByRole("button", { name: "Dictate the goal" })).toBeVisible();
    await page.getByRole("textbox", { name: "Goal and proof", exact: true }).fill("In a year I run three times a week and sleep seven hours. The observable proof will be three runs a week held for a quarter.");
    await page.getByRole("button", { name: "Sort into parts" }).click();
    await expect(page.getByTestId("capture-box")).toHaveAttribute("data-phase", "parsed");
    await expect(page.getByRole("textbox", { name: "Goal", exact: true })).toHaveValue("In a year I run three times a week and sleep seven hours");
    await expect(page.getByRole("textbox", { name: "Proof", exact: true })).toHaveValue("three runs a week held for a quarter");
    await expect(page.getByText("Pick a confidence from 0 to 10.")).toBeVisible();
    await page.getByRole("button", { name: "Confidence 5" }).click();
    // F17: the band advice under the chips.
    await expect(page.getByTestId("confidence-advice")).toHaveText("This may be unrealistic. Consider a smaller goal or more support.");
    await expect(page.getByText("Say the main reason your confidence is low.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & continue" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("textbox", { name: "Main reason", exact: true }).fill("Travel weeks break the routine");
    await expect(page.getByRole("button", { name: "Dictate the reason" })).toBeVisible();
    await page.getByRole("button", { name: "Save & continue" }).click();
    await expect(page.getByTestId("vision-setup")).toHaveAttribute("data-step", "3");

    // Two of three steps do not unlock a sprint: the Sprints sidebar still reads Locked.
    await page.goto("/sprints");
    await expect(page.locator("[data-sidebar]").getByText("Locked")).toHaveCount(3);
    await expect(page.locator("[data-sidebar] .side-link-on").getByText("Vision not finished")).toBeVisible();
    await page.goto("/vision?step=3");

    // Step 3 (Obstacle): name the obstacle and write WHEN → THEN → RECOVERED WHEN in one step.
    await expect(page.getByTestId("vision-setup")).toHaveAttribute("data-step", "3");
    await expect(page.locator("[data-sidebar]").getByText("2 of 3")).toBeVisible();
    await expect(page.getByText("WHEN, THEN and the recovery criterion are all required.")).toBeVisible();
    await noOverflow();
    await page.getByLabel("WHEN", { exact: true }).fill("I notice myself delaying my first work block");
    await page.getByLabel("THEN", { exact: true }).fill("I start a 10-minute timer on the smallest executable task");
    await page.getByLabel("RECOVERED WHEN", { exact: true }).fill("The timer is running within 10 minutes");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Overview: 3 of 3, the three cards, no sprints yet.
    const overview = page.getByTestId("vision-overview");
    await expect(overview).toBeVisible();
    await expect(page.getByTestId("vision-steps")).toHaveText("3 of 3 steps");
    await noOverflow();
    await expect(page.getByTestId("card-picture")).toContainText("Morning run before the kids wake");
    await expect(page.getByTestId("card-goal")).toContainText("Confidence 5/10");
    await expect(page.getByTestId("card-obstacle")).toContainText("WHEN I notice myself delaying my first work block → THEN I start a 10-minute timer on the smallest executable task");
    await expect(page.getByTestId("card-sprints")).toContainText("No sprints yet.");
    await expect(page.getByTestId("vision-meta")).toContainText("Not reviewed yet");
    await expect(page.locator("[data-sidebar]").getByText("3 of 3")).toBeVisible();

    // F15: the obstacle cannot join a sprint until it applies to a situation. The library
    // card says so (blocked state); Edit → name the situation inline → Save.
    await page.goto("/vision/impediments");
    // Anchor on the item id: in edit mode the name sits in an input value, which a text
    // filter does not see.
    const obstacleId = await page.getByTestId("library-item").filter({ hasText: "I notice myself delaying my first work block" }).getAttribute("data-item-id");
    const obstacleCard = page.locator(`[data-testid="library-item"][data-item-id="${obstacleId}"]`);
    await expect(obstacleCard).toHaveAttribute("data-blocked", "true");
    await expect(obstacleCard.locator("[data-part=applies-to][data-missing]")).toContainText("no situation yet");
    await expect(obstacleCard.getByTestId("usage-line")).toHaveText("Blocked · no situation");
    await obstacleCard.getByRole("button", { name: /^Edit / }).click();
    const obstacleEditor = obstacleCard.locator("form");
    await expect(obstacleEditor.getByTestId("situations-empty")).toContainText("No situations yet");
    await expect(obstacleEditor.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
    await expect(obstacleEditor.getByText("Tick at least one situation.")).toBeVisible();
    // F17: situations are said as a list into one box; Enter sorts it, "Add all" creates and ticks them.
    await obstacleEditor.getByRole("textbox", { name: "Situations", exact: true }).fill("Starting late");
    await obstacleEditor.getByRole("textbox", { name: "Situations", exact: true }).press("Enter");
    await expect(obstacleEditor.getByRole("textbox", { name: "Situation 1" })).toHaveValue("Starting late");
    await obstacleEditor.getByRole("button", { name: /^Add all/ }).click();
    await expect(obstacleEditor.getByRole("checkbox", { name: "Starting late" })).toHaveAttribute("aria-checked", "true");
    await expect(obstacleEditor.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "false");
    await obstacleEditor.getByRole("button", { name: "Save" }).click();
    await expect(obstacleCard.locator("[data-part=applies-to]")).toHaveText("Starting late");
    await expect(obstacleCard).not.toHaveAttribute("data-blocked", "true");
    await expect(page.locator("[data-sidebar]").getByText("Situations", { exact: true })).toBeVisible();

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
    // F17: "Why this sprint matters" is gone from the wizard and the database.
    await expect(page.getByLabel("Why this sprint matters")).toHaveCount(0);
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

    // F17: the days 2–14 pre-planning is gone; day 1's box stays.
    await expect(page.getByTestId("intentions-toggle")).toHaveCount(0);
    await expect(page.getByLabel(/^Day 1 intention/)).toBeVisible();

    // F2 / F15: the sprint cannot start without 1–3 impediments and a highest with THEN → RECOVERED WHEN; cues are optional.
    const start = page.getByRole("button", { name: "Start sprint" });
    await expect(start).toBeDisabled();
    await expect(page.getByText("Select 1–3 impediments.")).toBeVisible();
    // F9: the vision's obstacle is a global impediment with its rule and, since the library step above, a situation.
    const impSetup = page.getByTestId("wizard-impediments");
    await impSetup.getByRole("checkbox", { name: /I notice myself delaying/ }).click();
    await expect(impSetup.getByRole("checkbox", { name: /I notice myself delaying/ })).toHaveAttribute("aria-checked", "true");
    await expect(impSetup.getByRole("checkbox", { name: /I notice myself delaying/ })).toContainText("applies to: Starting late");
    await expect(page.getByText("Designate the highest impediment.")).toBeVisible();
    await page.getByTestId("wizard-highest").getByRole("radio", { name: /I notice myself delaying/ }).click();
    // The rule written on the Vision tab is complete, so no response inputs open; there is no WHEN input anywhere in it.
    await expect(page.getByTestId("wizard-highest").getByLabel("THEN", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("wizard-highest").getByLabel("WHEN", { exact: true })).toHaveCount(0);
    // Cues are optional (F15): with the highest complete the sprint could start now.
    await expect(page.getByText("Select 1–3 execution cues.")).toHaveCount(0);
    await expect(page.getByText("Confirm the outcome advances the vision.")).toBeVisible();
    // A second impediment created inline needs its WHEN and at least one situation.
    const createImp = impSetup.getByRole("button", { name: "Create" });
    await impSetup.getByLabel("WHEN", { exact: true }).fill("Phone distraction");
    await expect(createImp).toBeDisabled();
    await expect(impSetup.getByText("WHEN and at least one situation are needed.")).toBeVisible();
    await impSetup.getByRole("textbox", { name: "Situations", exact: true }).fill("Phone on the desk");
    await impSetup.getByRole("textbox", { name: "Situations", exact: true }).press("Enter");
    await impSetup.getByRole("button", { name: /^Add all/ }).click();
    await expect(impSetup.getByRole("checkbox", { name: "Phone on the desk" })).toHaveAttribute("aria-checked", "true");
    await expect(createImp).toBeEnabled();
    await createImp.click();
    await expect(impSetup.getByRole("checkbox", { name: /^Phone distraction/ })).toHaveAttribute("aria-checked", "true");
    // Its response is still blank: it joined as a watched impediment, so the highest stays and the hint asks for its THEN.
    await expect(page.getByTestId("wizard-highest").getByRole("radio", { name: /I notice myself delaying/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/Phone distraction needs a THEN and a RECOVERED WHEN/)).toBeVisible();
    await page.getByTestId("wizard-highest").getByRole("radio", { name: /^Phone distraction/ }).click();
    await expect(page.getByText("The highest impediment needs THEN and a recovery criterion.")).toBeVisible();
    await page.getByTestId("wizard-highest").getByLabel("THEN", { exact: true }).fill("I put the phone in the drawer");
    await page.getByTestId("wizard-highest").getByLabel("RECOVERED WHEN").fill("The drawer is shut within a minute");
    await expect(page.getByText("Confirm the outcome advances the vision.")).toBeVisible();
    // Back to the vision's obstacle as the highest: Phone distraction's response is still typed only, so the hint returns.
    await page.getByTestId("wizard-highest").getByRole("radio", { name: /I notice myself delaying/ }).click();
    await expect(page.getByText(/Phone distraction needs a THEN and a RECOVERED WHEN/)).toBeVisible();
    // Untick it: the sprint carries the obstacle alone.
    await impSetup.getByRole("checkbox", { name: /^Phone distraction/ }).click();
    await expect(page.getByText("Confirm the outcome advances the vision.")).toBeVisible();
    // F6 / F15: a cue is a WHEN → REMIND pair with a situation; Create waits for all three.
    const cueSetup = page.getByTestId("wizard-cues");
    const createCue = cueSetup.getByRole("button", { name: "Create" });
    await cueSetup.getByLabel("REMIND").fill("Ask how much this pays");
    await expect(createCue).toBeDisabled();
    await cueSetup.getByLabel("WHEN", { exact: true }).fill("I schedule anything");
    await expect(createCue).toBeDisabled();
    await expect(cueSetup.getByText("WHEN, REMIND and at least one situation are needed.")).toBeVisible();
    await cueSetup.getByRole("textbox", { name: "Situations", exact: true }).fill("Scheduling");
    await cueSetup.getByRole("textbox", { name: "Situations", exact: true }).press("Enter");
    await cueSetup.getByRole("button", { name: /^Add all/ }).click();
    await expect(cueSetup.getByRole("checkbox", { name: "Scheduling" })).toHaveAttribute("aria-checked", "true");
    await expect(createCue).toBeEnabled();
    await createCue.click();
    await expect(cueSetup.getByRole("checkbox", { name: "Ask how much this pays" })).toHaveAttribute("aria-checked", "true");
    await expect(cueSetup.getByRole("checkbox", { name: "Ask how much this pays" })).toContainText("WHEN I schedule anything · applies to: Scheduling");
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

    // F2 / F15: the rail's Highest card with WHEN (its name) → THEN → RECOVERED WHEN → APPLIES TO; the cues card with the focus.
    const highest = page.getByTestId("highest-impediment");
    await expect(highest.getByTestId("highest-name")).toContainText("I notice myself delaying my first work block");
    expect(await highest.getByTestId("highest-name").evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    await expect(highest.getByTestId("proof-when")).toHaveCount(0);
    await expect(highest.getByTestId("proof-then")).toHaveText("I start a 10-minute timer on the smallest executable task");
    await expect(highest.getByTestId("proof-recover")).toHaveText("The timer is running within 10 minutes");
    await expect(highest.getByTestId("highest-situations")).toHaveText("Starting late");
    await expect(highest.getByTestId("also-watching")).toContainText("1 of 3");
    await expect(page.getByTestId("sprint-items")).toContainText("1 of 3");
    await expect(page.getByTestId("sprint-items").getByText("Ask how much this pays")).toBeVisible();
    await expect(page.getByTestId("sprint-items").getByText("WHEN I schedule anything")).toBeVisible();
    await expect(page.getByTestId("sprint-items").getByTestId("cue-situations-line")).toContainText("Scheduling");
    // F7 / F15: the focus cue carries the tag; as the sprint's only cue it can still be removed (0–3 cues).
    const focusRow = page.getByTestId("sprint-items").getByTestId("sprint-item").filter({ hasText: "Ask how much this pays" });
    await expect(focusRow.getByTestId("focus-tag")).toHaveText("FOCUS");
    await expect(focusRow.getByRole("button", { name: "Remove Ask how much this pays" })).toBeVisible();
    // F6 / F15: the Today Add-cue picker's create row is a WHEN + REMIND pair with a situation tick too.
    await page.getByRole("button", { name: "Add cue" }).click();
    const picker = page.getByRole("dialog");
    const createInPicker = picker.getByRole("button", { name: "Create" });
    await picker.getByLabel("REMIND").fill("Close the laptop at nine");
    await expect(createInPicker).toHaveAttribute("aria-disabled", "true");
    await picker.getByLabel("WHEN", { exact: true }).fill("the clock shows 9 pm");
    await expect(createInPicker).toHaveAttribute("aria-disabled", "true");
    await picker.getByRole("checkbox", { name: "Scheduling" }).click();
    await expect(createInPicker).toHaveAttribute("aria-disabled", "false");
    await createInPicker.click();
    await expect(picker.getByRole("radio", { name: /Close the laptop at nine/ })).toHaveAttribute("aria-checked", "true");
    await picker.getByRole("button", { name: "Add to sprint" }).click();
    await expect(page.getByTestId("sprint-items")).toContainText("2 of 3");
    await expect(page.getByTestId("sprint-items").getByText("WHEN the clock shows 9 pm")).toBeVisible();
    // With a second cue in the sprint the focus is guarded again.
    await expect(focusRow.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    // F7: "Set as focus" moves the tag to the new cue and frees the old one.
    await page.getByRole("button", { name: "Set as focus: Close the laptop at nine" }).click();
    const newFocusRow = page.getByTestId("sprint-items").getByTestId("sprint-item").filter({ hasText: "Close the laptop at nine" });
    await expect(newFocusRow.getByTestId("focus-tag")).toHaveText("FOCUS");
    await expect(focusRow.getByTestId("focus-tag")).toHaveCount(0);
    await expect(focusRow.getByRole("button", { name: "Remove Ask how much this pays" })).toBeVisible();
    await page.getByRole("button", { name: "Set as focus: Ask how much this pays" }).click();
    await expect(focusRow.getByTestId("focus-tag")).toHaveText("FOCUS");

    // F3: the plan lives on the timeline's future rows. The sprint started custom; day 1
    // is today, day 7 is the zero the wizard saved.
    const timeline = page.getByTestId("timeline");
    await rows.nth(2).getByRole("button", { name: /Rest of the sprint/ }).click();
    await expect(timeline.getByTestId("plan-target-7")).toHaveText("0");
    await expect(timeline.getByTestId("plan-target-8")).toHaveText("1,142");
    await expect(timeline.locator('[data-day="1"]')).toHaveAttribute("data-kind", "today");
    await expect(timeline.locator('[data-day="8"]')).toHaveAttribute("data-kind", "future");
    const day2 = await admin.from("sprint_days").select("intention").eq("user_id", user.id).eq("day_index", 2).single();
    expect(day2.error).toBeNull();
    // F17: no pre-planned intention reaches day 2; it is written on its own day.
    expect(day2.data!.intention).toBeNull();

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
    // F15: observations per item. An impediment answered Yes asks which situations, then a
    // recovery per ticked situation; a cue answered Yes asks which situations it applied to.
    // The response-ran and cost questions are gone.
    const impItem = today.getByTestId("impediment-item").filter({ hasText: "I notice myself delaying" });
    await expect(impItem.getByTestId("highest-tag")).toHaveText("HIGHEST");
    const cueItem = today.getByTestId("cue-item").filter({ hasText: "Ask how much this pays" });
    await expect(cueItem.getByTestId("focus-tag")).toHaveText("FOCUS");
    await expect(today.getByTestId("response-group")).toHaveCount(0);
    await expect(today.getByTestId("impact-group")).toHaveCount(0);
    await impItem.getByRole("radio", { name: "Yes" }).click();
    await expect(impItem.getByTestId("impediment-situations")).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(today.locator("#close-hint")).toHaveText("Tick at least one situation for I notice myself delaying my first work block.");
    await impItem.getByRole("checkbox", { name: "Starting late" }).click();
    await expect(confirm).toBeEnabled();
    const recoveryRow = impItem.getByTestId("situation-recovery");
    await expect(recoveryRow).toContainText("Starting late · Recovered?");
    await recoveryRow.getByRole("radio", { name: "Yes" }).click();
    await expect(recoveryRow.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
    await cueItem.getByRole("radio", { name: "Yes" }).click();
    await expect(confirm).toBeDisabled();
    await expect(today.locator("#close-hint")).toHaveText("Tick at least one situation for Ask how much this pays.");
    await cueItem.getByRole("checkbox", { name: "Scheduling" }).click();
    await expect(confirm).toBeEnabled();
    // Tasks are read-only while closing; the second cue stays untouched (stored as unanswered).
    await expect(today.getByLabel("Task 1")).toBeDisabled();
    await today.getByLabel("Note").fill("The timer worked.");
    await confirm.click();

    // The card flips to Closed: result, summary line, note, "Set up tomorrow".
    await expect(today).toHaveAttribute("data-state", "closed");
    await expect(page.getByTestId("closed-actual")).toHaveText("600");
    await expect(page.getByTestId("closed-actual")).toHaveAttribute("data-state", "at-or-above");
    const summaryLine = "Showed up: I notice myself delaying my first work block (Starting late; recovered 1 of 1) · Cues used: Ask how much this pays (Scheduling)";
    await expect(page.getByTestId("day-summary")).toHaveText(summaryLine);
    await expect(today.getByText("“The timer worked.”")).toBeVisible();
    await expect(page.getByTestId("day-locked")).toHaveText("Day closed · locked · tomorrow's target 572");
    const setup = page.getByTestId("setup-tomorrow");
    await expect(setup).toContainText("Set up tomorrow · Day 2");
    // Untouched cues are offered; the focus cue never is; the highest never is.
    await expect(setup.getByTestId("quiet-cue")).toHaveCount(1);
    await expect(setup.getByTestId("quiet-cue")).toContainText("Close the laptop at nine");
    await expect(setup.getByTestId("quiet-impediment")).toHaveCount(0);
    await setup.getByRole("button", { name: "Remove Close the laptop at nine" }).click();
    await expect(setup.getByTestId("quiet-cue")).toHaveCount(0);
    await expect(page.getByTestId("sprint-items")).toContainText("1 of 3");
    await setup.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("setup-tomorrow")).toHaveCount(0);
    // F5: an on-time close starts the streak; the progress block moved on.
    await expect(page.getByTestId("streak-label")).toHaveText("1-day streak");
    await expect(page.getByTestId("sprint-progress")).toContainText("600 of 8,000 USD");
    await expect(page.getByTestId("sprint-progress").locator('.j-seg[data-day="1"]')).toHaveAttribute("data-closed", "true");
    // F15: the day row names the highest and nothing else (the legacy answer columns stay
    // null); one observation row per offered item with the response snapshot on it, one
    // situation row per offered situation, the untouched cue as unanswered.
    const dayRow = await admin.from("sprint_days").select("id, response, recovered, impact, proof_recover, highest_impediment_id").eq("user_id", user.id).eq("day_index", 1).single();
    expect(dayRow.data).toMatchObject({ response: null, recovered: null, impact: null, proof_recover: null });
    expect(dayRow.data!.highest_impediment_id).not.toBeNull();
    const impRows = await admin.from("day_impediment_observations").select("id, name, occurred, was_highest, proof_recover").eq("sprint_day_id", dayRow.data!.id).order("name");
    expect(impRows.data!.map((r) => ({ name: r.name, occurred: r.occurred, was_highest: r.was_highest, proof_recover: r.proof_recover }))).toEqual([{ name: "I notice myself delaying my first work block", occurred: "yes", was_highest: true, proof_recover: "The timer is running within 10 minutes" }]);
    const sitRows = await admin.from("day_impediment_situation_observations").select("name, occurred, recovered").eq("observation_id", impRows.data![0].id);
    expect(sitRows.data).toEqual([{ name: "Starting late", occurred: true, recovered: "yes" }]);
    const cueRows = await admin.from("day_cue_observations").select("id, name, used, was_focus").eq("sprint_day_id", dayRow.data!.id).order("name");
    expect(cueRows.data!.map((r) => ({ name: r.name, used: r.used, was_focus: r.was_focus }))).toEqual([
      { name: "Ask how much this pays", used: "yes", was_focus: true },
      { name: "Close the laptop at nine", used: "unanswered", was_focus: false },
    ]);
    const cueSitRows = await admin.from("day_cue_situation_observations").select("name, applied").in("observation_id", cueRows.data!.map((r) => r.id)).order("name");
    expect(cueSitRows.data).toEqual([
      { name: "Scheduling", applied: true },
      { name: "Scheduling", applied: false },
    ]);
    // Reload: still locked; intention read-only, tasks read-only, no close button, no "Set up tomorrow".
    await page.reload();
    await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "closed");
    await expect(page.getByTestId("day-summary")).toHaveText(summaryLine);
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
    // U1: this Area's chip is selected, so its outcome line shows on both viewports; the others stay clipped.
    await expect(page.locator("[data-sidebar]").getByText("Save $8,000 toward the emergency fund")).toBeVisible();
    await expect(page.locator("[data-sidebar]").getByText("No active sprint").first()).toHaveCSS("clip", "rect(0px, 0px, 0px, 0px)");
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
    await expect(reviewCard).toContainText("Proof you named: three runs a week held for a quarter. 1 sprint has run behind it.");
    await reviewCard.getByLabel(/What shows it/).fill("Ran Monday and Wednesday.");
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
    const item = page.getByTestId("library-item").filter({ hasText: "I notice myself delaying my first work block" });
    // F6 / F15: the card shows the labelled parts (WHEN is the name), APPLIES TO, and the three-state usage line.
    await expect(item.getByText("In an active sprint")).toBeVisible();
    await expect(item.locator("[data-part=when]")).toHaveText("I notice myself delaying my first work block");
    // F16: INTERFERES is gone from the card.
    await expect(item.locator("[data-part=interferes]")).toHaveCount(0);
    await expect(item.locator("[data-part=recovered]")).toHaveText("The timer is running within 10 minutes");
    await expect(item.locator("[data-part=applies-to]")).toHaveText("Starting late");
    await expect(page.getByTestId("library-count")).toHaveText("2 · 0 archived");
    await item.getByRole("button", { name: "Archive" }).click();
    // F9: the vision's obstacle is guarded before any sprint rule is consulted.
    await expect(item.getByRole("alert")).toContainText("This impediment is the vision's main obstacle.");
    await page.reload();
    await expect(page.getByTestId("library-item").filter({ hasText: "I notice myself delaying my first work block" })).toBeVisible();
    await page.getByRole("button", { name: /Show archived/ }).click();
    await expect(page.getByText("Nothing archived yet.")).toBeVisible();

    // F15 / F17: the one situations library — the three named inline are here; the
    // obstacle's is applied by an impediment in an active sprint, so it can neither be
    // archived nor deleted while the sprint would keep no other; the old routes redirect.
    await page.goto("/vision/impediment-situations");
    await expect(page).toHaveURL(/\/vision\/situations$/);
    const situationsPage = page.getByTestId("situations-page");
    await expect(situationsPage.getByTestId("library-count")).toHaveText("3 · 0 archived");
    const startingLate = situationsPage.getByTestId("situation-item").filter({ hasText: "Starting late" });
    await expect(startingLate.getByTestId("usage-line")).toHaveText("Applied by 1 item · in an active sprint");
    await startingLate.getByRole("button", { name: "Archive" }).click();
    await expect(startingLate.getByRole("alert")).toContainText("one of its items would be left without a situation");
    await startingLate.getByRole("button", { name: "Delete Starting late" }).click();
    await expect(page.getByTestId("delete-situation")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Removed from: I notice myself delaying my first work block.");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(startingLate.getByRole("alert")).toContainText("Delete is blocked");
    await expect(startingLate.getByRole("alert")).toContainText("one of its items would be left without a situation");
    await expect(startingLate).toBeVisible();
    await noOverflow();
    // A loose situation, said into the tab's box, is deleted outright.
    const addSituations = situationsPage.getByTestId("library-add");
    await addSituations.getByRole("textbox", { name: "Situations", exact: true }).fill("Temporary situation, another one");
    await addSituations.getByRole("button", { name: "Sort into parts" }).click();
    await expect(addSituations.getByRole("textbox", { name: "Situation 2" })).toHaveValue("another one");
    await addSituations.getByRole("button", { name: "Remove situation 2" }).click();
    await addSituations.getByRole("button", { name: "Add", exact: true }).click();
    const temporarySituation = situationsPage.getByTestId("situation-item").filter({ hasText: "Temporary situation" });
    await expect(temporarySituation.getByTestId("usage-line")).toHaveText("Unused");
    await expect(situationsPage.getByTestId("library-count")).toHaveText("4 · 0 archived");
    await temporarySituation.getByRole("button", { name: "Delete Temporary situation" }).click();
    await expect(page.getByRole("dialog")).toContainText("It is not applied to any cue or impediment.");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(temporarySituation).toHaveCount(0);
    await expect(situationsPage.getByTestId("library-count")).toHaveText("3 · 0 archived");

    // An unused cue can be deleted; a used one only archived (rule 19).
    await page.goto("/vision/cues");
    // F6 / F15: the library Add form needs WHEN, REMIND and a situation; the hint names them until they are filled.
    const addCue = page.getByTestId("library-add");
    const addButton = addCue.getByRole("button", { name: "Add", exact: true }).last();
    // F17: one box; the hint names the first missing part, then the situation; no NOTE anywhere.
    await expect(addCue.getByText("NOTE", { exact: true })).toHaveCount(0);
    await expect(addCue.getByText("Say the moment you will recognise (WHEN).")).toBeVisible();
    // A sentence without the REMIND part: the sort leaves it blank, the hint names it, Save is refused and nothing is written.
    const cuesBefore = await admin.from("cues").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    await addCue.getByRole("textbox", { name: "Execution cue", exact: true }).fill("When I open the calendar.");
    await addCue.getByRole("button", { name: "Sort into parts" }).first().click();
    await expect(addCue.getByLabel("WHEN", { exact: true })).toHaveValue("I open the calendar");
    await expect(addCue.getByText("Say what to remind yourself (REMIND).")).toBeVisible();
    await expect(addButton).toHaveAttribute("aria-disabled", "true");
    // Enter in a part submits the form; the refused save lands the cursor on the missing part.
    await addCue.getByLabel("WHEN", { exact: true }).press("Enter");
    await expect(addCue.getByLabel("REMIND")).toBeFocused();
    const cuesAfter = await admin.from("cues").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    expect(cuesAfter.count).toBe(cuesBefore.count);
    await addCue.getByRole("textbox", { name: "Execution cue", exact: true }).fill("When I open the calendar, remind me to Temporary cue.");
    await addCue.getByRole("button", { name: "Sort into parts" }).first().click();
    await expect(addCue.getByLabel("WHEN", { exact: true })).toHaveValue("I open the calendar");
    await expect(addCue.getByLabel("REMIND")).toHaveValue("Temporary cue");
    await expect(addButton).toHaveAttribute("aria-disabled", "true");
    await expect(addCue.getByText("Tick at least one situation.")).toBeVisible();
    await addCue.getByRole("checkbox", { name: "Scheduling" }).click();
    await expect(addButton).toHaveAttribute("aria-disabled", "false");
    await addButton.click();
    const temp = page.getByTestId("library-item").filter({ hasText: "Temporary cue" });
    await expect(temp.getByText("Unused")).toBeVisible();
    await expect(temp.locator("[data-part=when]")).toHaveText("I open the calendar");
    await expect(temp.locator("[data-part=remind]")).toHaveText("Temporary cue");
    await expect(temp.locator("[data-part=applies-to]")).toHaveText("Scheduling");
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
    const seededImp = await admin.from("impediments").insert({ user_id: user.id, name: "I see a deal", proof_then: "I wait a day", proof_recover: "No purchase that day" }).select("id").single();
    if (seededCue.error || seededImp.error) throw new Error((seededCue.error ?? seededImp.error)!.message);
    // F15: every member applies to a situation.
    const sits = await admin
      .from("situations")
      .insert([
        { user_id: user.id, name: "Banking app", rank: 1 },
        { user_id: user.id, name: "Impulse spend", rank: 2 },
      ])
      .select("id, name");
    if (sits.error) throw new Error(sits.error.message);
    const attach = await Promise.all([
      admin.from("cue_situations").insert({ user_id: user.id, cue_id: seededCue.data.id, situation_id: sits.data.find((s) => s.name === "Banking app")!.id }),
      admin.from("impediment_situations").insert({ user_id: user.id, impediment_id: seededImp.data.id, situation_id: sits.data.find((s) => s.name === "Impulse spend")!.id }),
    ]);
    for (const a of attach) if (a.error) throw new Error(a.error.message);
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
    // F7 / F15: No on both items; nothing blocks the close, every offered item is stored as `no` and no situation is ticked.
    await expect(dialog.getByTestId("use-group").getByTestId("focus-tag")).toHaveText("FOCUS");
    await dialog.getByTestId("cue-item").getByRole("radio", { name: "No" }).click();
    await dialog.getByTestId("impediment-item").getByRole("radio", { name: "No" }).click();
    await expect(dialog.getByTestId("impediment-situations")).toHaveCount(0);
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
    const noCue = await admin.from("day_cue_observations").select("id, name, used, was_focus").eq("sprint_day_id", closed.data!.id);
    expect(noCue.data!.map((r) => ({ name: r.name, used: r.used, was_focus: r.was_focus }))).toEqual([{ name: "Check the balance first", used: "no", was_focus: true }]);
    const noImp = await admin.from("day_impediment_observations").select("id, name, occurred, was_highest").eq("sprint_day_id", closed.data!.id);
    expect(noImp.data!.map((r) => ({ name: r.name, occurred: r.occurred, was_highest: r.was_highest }))).toEqual([{ name: "I see a deal", occurred: "no", was_highest: true }]);
    const noSit = await admin.from("day_impediment_situation_observations").select("name, occurred, recovered").eq("observation_id", noImp.data![0].id);
    expect(noSit.data).toEqual([{ name: "Impulse spend", occurred: false, recovered: null }]);
  });

  test("F10: finish a sprint → the gate → the postmortem → the kit pre-fills the next sprint", async ({ page }) => {
    // The postmortem is a two-column grid with four cards and a bar chart in each: at
    // 390px it must stack, not scroll sideways.
    const noOverflow = async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    };

    // A Relationships sprint whose 14 days are all in the past: the window has run out, so the
    // Today slot offers Finish the sprint and nothing has closed it on a page load.
    const todayUtc = localDateIn("UTC", new Date());
    const start = addDays(todayUtc, -20);
    const sprint = await insertSprintRows(admin, user.id, {
      startDate: start,
      tz: "UTC",
      area: "relationships",
      target: 10_000,
      outcome: "Run 40 km",
      mantra: "Slow is still a run.",
    });

    const cue = await admin.from("cues").insert({ user_id: user.id, name: "Shoes by the door", cue_when: "I get home" }).select("id").single();
    const imp = await admin
      .from("impediments")
      .insert({ user_id: user.id, name: "Late meetings", proof_then: "I run the short loop", proof_recover: "I am out of the door within 20 minutes" })
      .select("id")
      .single();
    if (cue.error || imp.error) throw new Error((cue.error ?? imp.error)!.message);
    // F15: the impediment applies to one situation; every occurrence below is that situation.
    const sits = await admin
      .from("situations")
      .insert([
        { user_id: user.id, name: "A meeting runs past 6", rank: 1 },
        { user_id: user.id, name: "Coming home", rank: 2 },
      ])
      .select("id, name");
    if (sits.error) throw new Error(sits.error.message);
    const impSit = sits.data.find((s) => s.name === "A meeting runs past 6")!.id;
    const cueSit = sits.data.find((s) => s.name === "Coming home")!.id;
    const attach = await Promise.all([
      admin.from("impediment_situations").insert({ user_id: user.id, impediment_id: imp.data.id, situation_id: impSit }),
      admin.from("cue_situations").insert({ user_id: user.id, cue_id: cue.data.id, situation_id: cueSit }),
    ]);
    for (const a of attach) if (a.error) throw new Error(a.error.message);
    const addedAt = `${start}T00:00:00Z`;
    const members = await Promise.all([
      admin.from("sprint_cues").insert({ sprint_id: sprint.sprintId, user_id: user.id, cue_id: cue.data.id, is_focus: true, added_at: addedAt }),
      admin.from("sprint_impediments").insert({ sprint_id: sprint.sprintId, user_id: user.id, impediment_id: imp.data.id, is_highest: true, added_at: addedAt }),
    ]);
    for (const m of members) if (m.error) throw new Error(m.error.message);

    // Day 1 carried a task, written before the day closes (a closed day is locked, F4).
    // The postmortem is the only place it can be read back (F8 left closed rows one line).
    const task = await admin.from("tasks").insert({ sprint_day_id: sprint.dayIds[0], user_id: user.id, text: "Lay out the kit", done: true });
    if (task.error) throw new Error(task.error.message);

    // Eight closed days: the highest showed up on four of them (recovered on two), so the
    // verdict is asked. Days 9–14 were never closed and stay missed — finishing does not
    // cancel a past day.
    const actuals = [5_000, 6_000, 7_000, 8_000, 20_000, 15_000, 13_000, 12_000]; // 860 USD in minor units
    for (let i = 0; i < actuals.length; i++) {
      const occurred = i < 4 ? "yes" : "no";
      const day = await admin
        .from("sprint_days")
        .update({ actual: actuals[i], closed_at: new Date().toISOString(), closed_on_time: true, highest_impediment_id: imp.data.id })
        .eq("id", sprint.dayIds[i])
        .select("id")
        .single();
      if (day.error) throw new Error(day.error.message);
      const [io, co] = await Promise.all([
        admin
          .from("day_impediment_observations")
          .insert({ sprint_day_id: day.data.id, user_id: user.id, impediment_id: imp.data.id, name: "Late meetings", occurred, was_highest: true, proof_then: "I run the short loop", proof_recover: "I am out of the door within 20 minutes" })
          .select("id")
          .single(),
        admin.from("day_cue_observations").insert({ sprint_day_id: day.data.id, user_id: user.id, cue_id: cue.data.id, name: "Shoes by the door", used: i % 2 === 0 ? "yes" : "no", was_focus: true }).select("id").single(),
      ]);
      if (io.error || co.error) throw new Error((io.error ?? co.error)!.message);
      const sitRows = await Promise.all([
        admin.from("day_impediment_situation_observations").insert({ observation_id: io.data.id, user_id: user.id, situation_id: impSit, name: "A meeting runs past 6", occurred: i < 4, recovered: i < 4 ? (i % 2 === 0 ? "yes" : "no") : null }),
        admin.from("day_cue_situation_observations").insert({ observation_id: co.data.id, user_id: user.id, situation_id: cueSit, name: "Coming home", applied: i % 2 === 0 }),
      ]);
      for (const r of sitRows) if (r.error) throw new Error(r.error.message);
    }
    await signInViaMagicLink(page, user.email);
    await page.goto("/sprints/relationships");

    // The window has passed and the sprint is still open: nothing closed it on load.
    const finish = page.getByTestId("sprint-ended");
    await expect(finish).toContainText("All 14 days have passed");
    await expect(finish).toContainText("8 of 14 days closed");
    await page.getByTestId("finish-sprint").click();

    // The gate replaces the journal, and the sidebar says the area needs a review.
    const gate = page.getByTestId("review-gate");
    await expect(gate).toContainText("Relationships · sprint ended");
    await expect(gate).toContainText("stays locked until its postmortem is finished");
    await expect(page.getByTestId("gate-meta")).toContainText("860 of 1,400 USD · under · 8 of 14 days closed");
    await noOverflow();

    await gate.getByRole("link", { name: "Open the postmortem" }).click();
    await expect(page).toHaveURL(new RegExp(`/insights/reviews/${sprint.sprintId}$`));

    const pm = page.getByTestId("postmortem");
    await expect(page.getByTestId("result-total")).toContainText("860");
    await expect(page.getByTestId("result-meta")).toContainText("61% · under · 8 days closed · 6 not closed · best streak 8");
    await expect(pm.getByTestId("card-impact")).toBeVisible();
    await expect(pm.getByTestId("card-followthrough")).toHaveCount(0);
    await expect(pm.getByTestId("card-recovery")).toContainText("4 occurrences · 4 answered");
    await expect(pm.getByTestId("card-recovery")).toContainText("50% recovered");
    // F15: the situation line under the item, in the impact card and the recovery card.
    await expect(pm.getByTestId("card-impact").getByTestId("situation-line")).toContainText("A meeting runs past 6");
    await expect(pm.getByTestId("card-impact").getByTestId("situation-line")).toContainText("4 occurrences · 50% recovered");
    await expect(pm.getByTestId("card-cues")).toContainText("Shoes by the door");
    await expect(pm.getByTestId("card-cues").getByTestId("situation-line")).toContainText("Coming home");
    await expect(pm.getByTestId("card-cues").getByTestId("situation-line")).toContainText("applied on 4 days");
    await expect(pm.getByTestId("proof-observation")).toContainText("Showed up on 4 logged days · recovered 2 of 4 answered");
    await noOverflow();

    // The one place a closed day's tasks are readable.
    await pm.getByTestId("day-by-day").getByText("Day by day").click();
    await expect(pm.getByTestId("day-by-day")).toContainText("Lay out the kit");

    // Blocked until the lesson, the vision answer and the verdict are all given.
    const finishReview = page.getByTestId("finish-review");
    await expect(finishReview).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#pm-hint")).toHaveText("One lesson, the vision answer and a proof-point verdict are required.");
    await pm.getByLabel("Key lesson").fill("Runs happen when the shoes are already by the door.");
    await pm.getByRole("button", { name: "Yes, it advanced it" }).click();
    await expect(finishReview).toHaveAttribute("aria-disabled", "true");
    await pm.getByRole("button", { name: "Partly worked" }).click();
    await expect(finishReview).toHaveAttribute("aria-disabled", "false");

    // The kit preview follows the decisions before anything is saved.
    await expect(page.getByTestId("kit-card")).toContainText("Late meetings");
    await pm.getByTestId("carry-row").filter({ hasText: "Late meetings" }).getByRole("button", { name: "Promote to highest" }).click();

    await finishReview.click();
    await expect(page.getByTestId("reviewed-line")).toContainText("Reviewed");
    await expect(page.getByLabel("Key lesson")).toHaveCount(0);
    await noOverflow();

    // The sidebar row flips, and the Area's gate is gone.
    await expect(page.locator('[data-sidebar]').getByText("Needs review")).toHaveCount(0);
    await page.goto("/sprints/relationships");
    await expect(page.getByTestId("empty-state")).toContainText("No sprint running in Relationships");
    await expect(page.getByTestId("last-postmortem")).toBeVisible();

    // The next Relationships sprint starts from the kit.
    await page.goto("/sprints/new?area=relationships");
    await page.getByLabel("Sprint outcome").fill("Run 50 km");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/Sprint goal/).fill("1400");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Confidence 7" }).click();
    await page.getByLabel(/Celebration/).fill("New shoes");
    await page.getByLabel(/Mantra/).fill("Slow is still a run.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByTestId("wizard-kit")).toContainText("Pre-filled from your last Relationships review");
    await expect(page.getByTestId("wizard-impediments").getByRole("checkbox", { name: /Late meetings/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("wizard-highest").getByRole("radio", { name: /Late meetings/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("wizard-cues").getByRole("checkbox", { name: /Shoes by the door/ })).toHaveAttribute("aria-checked", "true");

    // What the database actually holds.
    const finished = await admin.from("sprints").select("status, closed_at").eq("id", sprint.sprintId).single();
    expect(finished.data).toMatchObject({ status: "ended" });
    expect(finished.data!.closed_at).not.toBeNull();
    const review = await admin.from("reviews").select("id, lesson, moved_vision, verdict").eq("sprint_id", sprint.sprintId).single();
    expect(review.data).toMatchObject({ moved_vision: true, verdict: "partly" });
    const decisions = await admin.from("review_decisions").select("kind, decision").eq("review_id", review.data!.id);
    expect(decisions.data!.sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: "cue", decision: "keep" },
      { kind: "impediment", decision: "highest" },
    ]);
    // Finishing after the window cancels nothing: the six unclosed days stay missed.
    const cancelled = await admin.from("sprint_days").select("day_index").eq("sprint_id", sprint.sprintId).eq("cancelled", true);
    expect(cancelled.data).toEqual([]);

    // F11: the finished sprint is now the whole history, so Across sprints reads it and
    // the sidebar row carries the measurement Part 2 §1 is read from.
    await page.goto("/insights");
    const across = page.getByTestId("across");
    await expect(across).toBeVisible();
    await expect(page.getByTestId("across-evidence")).toHaveText(/^1 sprint · \d+ closed days · \d+ on target/);
    await expect(page.locator("[data-sidebar] .side-result").first()).toHaveText(/^(Met|Under) · \d+% of goal · sprint ended$/);
    // This sprint's closed days DO clear n≥3, so the kit speaks — and every number in it
    // is one the cards above print. Asserted as the exact sentence set: a loose regex here
    // passed while the expected branch was wrong, which is worse than no assertion.
    // F15: the recovery sentence quotes the recovered share of the four answered situation
    // occurrences (2 of 4), the same rate the recovery card's tail shows.
    await expect(page.getByTestId("suggested-kit")).toContainText(
      "Keep Late meetings as the highest impediment; days it shows up run 75 points lower. " +
        "You recover from Late meetings 50% of the time.",
    );
    await expect(page.getByTestId("suggested-kit")).not.toContainText("runs");
    await expect(page.getByTestId("suggested-kit")).not.toContainText("Not enough logged days yet");
    await expect(page.getByTestId("card-followthrough")).toHaveCount(0);
    await expect(page.getByTestId("card-impact").getByTestId("situation-line")).toContainText("A meeting runs past 6");
    await noOverflow();

    // A scope with no finished sprint states the reason rather than emptying the page.
    await page.goto("/insights?scope=health");
    await expect(page.getByTestId("across-evidence")).toHaveText("No finished Health sprint");
    await expect(page.getByTestId("card-impact")).toContainText("No finished Health sprint yet.");
    await expect(page.getByTestId("suggested-kit")).toContainText("Nothing to suggest yet");
    await noOverflow();

    // Back to the area that has the history, and a junk scope is not a broken page.
    await page.goto("/insights?scope=relationships");
    await expect(page.getByTestId("across-evidence")).toHaveText(/^1 sprint/);
    await page.goto("/insights?scope=nonsense");
    await expect(page.getByTestId("across-evidence")).toHaveText(/^1 sprint/);
  });
});
