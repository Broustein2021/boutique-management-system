CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_name" varchar(160) DEFAULT 'Utilisateur' NOT NULL,
	"type" varchar(80) DEFAULT 'Action' NOT NULL,
	"detail" varchar(400) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
