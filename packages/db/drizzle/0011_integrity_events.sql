-- AI-era integrity: richer activity events + session integrity acknowledgement
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'focus_gained';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'copy';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'cut';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'tab_visible';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'webcam_snapshot';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'webcam_denied';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'typing_stats';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'answer_burst';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'fullscreen_exit';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'integrity_accepted';
--> statement-breakpoint
ALTER TABLE "candidate_sessions" ADD COLUMN IF NOT EXISTS "integrity_ack" jsonb;
