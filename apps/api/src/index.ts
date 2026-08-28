import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

// pnpm --filter runs with cwd=apps/api; load repo-root .env then local override.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv({ path: path.resolve(here, "../.env"), override: true });

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

const app = await buildApp({
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://assessment:assessment@localhost:5433/assessmentos",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  judge0Url: process.env.JUDGE0_URL,
  useMockRunner:
    process.env.USE_MOCK_RUNNER === "true" || !process.env.JUDGE0_URL,
  webOrigin:
    process.env.WEB_ORIGIN ?? process.env.CORS_ORIGIN ?? "http://localhost:3000",
  resendApiKey,
  emailFrom,
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
  trustProxy: process.env.TRUST_PROXY === "true",
});

await app.listen({ port, host });
console.log(`AssessmentOS API listening on http://${host}:${port}`);
if (resendApiKey?.trim()) {
  console.log(
    `[mailer] Resend enabled (from=${emailFrom?.trim() || "AssessmentOS <onboarding@resend.dev>"})`,
  );
} else {
  console.log(
    "[mailer] Console mode — set RESEND_API_KEY in the repo-root .env and restart the API to send real email",
  );
}
