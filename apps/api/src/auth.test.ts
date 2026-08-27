import { describe, expect, it } from "vitest";
import {
  apiTokenPrefix,
  hashToken,
  newApiToken,
  newToken,
} from "./auth.js";

describe("token helpers", () => {
  it("hashToken is stable SHA-256 hex", () => {
    const a = hashToken("hello");
    const b = hashToken("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("hello")).not.toBe(hashToken("hell0"));
  });

  it("newApiToken uses aos_ prefix and enough entropy", () => {
    const token = newApiToken();
    expect(token.startsWith("aos_")).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    expect(newApiToken()).not.toBe(token);
  });

  it("apiTokenPrefix is first 12 chars", () => {
    const token = "aos_abcdef0123456789";
    expect(apiTokenPrefix(token)).toBe("aos_abcdef01");
    expect(apiTokenPrefix(token).length).toBe(12);
  });

  it("newToken is opaque hex without aos_ prefix", () => {
    const t = newToken();
    expect(t).toMatch(/^[a-f0-9]{64}$/);
    expect(t.startsWith("aos_")).toBe(false);
  });
});
