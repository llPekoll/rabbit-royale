ALTER TYPE "public"."item_kind" ADD VALUE 'smoke';--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "smoke_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raid_runs" ADD COLUMN "visited" integer[] DEFAULT '{}' NOT NULL;