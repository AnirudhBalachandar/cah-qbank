import { describe, expect, it } from "vitest";

import { parseArgs, resolveAcceptedCountForAttempt } from "../scripts/generation/run_notes_workflow";

describe("conductor command contract", () => {
  it("keeps run-range command contracts explicit for dry-run and no-import", () => {
    const parsed = parseArgs([
      "run-range",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--from",
      "B10",
      "--to",
      "B12",
      "--dry-run",
      "--continue-on-failure",
    ]);

    expect(parsed).toMatchObject({
      name: "run-range",
      workflow: "cah-notes-mega-2026-03-16",
      from: "B10",
      to: "B12",
      continueOnFailure: true,
      dryRun: true,
      noImport: false,
    });
  });

  it("maps --no-import to the same acceptance accounting path as dry-run overlap count", () => {
    expect(resolveAcceptedCountForAttempt({
      importSkipped: true,
      mergedAcceptedCount: 9,
      createdCount: 4,
    })).toBe(9);

    expect(resolveAcceptedCountForAttempt({
      importSkipped: false,
      mergedAcceptedCount: 9,
      createdCount: 4,
    })).toBe(4);
  });
});
