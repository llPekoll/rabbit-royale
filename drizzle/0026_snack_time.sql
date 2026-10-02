-- SNACK TIME (2026-10-02): the daily gift's streak (lib/game/snack.ts) and
-- the push sweep's stamp for it. Then the three starting bolts
-- (LIGHTNING.STARTING) handed once to every burrow that existed before them —
-- new accounts get theirs from lib/auth/starting-kit.ts. Capped at the bag's
-- ceiling (SHOP.MAX_HELD, 20) like any gift.
CREATE TABLE "snack_streak" (
	"player_id" text PRIMARY KEY NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"tz_offset_min" integer DEFAULT 0 NOT NULL,
	"weeks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_state" ADD COLUMN "snack_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "snack_streak" ADD CONSTRAINT "snack_streak_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "inventory" ("player_id", "kind", "qty")
SELECT "id", 'lightning', 3 FROM "players"
ON CONFLICT ("player_id", "kind") DO UPDATE SET "qty" = LEAST("inventory"."qty" + 3, 20);
