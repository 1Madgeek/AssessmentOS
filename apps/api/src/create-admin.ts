/**
 * Create a recruiter owner account (CLI).
 *
 * Usage:
 *   pnpm --filter @assessment-os/api create-admin -- --email a@b.com --password '...' --name 'Admin'
 *   node dist/create-admin.js --email a@b.com --password '...' --name 'Admin'
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createDb, recruiters } from "@assessment-os/db";
import { hashPassword } from "./auth.js";
import { ensureDefaultInviteTemplate } from "./email-templates.js";
import { ensurePersonalOrg } from "./org-auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv({ path: path.resolve(here, "../.env"), override: true });

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function usage(): never {
  console.error(
    "Usage: create-admin --email EMAIL --password PASSWORD [--name NAME]",
  );
  process.exit(1);
}

const email = (arg("--email") ?? process.env.ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();
const password = arg("--password") ?? process.env.ADMIN_PASSWORD ?? "";
const name = (arg("--name") ?? process.env.ADMIN_NAME ?? "Admin").trim();

if (!email || !password) usage();
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://assessment:assessment@localhost:5433/assessmentos";

const db = createDb(databaseUrl);

const existing = await db
  .select()
  .from(recruiters)
  .where(eq(recruiters.email, email))
  .limit(1);

if (existing[0]) {
  console.error(`Recruiter already exists: ${email}`);
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const user = (
  await db
    .insert(recruiters)
    .values({ email, name, passwordHash })
    .returning()
)[0]!;

const { organizationId } = await ensurePersonalOrg(db, user);
await ensureDefaultInviteTemplate(db, organizationId);

console.log(
  JSON.stringify(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId,
      role: "owner",
    },
    null,
    2,
  ),
);
process.exit(0);
