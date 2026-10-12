ALTER TYPE "public"."item_kind" ADD VALUE 'axe';--> statement-breakpoint
CREATE TABLE "burrow_cuts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"tile" integer NOT NULL,
	"cut_by" text,
	"cut_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raid_runs" ADD COLUMN "cut_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raid_runs" ADD COLUMN "cut_tile" integer;--> statement-breakpoint
ALTER TABLE "raid_runs" ADD COLUMN "cut_side" text;--> statement-breakpoint
ALTER TABLE "burrow_cuts" ADD CONSTRAINT "burrow_cuts_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "burrow_cuts" ADD CONSTRAINT "burrow_cuts_cut_by_players_id_fk" FOREIGN KEY ("cut_by") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "burrow_cuts_owner_idx" ON "burrow_cuts" USING btree ("owner_id","cut_at");