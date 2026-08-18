ALTER TABLE "bracket_rounds" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "standings_snapshot_rows" ADD COLUMN "played" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "standings_snapshot_rows" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "standings_snapshot_rows" ADD COLUMN "draws" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "standings_snapshot_rows" ADD COLUMN "losses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "phase" text DEFAULT 'group_stage' NOT NULL;--> statement-breakpoint
ALTER TABLE "bracket_rounds" ADD CONSTRAINT "bracket_rounds_status_check" CHECK ("bracket_rounds"."status" in ('pending', 'active', 'completed'));--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_phase_check" CHECK ("tournaments"."phase" in ('group_stage', 'round_of_16', 'quarterfinal', 'semifinal', 'final', 'completed'));