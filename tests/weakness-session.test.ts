import { describe, expect, it } from "vitest";

import { rankWeaknessQuestionCandidates } from "../app/src/lib/server/weakness-session";

describe("weakness session ranking", () => {
  it("uses deterministic tie-breaking when scores are equal", () => {
    const ranked = rankWeaknessQuestionCandidates(
      [
        { id: "q-b", tagIds: ["tag-1"], attempts: [] },
        { id: "q-a", tagIds: ["tag-1"], attempts: [] },
        { id: "q-c", tagIds: ["tag-1"], attempts: [] },
      ],
      new Map([["tag-1", 0]]),
      1,
    );

    expect(ranked).toEqual(["q-a", "q-b", "q-c"]);
  });
});
