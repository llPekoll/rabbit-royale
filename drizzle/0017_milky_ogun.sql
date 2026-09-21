ALTER TYPE "public"."item_kind" ADD VALUE 'fence';--> statement-breakpoint
CREATE TABLE "fences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"side" text NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fences" ADD CONSTRAINT "fences_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fences_owner_side_idx" ON "fences" USING btree ("owner_id","side");