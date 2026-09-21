CREATE TYPE "public"."raid_kind" AS ENUM('burrow', 'shove', 'lightning');--> statement-breakpoint
ALTER TABLE "raids" ADD COLUMN "kind" "raid_kind" DEFAULT 'burrow' NOT NULL;