CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'failed', 'expired');--> statement-breakpoint
ALTER TYPE "public"."item_kind" ADD VALUE 'energy';--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"amount" bigint NOT NULL,
	"treasury" text NOT NULL,
	"reference" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "energy_packs_bought" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "energy_packs_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_signature_idx" ON "payments" USING btree ("signature");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_idx" ON "payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payments_player_idx" ON "payments" USING btree ("player_id","created_at");