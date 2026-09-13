import { describe, expect, it } from "vitest";
import { planEntrySteps, savedSoFar } from "@/lib/todayEntry";

describe("F19 today's entry — the plan of writes", () => {
  const ids = () => {
    let n = 0;
    return () => `id-${++n}`;
  };

  it("a fresh day: the intention first, then one create per task in order, each with its own client id; blanks dropped", () => {
    expect(planEntrySteps({ intention: " move the $600 ", tasks: ["call the bank", "  ", "move the $600"], existing: [] }, ids())).toEqual([
      { kind: "intention", text: "move the $600" },
      { kind: "create", id: "id-1", text: "call the bank" },
      { kind: "create", id: "id-2", text: "move the $600" },
    ]);
  });

  it("without a generator the ids are fresh UUIDs, one per create", () => {
    const steps = planEntrySteps({ intention: "x", tasks: ["a", "b"], existing: [] }).filter((s) => s.kind === "create") as { id: string }[];
    expect(steps.map((s) => s.id)).toHaveLength(2);
    expect(new Set(steps.map((s) => s.id)).size).toBe(2);
    for (const s of steps) expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a re-recording keeps every done task, archives each undone one, then creates the new list", () => {
    const steps = planEntrySteps(
      {
        intention: "ship the draft",
        tasks: ["send it", "ask for a read"],
        existing: [
          { id: "a", done: true },
          { id: "b", done: false },
          { id: "c", done: true },
          { id: "d", done: false },
        ],
      },
      ids(),
    );
    expect(steps).toEqual([
      { kind: "intention", text: "ship the draft" },
      { kind: "archive", id: "b" },
      { kind: "archive", id: "d" },
      { kind: "create", id: "id-1", text: "send it" },
      { kind: "create", id: "id-2", text: "ask for a read" },
    ]);
    expect(steps.some((s) => s.kind === "archive" && (s.id === "a" || s.id === "c"))).toBe(false);
  });

  it("names what a failed run already wrote", () => {
    const steps = planEntrySteps({ intention: "x", tasks: ["one", "two"], existing: [] });
    expect(savedSoFar(steps, 0)).toBe("");
    expect(savedSoFar(steps, 1)).toBe("The intention is saved.");
    expect(savedSoFar(steps, 2)).toBe("The intention and 1 of 2 tasks are saved.");
    expect(savedSoFar(planEntrySteps({ intention: "x", tasks: [], existing: [] }), 1)).toBe("The intention is saved.");
  });
});
