import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/jobs/job-c-synthetics.js";

describe("synthetics formatting", () => {
  it("deve formatar durações corretamente", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3665)).toBe("1h 1m");
    expect(formatDuration(null)).toBe("N/D");
  });
});
