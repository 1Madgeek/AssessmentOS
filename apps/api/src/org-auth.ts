import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "@assessment-os/db";
import {
  apiTokens,
  organizationMembers,
  organizations,
  recruiterSessions,
  type ApiScope,
} from "@assessment-os/db";
import {
  type AuthedRecruiter,
  getRecruiterFromRequest,
  hashToken,
  requireRecruiter,
} from "./auth.js";

export type OrgRole = "owner" | "author" | "reviewer";

const ROLE_RANK: Record<OrgRole, number> = {
  reviewer: 1,
  author: 2,
  owner: 3,
};

export function roleAtLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export type OrgContext = {
  user: AuthedRecruiter;
  org: { id: string; name: string; slug: string };
  membership: { id: string; role: OrgRole };
  tokenScopes: ApiScope[] | null;
  sessionId: string | null;
};

export async function listMemberships(db: Db, recruiterId: string) {
  return db
    .select({
      membershipId: organizationMembers.id,
      role: organizationMembers.role,
      organizationId: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizationMembers.organizationId, organizations.id),
    )
    .where(eq(organizationMembers.recruiterId, recruiterId));
}

async function resolveTokenOrgAndScopes(
  db: Db,
  req: FastifyRequest,
): Promise<{ organizationId: string; scopes: ApiScope[] } | null> {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  if (!token) return null;
  const rows = await db
    .select({
      organizationId: apiTokens.organizationId,
      scopes: apiTokens.scopes,
    })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    organizationId: row.organizationId,
    scopes: (row.scopes ?? []) as ApiScope[],
  };
}

async function resolveSessionActiveOrg(
  db: Db,
  req: FastifyRequest,
): Promise<{ sessionId: string; activeOrganizationId: string | null } | null> {
  const token = req.cookies.aos_recruiter;
  if (!token) return null;
  const rows = await db
    .select({
      id: recruiterSessions.id,
      activeOrganizationId: recruiterSessions.activeOrganizationId,
    })
    .from(recruiterSessions)
    .where(eq(recruiterSessions.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    activeOrganizationId: row.activeOrganizationId,
  };
}

export async function requireOrg(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  minRole: OrgRole = "reviewer",
  requiredScopes: ApiScope[] = [],
): Promise<OrgContext | null> {
  const user = await requireRecruiter(db, req, reply);
  if (!user) return null;

  const tokenMeta = await resolveTokenOrgAndScopes(db, req);
  const sessionMeta = tokenMeta ? null : await resolveSessionActiveOrg(db, req);
  const headerOrg =
    typeof req.headers["x-organization-id"] === "string"
      ? req.headers["x-organization-id"].trim()
      : "";

  let organizationId: string | null = null;
  if (tokenMeta) {
    organizationId = tokenMeta.organizationId;
    if (headerOrg && headerOrg !== tokenMeta.organizationId) {
      reply.code(403).send({
        error: "X-Organization-Id does not match the API token organization",
      });
      return null;
    }
  } else if (headerOrg) {
    organizationId = headerOrg;
  } else if (sessionMeta?.activeOrganizationId) {
    organizationId = sessionMeta.activeOrganizationId;
  }

  const memberships = await listMemberships(db, user.id);
  if (!organizationId) {
    if (memberships.length === 1) {
      organizationId = memberships[0]!.organizationId;
    } else if (memberships.length === 0) {
      reply.code(403).send({ error: "No organization membership" });
      return null;
    } else {
      reply.code(400).send({
        error: "X-Organization-Id required when you belong to multiple orgs",
      });
      return null;
    }
  }

  const membership = memberships.find((m) => m.organizationId === organizationId);
  if (!membership) {
    reply.code(403).send({ error: "Not a member of this organization" });
    return null;
  }

  if (!roleAtLeast(membership.role as OrgRole, minRole)) {
    reply.code(403).send({ error: "Insufficient organization role" });
    return null;
  }

  if (tokenMeta && requiredScopes.length) {
    const have = new Set(tokenMeta.scopes);
    const missing = requiredScopes.filter((s) => !have.has(s));
    if (missing.length) {
      reply.code(403).send({
        error: `Missing API token scopes: ${missing.join(", ")}`,
      });
      return null;
    }
  }

  return {
    user,
    org: {
      id: membership.organizationId,
      name: membership.name,
      slug: membership.slug,
    },
    membership: {
      id: membership.membershipId,
      role: membership.role as OrgRole,
    },
    tokenScopes: tokenMeta?.scopes ?? null,
    sessionId: sessionMeta?.sessionId ?? null,
  };
}

export async function setActiveOrganization(
  db: Db,
  sessionId: string,
  organizationId: string,
): Promise<void> {
  await db
    .update(recruiterSessions)
    .set({ activeOrganizationId: organizationId })
    .where(eq(recruiterSessions.id, sessionId));
}

export async function ensurePersonalOrg(
  db: Db,
  recruiter: { id: string; name: string; email: string },
): Promise<{ organizationId: string }> {
  const existing = await listMemberships(db, recruiter.id);
  if (existing[0]) return { organizationId: existing[0].organizationId };

  const slug = `personal-${recruiter.id.replace(/-/g, "")}`;
  const org = (
    await db
      .insert(organizations)
      .values({
        name: `${recruiter.name || recruiter.email}'s workspace`,
        slug,
      })
      .returning()
  )[0]!;
  await db.insert(organizationMembers).values({
    organizationId: org.id,
    recruiterId: recruiter.id,
    role: "owner",
  });
  return { organizationId: org.id };
}

export { getRecruiterFromRequest, and, eq };
