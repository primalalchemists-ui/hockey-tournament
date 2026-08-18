CREATE TABLE "team_logo_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logo_asset_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_logo_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"slug" text NOT NULL,
	"url" text NOT NULL,
	"cloudinary_public_id" text,
	"content_hash" text,
	"width" integer,
	"height" integer,
	"format" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "logo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "team_logo_aliases" ADD CONSTRAINT "team_logo_aliases_logo_asset_id_team_logo_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."team_logo_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_logo_aliases_normalized_unique" ON "team_logo_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "team_logo_aliases_asset_idx" ON "team_logo_aliases" USING btree ("logo_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_logo_assets_slug_unique" ON "team_logo_assets" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "team_logo_assets_normalized_name_unique" ON "team_logo_assets" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "team_logo_assets_content_hash_unique" ON "team_logo_assets" USING btree ("content_hash") WHERE "team_logo_assets"."content_hash" is not null;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_logo_asset_id_team_logo_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."team_logo_assets"("id") ON DELETE set null ON UPDATE no action;