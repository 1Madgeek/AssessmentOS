CREATE TYPE "public"."invite_status" AS ENUM('pending', 'used', 'revoked');--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "status" "invite_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "last_emailed_at" timestamp with time zone;--> statement-breakpoint
-- Keep oldest session per invite so one-session-per-invite unique index can apply
DELETE FROM "candidate_sessions" a
USING "candidate_sessions" b
WHERE a.invite_id = b.invite_id
  AND a.created_at > b.created_at;--> statement-breakpoint
UPDATE "invites" i
SET "status" = 'used',
    "used_at" = COALESCE(i.used_at, s.created_at)
FROM "candidate_sessions" s
WHERE s.invite_id = i.id AND i.status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_sessions_invite_unique" ON "candidate_sessions" USING btree ("invite_id");--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruiter_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_recruiter_id_recruiters_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_recruiter_key_idx" ON "email_templates" USING btree ("recruiter_id","key");--> statement-breakpoint
CREATE INDEX "email_templates_recruiter_idx" ON "email_templates" USING btree ("recruiter_id");
