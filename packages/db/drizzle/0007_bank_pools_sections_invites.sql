CREATE TYPE "public"."invite_mode" AS ENUM('single', 'multi');--> statement-breakpoint
CREATE TABLE "bank_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruiter_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"prompt_doc" jsonb,
	"time_limit_seconds" integer NOT NULL,
	"points" integer DEFAULT 10 NOT NULL,
	"config" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"draw_count" integer NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_pool_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"question_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	"time_limit_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "mode" "invite_mode" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "max_uses" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_recruiter_id_recruiters_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_pools" ADD CONSTRAINT "assessment_pools_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_pool_members" ADD CONSTRAINT "assessment_pool_members_pool_id_assessment_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."assessment_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_pool_members" ADD CONSTRAINT "assessment_pool_members_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_questions_recruiter_idx" ON "bank_questions" USING btree ("recruiter_id");--> statement-breakpoint
CREATE INDEX "assessment_pools_assessment_idx" ON "assessment_pools" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_pool_members_unique" ON "assessment_pool_members" USING btree ("pool_id","question_id");--> statement-breakpoint
CREATE INDEX "assessment_sections_assessment_idx" ON "assessment_sections" USING btree ("assessment_id");--> statement-breakpoint
DROP INDEX IF EXISTS "candidate_sessions_invite_unique";--> statement-breakpoint
CREATE INDEX "candidate_sessions_invite_idx" ON "candidate_sessions" USING btree ("invite_id");
