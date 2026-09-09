CREATE TYPE "public"."item_kind" AS ENUM('bomb', 'shield', 'lightning');--> statement-breakpoint
CREATE TYPE "public"."raid_result" AS ENUM('damaged', 'looted', 'blocked');--> statement-breakpoint
CREATE TABLE "inventory" (
	"player_id" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_nonces" (
	"address" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"name" text NOT NULL,
	"stock" bigint DEFAULT 0 NOT NULL,
	"season_score" bigint DEFAULT 0 NOT NULL,
	"lifetime_carrots" bigint DEFAULT 0 NOT NULL,
	"burrow_level" integer DEFAULT 1 NOT NULL,
	"burrow_hp" integer DEFAULT 100 NOT NULL,
	"hp_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"energy" integer DEFAULT 30 NOT NULL,
	"energy_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"garden_collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shielded_until" timestamp with time zone,
	"runs_played" integer DEFAULT 0 NOT NULL,
	"tiles_dug" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attacker_id" text NOT NULL,
	"defender_id" text NOT NULL,
	"damage" integer DEFAULT 0 NOT NULL,
	"result" "raid_result" NOT NULL,
	"carrots_looted" bigint DEFAULT 0 NOT NULL,
	"score_transferred" bigint DEFAULT 0 NOT NULL,
	"seen_by_defender" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"island_seed" text NOT NULL,
	"island_tier" text NOT NULL,
	"carrots" integer DEFAULT 0 NOT NULL,
	"tiles_dug" integer DEFAULT 0 NOT NULL,
	"bombs_hit" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sabotages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attacker_id" text NOT NULL,
	"victim_id" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"island_seed" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_standings" (
	"season_id" integer NOT NULL,
	"player_id" text NOT NULL,
	"rank" integer NOT NULL,
	"score" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"champion_id" text,
	"champion_score" bigint
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_attacker_id_players_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_defender_id_players_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sabotages" ADD CONSTRAINT "sabotages_attacker_id_players_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sabotages" ADD CONSTRAINT "sabotages_victim_id_players_id_fk" FOREIGN KEY ("victim_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_standings" ADD CONSTRAINT "season_standings_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_standings" ADD CONSTRAINT "season_standings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_champion_id_players_id_fk" FOREIGN KEY ("champion_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_player_kind_idx" ON "inventory" USING btree ("player_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "players_wallet_idx" ON "players" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "players_season_score_idx" ON "players" USING btree ("season_score");--> statement-breakpoint
CREATE INDEX "raids_defender_idx" ON "raids" USING btree ("defender_id","created_at");--> statement-breakpoint
CREATE INDEX "raids_attacker_idx" ON "raids" USING btree ("attacker_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_player_idx" ON "runs" USING btree ("player_id","started_at");--> statement-breakpoint
CREATE INDEX "sabotages_victim_idx" ON "sabotages" USING btree ("victim_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "standings_season_player_idx" ON "season_standings" USING btree ("season_id","player_id");