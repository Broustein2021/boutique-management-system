CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"logo" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "store_settings" ("id", "logo") VALUES (1, NULL) ON CONFLICT ("id") DO NOTHING;
