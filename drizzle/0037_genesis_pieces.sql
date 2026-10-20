CREATE TABLE "genesis_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"run_id" uuid,
	"tile" integer NOT NULL,
	"won_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mint_address" text,
	"minted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "genesis_pieces" ADD CONSTRAINT "genesis_pieces_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genesis_pieces" ADD CONSTRAINT "genesis_pieces_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "genesis_pieces_run_tile_idx" ON "genesis_pieces" USING btree ("run_id","tile");--> statement-breakpoint
CREATE INDEX "genesis_pieces_player_idx" ON "genesis_pieces" USING btree ("player_id","won_at");