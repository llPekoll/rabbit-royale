CREATE TABLE "tuning" (
	"key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL
);
