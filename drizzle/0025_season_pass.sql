-- THE SEASON PASS (2026-09-30). A pass season is a season with pass_on set,
-- opened by scripts/season-pass.ts. season_passes holds the seats (and what
-- each put into the pot), pass_payouts what the top ten are owed at the close.
ALTER TYPE "public"."item_kind" ADD VALUE 'season_pass';--> statement-breakpoint
CREATE TABLE "pass_payouts" (
	"season_id" integer NOT NULL,
	"player_id" text NOT NULL,
	"rank" integer NOT NULL,
	"score" bigint NOT NULL,
	"wallet" text,
	"usd_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"signature" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "season_passes" (
	"season_id" integer NOT NULL,
	"player_id" text NOT NULL,
	"payment_id" uuid,
	"usd_cents" integer DEFAULT 0 NOT NULL,
	"bought_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_claim_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "pass_on" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pass_payouts" ADD CONSTRAINT "pass_payouts_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pass_payouts" ADD CONSTRAINT "pass_payouts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_passes" ADD CONSTRAINT "season_passes_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_passes" ADD CONSTRAINT "season_passes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_passes" ADD CONSTRAINT "season_passes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pass_payouts_season_player_idx" ON "pass_payouts" USING btree ("season_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_passes_season_player_idx" ON "season_passes" USING btree ("season_id","player_id");