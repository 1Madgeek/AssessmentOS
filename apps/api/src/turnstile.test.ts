import { afterEach, describe, expect, it, vi } from "vitest";
import { createTurnstileVerifier } from "./turnstile.js";

describe("createTurnstileVerifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows any token when secret is unset", async () => {
    const verify = createTurnstileVerifier(undefined);
    expect(await verify("", "1.2.3.4")).toBe(true);
  });

  it("rejects empty token when secret is set", async () => {
    const verify = createTurnstileVerifier("test-secret");
    expect(await verify("", "1.2.3.4")).toBe(false);
  });

  it("posts to Cloudflare siteverify", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const verify = createTurnstileVerifier("test-secret");
    expect(await verify("tok-abc", "9.9.9.9")).toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("turnstile/v0/siteverify");
    expect(String(init.body)).toContain("secret=test-secret");
    expect(String(init.body)).toContain("response=tok-abc");
    expect(String(init.body)).toContain("remoteip=9.9.9.9");
  });

  it("returns false when Cloudflare reports failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      }),
    );
    const verify = createTurnstileVerifier("test-secret");
    expect(await verify("bad", "1.1.1.1")).toBe(false);
  });
});
