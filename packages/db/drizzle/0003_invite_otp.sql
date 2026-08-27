ALTER TABLE "invites" ADD COLUMN "otp_hash" text;
ALTER TABLE "invites" ADD COLUMN "otp_expires_at" timestamp with time zone;
ALTER TABLE "invites" ADD COLUMN "otp_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "invites" ADD COLUMN "otp_sent_at" timestamp with time zone;
ALTER TABLE "invites" ADD COLUMN "otp_email" text;
