ALTER TYPE "public"."item_kind" ADD VALUE 'skin_solana';--> statement-breakpoint
CREATE TABLE "player_skins" (
	"player_id" text NOT NULL,
	"skin" text NOT NULL,
	"payment_id" uuid,
	"bought_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purchase_key" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "equipped_skin" text;--> statement-breakpoint
ALTER TABLE "player_skins" ADD CONSTRAINT "player_skins_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skins" ADD CONSTRAINT "player_skins_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_skins_owner_idx" ON "player_skins" USING btree ("player_id","skin");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_pending_purchase_idx" ON "payments" USING btree ("purchase_key") WHERE "payments"."status" = 'pending';--> statement-breakpoint
-- Existing ticket holders keep the appearance they wore before the wardrobe.
UPDATE "players" SET "equipped_skin" = 'kuro-violet'
WHERE EXISTS (SELECT 1 FROM "season_passes" WHERE "season_passes"."player_id" = "players"."id");
