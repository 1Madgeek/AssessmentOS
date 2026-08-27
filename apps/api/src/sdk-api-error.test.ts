import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createClient, getErrorMessage } from "@assessment-os/sdk";

describe("SDK ApiError parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getErrorMessage prefers ApiError", () => {
    expect(getErrorMessage(new ApiError(410, "Invite revoked"), "x")).toBe(
      "Invite revoked",
    );
  });

  it("surfaces JSON error string without status prefix", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invite revoked" }), {
          status: 410,
        }),
      ),
    );
    const client = createClient("http://test");
    await expect(client.getInvite("tok")).rejects.toMatchObject({
      name: "ApiError",
      status: 410,
      message: "Invite revoked",
    });
  });

  it("summarizes Zod flatten field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              formErrors: [],
              fieldErrors: { candidateEmail: ["Invalid email"] },
            },
          }),
          { status: 400 },
        ),
      ),
    );
    const client = createClient("http://test");
    await expect(
      client.requestInviteOtp("tok", { candidateEmail: "bad" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Invalid email"),
    });
  });
});
