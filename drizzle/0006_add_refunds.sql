CREATE TABLE "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"reason" varchar(160) DEFAULT 'Remboursement' NOT NULL,
	"refunded_by" varchar(160) DEFAULT 'Caisse' NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;