ALTER TABLE "products" ADD COLUMN "purchase_price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "purchase_price" integer DEFAULT 0 NOT NULL;