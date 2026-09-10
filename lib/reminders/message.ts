import { areaName, isAreaKey } from "@/lib/areas";

/** What the email may know about a sprint day: the Area (a fixed label) and the day number. Nothing else exists here on purpose. */
export type OpenDay = { area: string; day_index: number };

export type Message = { subject: string; text: string; html: string };

function label(day: OpenDay): string {
  const area = isAreaKey(day.area) ? areaName(day.area) : day.area;
  return `${area} · Day ${day.day_index}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * One email per user per evening (SPEC F13). The body carries the Area name and the
 * day number of every open sprint day, and a link to the Sprints tab — never the
 * outcome, amount, targets, actuals, mantra, intention or notes. `origin` is the
 * app's own origin as the request saw it, so the link matches the deployment.
 */
export function buildReminder(days: OpenDay[], origin: string): Message {
  const lines = [...days].sort((a, b) => label(a).localeCompare(label(b))).map(label);
  const link = `${origin.replace(/\/$/, "")}/sprints`;
  const subject = lines.length === 1 ? `${lines[0]} is still open` : `${lines.length} sprint days are still open`;
  const text = [
    ...lines.map((l) => `${l} is still open.`),
    "",
    `Close the day before midnight: ${link}`,
    "",
    "You get this once an evening while a sprint day is open.",
  ].join("\n");
  const html = [
    "<div style=\"font-family:system-ui,sans-serif;font-size:16px;line-height:1.5\">",
    ...lines.map((l) => `<p style="margin:0 0 8px"><strong>${escapeHtml(l)}</strong> is still open.</p>`),
    `<p style="margin:16px 0"><a href="${escapeHtml(link)}">Close the day before midnight</a></p>`,
    "<p style=\"margin:0;color:#666;font-size:13px\">You get this once an evening while a sprint day is open.</p>",
    "</div>",
  ].join("");
  return { subject, text, html };
}
