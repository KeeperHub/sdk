import { describe, it, expect } from "vitest";
import { isReadResult } from "../src/index.js";
import type { DirectReadResult, DirectWriteResult } from "../src/index.js";

describe("isReadResult", () => {
  it("returns true for a read shape", () => {
    const read: DirectReadResult = { result: "1500000000000000000" };
    expect(isReadResult(read)).toBe(true);
  });

  it("returns false for a write shape", () => {
    const write: DirectWriteResult = {
      executionId: "direct_abc",
      status: "completed",
    };
    expect(isReadResult(write)).toBe(false);
  });

  it("treats result as the deciding key when both fields are present", () => {
    expect(
      isReadResult({
        result: "123",
        executionId: "x",
      } as unknown as DirectReadResult)
    ).toBe(true);
  });

  it("returns false for an empty object", () => {
    expect(isReadResult({} as unknown as DirectWriteResult)).toBe(false);
  });
});
