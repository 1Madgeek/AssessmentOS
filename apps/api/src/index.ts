import "dotenv/config";
import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

const app = await buildApp({
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://assessment:assessment@localhost:5433/assessmentos",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  judge0Url: process.env.JUDGE0_URL,
  useMockRunner:
    process.env.USE_MOCK_RUNNER === "true" || !process.env.JUDGE0_URL,
  webOrigin: process.env.WEB_ORIGIN ?? process.env.CORS_ORIGIN ?? "http://localhost:3000",
});

await app.listen({ port, host });
console.log(`AssessmentOS API listening on http://${host}:${port}`);
