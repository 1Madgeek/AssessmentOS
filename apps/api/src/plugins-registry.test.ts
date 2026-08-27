import { describe, expect, it } from "vitest";
import { candidateSafeConfig } from "./plugins-registry.js";

describe("candidateSafeConfig", () => {
  it("leaves non-coding configs untouched", () => {
    const config = { multiSelect: false, correctOptionIds: ["a"] };
    expect(candidateSafeConfig("mcq", config)).toBe(config);
  });

  it("strips hidden I/O cases and hidden unit test code", () => {
    const safe = candidateSafeConfig("coding", {
      language: "python",
      mode: "unit",
      visibleTestCode: "def test_visible(): assert True",
      hiddenTestCode: "def test_secret(): assert False",
      visibleTests: [{ id: "v1", stdin: "", expectedStdout: "1" }],
      hiddenTests: [{ id: "h1", stdin: "secret", expectedStdout: "x" }],
      starterCode: "pass",
    });
    expect(safe.hiddenTestCode).toBe("");
    expect(safe.hiddenTests).toEqual([]);
    expect(safe.visibleTestCode).toBe("def test_visible(): assert True");
    expect(safe.visibleTests).toEqual([
      { id: "v1", stdin: "", expectedStdout: "1" },
    ]);
    expect(safe.starterCode).toBe("pass");
  });

  it("never leaves a residual secret key with content", () => {
    const safe = candidateSafeConfig("coding", {
      hiddenTestCode: "assert steal_flag()",
      hiddenTests: [{ id: "x", stdin: "pwn", expectedStdout: "ed" }],
    });
    expect(JSON.stringify(safe)).not.toContain("steal_flag");
    expect(JSON.stringify(safe)).not.toContain("pwn");
  });
});
