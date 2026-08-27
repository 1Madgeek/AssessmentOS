import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "@assessment-os/db";
import { recruiters, recruiterSessions, candidateSessions } from "@assessment-os/db";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

export type AuthedRecruiter = {
  id: string;
  email: string;
  name: string;
};

export async function createRecruiterSession(
  db: Db,
  recruiterId: string,
  reply: FastifyReply,
): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(recruiterSessions).values({
    recruiterId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  reply.setCookie("aos_recruiter", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getRecruiterFromRequest(
  db: Db,
  req: FastifyRequest,
): Promise<AuthedRecruiter | null> {
  const token = req.cookies.aos_recruiter;
  if (!token) return null;
  const rows = await db
    .select({
      id: recruiters.id,
      email: recruiters.email,
      name: recruiters.name,
      expiresAt: recruiterSessions.expiresAt,
    })
    .from(recruiterSessions)
    .innerJoin(recruiters, eq(recruiterSessions.recruiterId, recruiters.id))
    .where(eq(recruiterSessions.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function requireRecruiter(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthedRecruiter | null> {
  const user = await getRecruiterFromRequest(db, req);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  return user;
}

export async function clearRecruiterSession(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = req.cookies.aos_recruiter;
  if (token) {
    await db
      .delete(recruiterSessions)
      .where(eq(recruiterSessions.tokenHash, hashToken(token)));
  }
  reply.clearCookie("aos_recruiter", { path: "/" });
}

export async function setCandidateSessionCookie(
  reply: FastifyReply,
  token: string,
): Promise<void> {
  reply.setCookie("aos_candidate", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function getCandidateSessionId(
  db: Db,
  req: FastifyRequest,
): Promise<string | null> {
  const token = req.cookies.aos_candidate;
  if (!token) return null;
  const rows = await db
    .select({ id: candidateSessions.id })
    .from(candidateSessions)
    .where(eq(candidateSessions.sessionTokenHash, hashToken(token)))
    .limit(1);
  return rows[0]?.id ?? null;
}
