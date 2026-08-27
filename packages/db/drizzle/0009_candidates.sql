-- Org-scoped candidate directory (shortlist + cross-assessment history)
CREATE TABLE IF NOT EXISTS "candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "shortlisted" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_org_email_idx" ON "candidates" ("organization_id","email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_org_shortlisted_idx" ON "candidates" ("organization_id","shortlisted");
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "candidate_id" uuid;
--> statement-breakpoint
ALTER TABLE "candidate_sessions" ADD COLUMN IF NOT EXISTS "candidate_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invites" ADD CONSTRAINT "invites_candidate_id_candidates_id_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidate_sessions" ADD CONSTRAINT "candidate_sessions_candidate_id_candidates_id_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- Backfill candidates from past sessions (org via assessment)
INSERT INTO "candidates" ("organization_id", "email", "name")
SELECT DISTINCT ON (a.organization_id, lower(cs.candidate_email))
  a.organization_id,
  lower(trim(cs.candidate_email)),
  cs.candidate_name
FROM "candidate_sessions" cs
JOIN "assessments" a ON a.id = cs.assessment_id
WHERE trim(cs.candidate_email) <> ''
ORDER BY a.organization_id, lower(cs.candidate_email), cs.created_at DESC
ON CONFLICT ("organization_id", "email") DO NOTHING;
--> statement-breakpoint
-- Also from invites that never started a session
INSERT INTO "candidates" ("organization_id", "email", "name")
SELECT DISTINCT ON (a.organization_id, lower(i.candidate_email))
  a.organization_id,
  lower(trim(i.candidate_email)),
  COALESCE(NULLIF(trim(i.candidate_name), ''), split_part(i.candidate_email, '@', 1))
FROM "invites" i
JOIN "assessments" a ON a.id = i.assessment_id
WHERE i.candidate_email IS NOT NULL AND trim(i.candidate_email) <> ''
ORDER BY a.organization_id, lower(i.candidate_email), i.created_at DESC
ON CONFLICT ("organization_id", "email") DO NOTHING;
--> statement-breakpoint
UPDATE "invites" i
SET "candidate_id" = c.id
FROM "assessments" a, "candidates" c
WHERE i.assessment_id = a.id
  AND i.candidate_email IS NOT NULL
  AND c.organization_id = a.organization_id
  AND c.email = lower(trim(i.candidate_email))
  AND i.candidate_id IS NULL;
--> statement-breakpoint
UPDATE "candidate_sessions" cs
SET "candidate_id" = c.id
FROM "assessments" a, "candidates" c
WHERE cs.assessment_id = a.id
  AND c.organization_id = a.organization_id
  AND c.email = lower(trim(cs.candidate_email))
  AND cs.candidate_id IS NULL;
