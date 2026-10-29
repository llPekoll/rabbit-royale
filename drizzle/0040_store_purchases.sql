ALTER TYPE "public"."currency" ADD VALUE 'iap';--> statement-breakpoint
CREATE TABLE "store_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" text NOT NULL,
	"platform" text NOT NULL,
	"product_id" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"token" text NOT NULL,
	"order_id" text,
	"purchased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "store_purchases" ADD CONSTRAINT "store_purchases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_purchases_token_idx" ON "store_purchases" USING btree ("platform","token");--> statement-breakpoint
CREATE INDEX "store_purchases_player_idx" ON "store_purchases" USING btree ("player_id","created_at");