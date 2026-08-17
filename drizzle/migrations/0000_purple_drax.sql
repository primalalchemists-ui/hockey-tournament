CREATE TABLE "bracket_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bracket_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"match_count" integer NOT NULL,
	CONSTRAINT "bracket_rounds_bracket_order_unique" UNIQUE("bracket_id","order"),
	CONSTRAINT "bracket_rounds_kind_check" CHECK ("bracket_rounds"."kind" in ('round_of_16', 'quarterfinal', 'semifinal', 'final', 'third_place'))
);
--> statement-breakpoint
CREATE TABLE "brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"group_id" uuid,
	"size" integer NOT NULL,
	CONSTRAINT "brackets_size_check" CHECK ("brackets"."size" in (2, 4, 8, 16))
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "groups_tournament_key_unique" UNIQUE("tournament_id","key")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"group_id" uuid,
	"external_id" text NOT NULL,
	"stage" text DEFAULT 'group' NOT NULL,
	"status" text NOT NULL,
	"home_team_id" uuid,
	"away_team_id" uuid,
	"home_score" integer,
	"away_score" integer,
	"shootout_winner_team_id" uuid,
	"bracket_round_id" uuid,
	"slot_index" integer,
	"home_source" jsonb,
	"away_source" jsonb,
	"scheduled_at" timestamp with time zone,
	"rink" smallint,
	CONSTRAINT "matches_tournament_external_id_unique" UNIQUE("tournament_id","external_id"),
	CONSTRAINT "matches_bracket_slot_unique" UNIQUE("bracket_round_id","slot_index"),
	CONSTRAINT "matches_stage_check" CHECK ("matches"."stage" in ('group', 'bracket', 'placement_group')),
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" in ('scheduled', 'live', 'finished', 'cancelled')),
	CONSTRAINT "matches_score_pair_check" CHECK (("matches"."home_score" is null) = ("matches"."away_score" is null)),
	CONSTRAINT "matches_teams_distinct_check" CHECK ("matches"."home_team_id" is null or "matches"."away_team_id" is null or "matches"."home_team_id" <> "matches"."away_team_id"),
	CONSTRAINT "matches_rink_check" CHECK ("matches"."rink" is null or "matches"."rink" > 0)
);
--> statement-breakpoint
CREATE TABLE "scorers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"player_name" text NOT NULL,
	"jersey_number" integer,
	"goals" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scorers_tournament_external_id_unique" UNIQUE("tournament_id","external_id"),
	CONSTRAINT "scorers_goals_check" CHECK ("scorers"."goals" >= 0)
);
--> statement-breakpoint
CREATE TABLE "standings_snapshot_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"points" integer NOT NULL,
	"goals_for" integer NOT NULL,
	"goals_against" integer NOT NULL,
	"goal_difference" integer NOT NULL,
	CONSTRAINT "standings_snapshot_rows_position_unique" UNIQUE("snapshot_id","position"),
	CONSTRAINT "standings_snapshot_rows_team_unique" UNIQUE("snapshot_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "standings_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standings_snapshots_group_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"logo_url" text,
	"logo_name" text,
	"logo_type" text,
	"logo_public_id" text,
	"source_order" integer DEFAULT 999 NOT NULL,
	CONSTRAINT "teams_tournament_external_id_unique" UNIQUE("tournament_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"file_name" text,
	"public_id" text,
	CONSTRAINT "tournament_assets_tournament_kind_unique" UNIQUE("tournament_id","kind"),
	CONSTRAINT "tournament_assets_kind_check" CHECK ("tournament_assets"."kind" in ('schedule', 'regulation', 'hero_banner', 'camp_banner', 'camp_poster_left', 'camp_poster_right'))
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"format" text DEFAULT 'league' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"playoff_config" jsonb,
	"playoff_tie_breaker" text DEFAULT 'penalties' NOT NULL,
	"camp_start_date" text,
	"camp_signup_link" text,
	"ticker_message" text,
	"show_top_scorer_ticker" boolean DEFAULT true NOT NULL,
	"legacy_airtable_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tournaments_format_check" CHECK ("tournaments"."format" in ('league', 'group_playoff')),
	CONSTRAINT "tournaments_playoff_tie_breaker_check" CHECK ("tournaments"."playoff_tie_breaker" in ('penalties', 'overtime', 'none'))
);
--> statement-breakpoint
ALTER TABLE "bracket_rounds" ADD CONSTRAINT "bracket_rounds_bracket_id_brackets_id_fk" FOREIGN KEY ("bracket_id") REFERENCES "public"."brackets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brackets" ADD CONSTRAINT "brackets_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brackets" ADD CONSTRAINT "brackets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_shootout_winner_team_id_teams_id_fk" FOREIGN KEY ("shootout_winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_bracket_round_id_bracket_rounds_id_fk" FOREIGN KEY ("bracket_round_id") REFERENCES "public"."bracket_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorers" ADD CONSTRAINT "scorers_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorers" ADD CONSTRAINT "scorers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_snapshot_rows" ADD CONSTRAINT "standings_snapshot_rows_snapshot_id_standings_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."standings_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_snapshot_rows" ADD CONSTRAINT "standings_snapshot_rows_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_snapshots" ADD CONSTRAINT "standings_snapshots_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_snapshots" ADD CONSTRAINT "standings_snapshots_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_assets" ADD CONSTRAINT "tournament_assets_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_tournament_stage_idx" ON "matches" USING btree ("tournament_id","stage");--> statement-breakpoint
CREATE INDEX "matches_group_idx" ON "matches" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "scorers_team_idx" ON "scorers" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_group_idx" ON "teams" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tournaments_is_active_idx" ON "tournaments" USING btree ("is_active");