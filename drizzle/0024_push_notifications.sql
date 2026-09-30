CREATE TABLE "push_state" (
	"player_id" text PRIMARY KEY NOT NULL,
	"energy_for" timestamp with time zone,
	"garden_for" timestamp with time zone,
	"idle_for" timestamp with time zone,
	"idle_stage" integer DEFAULT 0 NOT NULL,
	"online_at" timestamp with time zone,
	"last_push_at" timestamp with time zone,
	"window_start" timestamp with time zone,
	"window_count" integer DEFAULT 0 NOT NULL,
	"raid_push_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"platform" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"tz_offset_min" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raid_runs" ADD COLUMN "pushed_incoming_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raid_runs" ADD COLUMN "pushed_result_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_state" ADD CONSTRAINT "push_state_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tokens_player_idx" ON "push_tokens" USING btree ("player_id");