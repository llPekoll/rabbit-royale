CREATE TABLE "auth_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"mode" text NOT NULL,
	"player_id" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"mode" text NOT NULL,
	"player_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_identities" (
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"player_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_handoffs" ADD CONSTRAINT "auth_handoffs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_identities" ADD CONSTRAINT "player_identities_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_handoffs_state_idx" ON "auth_handoffs" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "player_identities_pk" ON "player_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "player_identities_player_idx" ON "player_identities" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_identities_email_idx" ON "player_identities" USING btree ("email");