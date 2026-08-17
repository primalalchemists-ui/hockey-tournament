DROP INDEX "tournaments_is_active_idx";--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "is_current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
/*
  BACKFILL — dopisany ręcznie do wygenerowanej migracji.

  Musi wykonać się PRZED utworzeniem częściowego indeksu unikalnego,
  inaczej istniejący turniej nie zostałby oznaczony jako wyświetlany,
  a publiczna strona zgubiłaby Rabbit Cupa.
*/
UPDATE "tournaments" SET "is_current" = "is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_single_current_idx" ON "tournaments" USING btree ("is_current") WHERE "tournaments"."is_current";--> statement-breakpoint
CREATE INDEX "tournaments_archived_at_idx" ON "tournaments" USING btree ("archived_at");
