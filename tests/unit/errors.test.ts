import { describe, expect, it } from "vitest";
import { friendlyError, GENERIC_SAVE_ERROR } from "@/lib/errors";

describe("friendlyError: which copy a database message earns", () => {
  it("a schema-cache miss is a deploy skew, never a user error, even when the function name contains a code", () => {
    expect(friendlyError("Could not find the function public.set_vision_obstacle(p_explanation, p_name) in the schema cache")).toBe(GENERIC_SAVE_ERROR);
  });

  it("the longest matching code wins: item_not_in_sprint is not read as not_in_sprint", () => {
    expect(friendlyError("item_not_in_sprint")).toBe("That item was not part of this sprint.");
    expect(friendlyError("not_in_sprint")).toBe("That item is not in this sprint.");
  });

  it("still maps a plain code and a foreign-key violation", () => {
    expect(friendlyError("tasks_text_check")).toBe("Write the task before saving.");
    expect(friendlyError('update or delete on table "cues" violates foreign key constraint')).toBe("That item has sprint history, so it can only be archived.");
    expect(friendlyError(undefined)).toBe(GENERIC_SAVE_ERROR);
  });
});
