CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(200) NOT NULL,
	"category" varchar(80) DEFAULT 'Autres' NOT NULL,
	"amount" integer NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(80) NOT NULL,
	"category" varchar(80) DEFAULT 'Accessoires' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 5 NOT NULL,
	"color" varchar(40) DEFAULT 'rose' NOT NULL,
	"initials" varchar(4) DEFAULT 'MA' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"customer_name" varchar(160) DEFAULT 'Cliente' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"payment_method" varchar(40) DEFAULT 'Espèces' NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"change" integer NOT NULL,
	"reason" varchar(160) DEFAULT 'Ajustement' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(200) NOT NULL,
	"role" varchar(80) DEFAULT 'Caissière' NOT NULL,
	"status" varchar(40) DEFAULT 'Actif' NOT NULL,
	"initials" varchar(4) DEFAULT 'AM' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");