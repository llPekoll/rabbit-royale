-- The feature never went live: the table holds only planks placed by dev
-- guests under the old per-side model, which has no tile. Cleared rather than
-- backfilled, since a side cannot be turned back into the spans it covered.
DELETE FROM "fences";--> statement-breakpoint
DROP INDEX "fences_owner_side_idx";--> statement-breakpoint
ALTER TABLE "fences" ADD COLUMN "tile" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fences_owner_span_idx" ON "fences" USING btree ("owner_id","tile","side");