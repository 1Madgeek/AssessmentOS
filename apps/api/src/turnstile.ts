export type TurnstileVerifyFn = (
  token: string,
  remoteIp: string,
) => Promise<boolean>;

/**
 * When secret is unset (local/dev/tests), CAPTCHA is skipped.
 * When set, token must verify with Cloudflare Turnstile siteverify.
 */
export function createTurnstileVerifier(
  secretKey: string | undefined,
): TurnstileVerifyFn {
  if (!secretKey) {
    return async () => true;
  }
  const secret = secretKey;
  return async (token, remoteIp) => {
    if (!token.trim()) return false;
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp && remoteIp !== "unknown") {
      body.set("remoteip", remoteIp);
    }
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  };
}
