CREATE TYPE "public"."org_role" AS ENUM('owner', 'author', 'reviewer');
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recruiter_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'author' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_recruiter_id_recruiters_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_unique" ON "organization_members" USING btree ("organization_id","recruiter_id");
--> statement-breakpoint
CREATE INDEX "organization_members_recruiter_idx" ON "organization_members" USING btree ("recruiter_id");
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" DEFAULT 'author' NOT NULL,
	"token" text NOT NULL,
	"invited_by_recruiter_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_recruiter_id_recruiters_id_fk" FOREIGN KEY ("invited_by_recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invites_token_idx" ON "organization_invites" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "organization_invites_org_idx" ON "organization_invites" USING btree ("organization_id");
--> statement-breakpoint
-- Personal org backfill per recruiter
INSERT INTO "organizations" ("id", "name", "slug")
SELECT gen_random_uuid(),
       COALESCE(NULLIF(r."name", ''), r."email") || '''s workspace',
       'personal-' || REPLACE(r."id"::text, '-', '')
FROM "recruiters" r;
--> statement-breakpoint
INSERT INTO "organization_members" ("organization_id", "recruiter_id", "role")
SELECT o."id", r."id", 'owner'
FROM "recruiters" r
JOIN "organizations" o ON o."slug" = 'personal-' || REPLACE(r."id"::text, '-', '');
--> statement-breakpoint
ALTER TABLE "recruiter_sessions" ADD COLUMN "active_organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "recruiter_sessions" ADD CONSTRAINT "recruiter_sessions_active_organization_id_organizations_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "recruiter_sessions" s
SET "active_organization_id" = m."organization_id"
FROM "organization_members" m
WHERE m."recruiter_id" = s."recruiter_id" AND m."role" = 'owner';
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "created_by_recruiter_id" uuid;
--> statement-breakpoint
UPDATE "assessments" a
SET "organization_id" = m."organization_id",
    "created_by_recruiter_id" = a."recruiter_id"
FROM "organization_members" m
WHERE m."recruiter_id" = a."recruiter_id" AND m."role" = 'owner';
--> statement-breakpoint
ALTER TABLE "assessments" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "assessments" DROP CONSTRAINT IF EXISTS "assessments_recruiter_id_recruiters_id_fk";
--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "recruiter_id";
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_recruiter_id_recruiters_id_fk" FOREIGN KEY ("created_by_recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assessments_organization_idx" ON "assessments" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN "created_by_recruiter_id" uuid;
--> statement-breakpoint
UPDATE "bank_questions" b
SET "organization_id" = m."organization_id",
    "created_by_recruiter_id" = b."recruiter_id"
FROM "organization_members" m
WHERE m."recruiter_id" = b."recruiter_id" AND m."role" = 'owner';
--> statement-breakpoint
ALTER TABLE "bank_questions" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_questions" DROP CONSTRAINT IF EXISTS "bank_questions_recruiter_id_recruiters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "bank_questions_recruiter_idx";
--> statement-breakpoint
ALTER TABLE "bank_questions" DROP COLUMN "recruiter_id";
--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_created_by_recruiter_id_recruiters_id_fk" FOREIGN KEY ("created_by_recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "bank_questions_organization_idx" ON "bank_questions" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "uploaded_by_recruiter_id" uuid;
--> statement-breakpoint
UPDATE "assets" a
SET "organization_id" = m."organization_id",
    "uploaded_by_recruiter_id" = a."recruiter_id"
FROM "organization_members" m
WHERE m."recruiter_id" = a."recruiter_id" AND m."role" = 'owner';
--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_recruiter_id_recruiters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "assets_recruiter_idx";
--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "recruiter_id";
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_recruiter_id_recruiters_id_fk" FOREIGN KEY ("uploaded_by_recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assets_organization_idx" ON "assets" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "email_templates" e
SET "organization_id" = m."organization_id"
FROM "organization_members" m
WHERE m."recruiter_id" = e."recruiter_id" AND m."role" = 'owner';
--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_recruiter_id_recruiters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "email_templates_recruiter_key_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "email_templates_recruiter_idx";
--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "recruiter_id";
--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_org_key_idx" ON "email_templates" USING btree ("organization_id","key");
--> statement-breakpoint
CREATE INDEX "email_templates_organization_idx" ON "email_templates" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "scopes" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
UPDATE "api_tokens" t
SET "organization_id" = m."organization_id",
    "scopes" = ARRAY[
      'assessments:read','assessments:write','bank:read','bank:write',
      'invites:write','sessions:read','org:read','org:admin','webhooks:manage'
    ]::text[]
FROM "organization_members" m
WHERE m."recruiter_id" = t."recruiter_id" AND m."role" = 'owner';
--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "api_tokens_organization_idx" ON "api_tokens" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_recruiter_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_recruiter_id_recruiters_id_fk" FOREIGN KEY ("actor_recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "audit_events_org_created_idx" ON "audit_events" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE TABLE "organization_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{"session.completed"}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_webhooks" ADD CONSTRAINT "organization_webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "organization_webhooks_org_idx" ON "organization_webhooks" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"success" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_organization_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."organization_webhooks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");
