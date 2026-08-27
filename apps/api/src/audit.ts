import type { Db } from "@assessment-os/db";
import { auditEvents } from "@assessment-os/db";

export async function writeAudit(
  db: Db,
  args: {
    organizationId: string;
    actorRecruiterId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: args.organizationId,
    actorRecruiterId: args.actorRecruiterId,
    action: args.action,
    resourceType: args.resourceType,
    resourceId: args.resourceId ?? null,
    meta: args.meta ?? null,
  });
}
