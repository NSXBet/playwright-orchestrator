import { describe, expect, test } from "bun:test";
import { formatDuration } from "../src/core/format-duration.js";

describe("formatDuration", () => {
  test.each([
    [0, "0ms"],
    [999, "999ms"],
    [1000, "1s"],
    [1499, "1s"],
    [1500, "2s"],
    [59999, "1m"],
    [60000, "1m"],
    [61000, "1m1s"],
    [500000, "8m20s"],
    [3661000, "1h1m1s"],
    [90061000, "1d1h1m1s"],
  ])("formats %d milliseconds as %s", (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });

  test("rejects invalid durations", () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});
