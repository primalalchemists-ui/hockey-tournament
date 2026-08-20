ALTER TABLE "tournaments" ADD COLUMN "camp_title" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "camp_registration_enabled" boolean DEFAULT true NOT NULL;