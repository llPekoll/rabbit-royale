ALTER TABLE "players" ADD COLUMN "harvests" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "traps_placed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "chests_opened" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "raids_played" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "quests_claimed" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "quest_marks" text[] DEFAULT '{}' NOT NULL;