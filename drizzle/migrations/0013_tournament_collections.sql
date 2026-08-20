CREATE TABLE "tournament_collection_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"label" text NOT NULL,
	"bubble_color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tournament_collection_members_tournament_id_unique" UNIQUE("tournament_id"),
	CONSTRAINT "collection_members_label_unique" UNIQUE("collection_id","label")
);
--> statement-breakpoint
CREATE TABLE "tournament_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_collection_members" ADD CONSTRAINT "tournament_collection_members_collection_id_tournament_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."tournament_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_collection_members" ADD CONSTRAINT "tournament_collection_members_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_members_collection_idx" ON "tournament_collection_members" USING btree ("collection_id");