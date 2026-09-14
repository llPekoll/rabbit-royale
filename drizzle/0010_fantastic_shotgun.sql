ALTER TYPE "public"."item_kind" ADD VALUE 'water';--> statement-breakpoint
ALTER TYPE "public"."item_kind" ADD VALUE 'fertiliser';--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "watered_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "fertilised_until" timestamp with time zone;