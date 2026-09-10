ALTER TABLE "payments" ADD COLUMN "token" text DEFAULT 'usdc' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "usd_price" text;