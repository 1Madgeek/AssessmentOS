-- Keep newest pending invite per (assessment_id, email); revoke older duplicates.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY assessment_id, lower(candidate_email)
      ORDER BY created_at DESC
    ) AS rn
  FROM invites
  WHERE status = 'pending' AND candidate_email IS NOT NULL
)
UPDATE invites
SET
  status = 'revoked',
  revoked_at = COALESCE(revoked_at, NOW()),
  otp_hash = NULL,
  otp_expires_at = NULL,
  otp_attempts = 0,
  otp_sent_at = NULL,
  otp_email = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX "invites_pending_email_unique"
ON "invites" ("assessment_id", "candidate_email")
WHERE "status" = 'pending' AND "candidate_email" IS NOT NULL;
