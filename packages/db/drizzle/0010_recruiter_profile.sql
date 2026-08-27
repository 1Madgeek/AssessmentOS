ALTER TABLE "recruiters" ADD COLUMN "avatar_url" text;
ALTER TABLE "recruiters" ADD COLUMN "preferences" jsonb DEFAULT '{"emailSessionSubmitted":true,"emailInviteOpened":true,"emailWeeklyDigest":false,"productUpdates":true}'::jsonb NOT NULL;
