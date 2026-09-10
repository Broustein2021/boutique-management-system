CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(40) DEFAULT '' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customer_id" integer;