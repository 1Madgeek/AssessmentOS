import { and, eq } from "drizzle-orm";
import { candidates, type Db } from "@assessment-os/db";

export function normalizeCandidateEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Upsert an org-scoped candidate by email. Updates name when a non-empty name is provided.
 */
export async function upsertCandidate(
  db: Db,
  args: {
    organizationId: string;
    email: string;
    name?: string | null;
  },
): Promise<{ id: string; email: string; name: string }> {
  const email = normalizeCandidateEmail(args.email);
  if (!email) {
    throw new Error("Candidate email is required");
  }
  const name =
    (args.name?.trim() || email.split("@")[0] || "Candidate").slice(0, 200);

  const existing = (
    await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.organizationId, args.organizationId),
          eq(candidates.email, email),
        ),
      )
      .limit(1)
  )[0];

  if (existing) {
    if (args.name?.trim() && args.name.trim() !== existing.name) {
      const updated = (
        await db
          .update(candidates)
          .set({ name: args.name.trim(), updatedAt: new Date() })
          .where(eq(candidates.id, existing.id))
          .returning()
      )[0]!;
      return { id: updated.id, email: updated.email, name: updated.name };
    }
    return { id: existing.id, email: existing.email, name: existing.name };
  }

  try {
    const inserted = (
      await db
        .insert(candidates)
        .values({
          organizationId: args.organizationId,
          email,
          name,
        })
        .returning()
    )[0]!;
    return { id: inserted.id, email: inserted.email, name: inserted.name };
  } catch {
    const again = (
      await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.organizationId, args.organizationId),
            eq(candidates.email, email),
          ),
        )
        .limit(1)
    )[0];
    if (again) {
      return { id: again.id, email: again.email, name: again.name };
    }
    throw new Error("Failed to upsert candidate");
  }
}
