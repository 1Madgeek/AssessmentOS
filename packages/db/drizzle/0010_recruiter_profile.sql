ALTER TABLE "recruiters" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "recruiters" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{"emailSessionSubmitted":true,"emailInviteOpened":true,"emailWeeklyDigest":false,"productUpdates":true}'::jsonb NOT NULL;
