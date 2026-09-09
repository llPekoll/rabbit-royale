ALTER TYPE "public"."item_kind" ADD VALUE 'trap';--> statement-breakpoint
CREATE TABLE "raid_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attacker_id" text NOT NULL,
	"defender_id" text NOT NULL,
	"tile" integer NOT NULL,
	"energy" integer NOT NULL,
	"traps_sprung" integer DEFAULT 0 NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"carrots_looted" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "traps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"tile" integer NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "traps_owned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "traps_claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_runs" ADD CONSTRAINT "raid_runs_attacker_id_players_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_runs" ADD CONSTRAINT "raid_runs_defender_id_players_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traps" ADD CONSTRAINT "traps_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_runs_defender_idx" ON "raid_runs" USING btree ("defender_id","started_at");--> statement-breakpoint
CREATE INDEX "raid_runs_attacker_idx" ON "raid_runs" USING btree ("attacker_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "traps_owner_tile_idx" ON "traps" USING btree ("owner_id","tile");