ALTER TYPE "public"."currency" ADD VALUE 'gold';--> statement-breakpoint
ALTER TYPE "public"."item_kind" ADD VALUE 'gold';--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "gold" bigint DEFAULT 0 NOT NULL;