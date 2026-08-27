import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
config({ path: path.join(repoRoot, ".env") });

const url =
  process.env.DATABASE_URL ??
  "postgresql://assessment:assessment@localhost:5433/assessmentos";

const migrationsFolder = path.join(__dirname, "..", "drizzle");

async function main() {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  console.log("Connecting to", url.replace(/:[^:@]+@/, ":****@"));
  console.log("Running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  await client.end();
  console.log("Migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
