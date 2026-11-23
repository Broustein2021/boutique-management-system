CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"customer_name" varchar(160) DEFAULT 'Cliente' NOT NULL,
	"payment_method" varchar(40) DEFAULT 'Espèces' NOT NULL,
	"seller_name" varchar(160) DEFAULT 'Caisse' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "invoice_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_sold_at_idx" ON "invoices" USING btree ("sold_at");--> statement-breakpoint
CREATE INDEX "sales_invoice_id_idx" ON "sales" USING btree ("invoice_id");--> statement-breakpoint
-- Backfill : chaque vente mono-article existante devient la ligne unique d'une facture reconstituée.
ALTER TABLE "invoices" ADD COLUMN "legacy_sale_id" integer;--> statement-breakpoint
INSERT INTO "invoices" ("customer_id", "customer_name", "payment_method", "seller_name", "item_count", "total", "sold_at", "legacy_sale_id")
SELECT "customer_id", "customer_name", "payment_method", "seller_name", GREATEST("quantity", 1), "unit_price" * "quantity", "sold_at", "id"
FROM "sales" ORDER BY "id";--> statement-breakpoint
UPDATE "sales" s SET "invoice_id" = i."id" FROM "invoices" i WHERE i."legacy_sale_id" = s."id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "legacy_sale_id";--> statement-breakpoint
/*
 * create_invoice() : écriture atomique d'une facture multi-articles.
 * Le driver neon-http utilisé par l'application ne prend pas en charge
 * db.transaction() ; toute la mutation est donc portée par une fonction
 * PostgreSQL exécutée en un seul appel (une transaction implicit).
 * Les validations (quantité, prix, stock, taille) sont répétées ici côté base.
 */
CREATE OR REPLACE FUNCTION public.create_invoice(
  p_customer_id integer,
  p_customer_name varchar(160),
  p_payment_method varchar(40),
  p_seller_name varchar(160),
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_invoice_id integer;
  v_total integer := 0;
  v_item_count integer := 0;
  v_item jsonb;
  v_product_id integer;
  v_quantity integer;
  v_unit_price integer;
  v_size text;
  v_product products%ROWTYPE;
  v_available integer;
  v_sale_id integer;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La facture est vide.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO invoices (customer_id, customer_name, payment_method, seller_name, item_count, total, sold_at)
  VALUES (p_customer_id, p_customer_name, p_payment_method, p_seller_name, 0, 0, now())
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::integer;
    v_quantity := NULLIF(v_item->>'quantity', '')::integer;
    v_unit_price := NULLIF(v_item->>'unitPrice', '')::integer;
    v_size := NULLIF(v_item->>'size', '');

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999
       OR v_unit_price IS NULL OR v_unit_price < 0 OR v_unit_price > 1000000 THEN
      RAISE EXCEPTION 'Ligne de facture invalide.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = v_product_id FOR UPDATE;
    IF NOT FOUND OR v_product.is_active = false THEN
      RAISE EXCEPTION 'Article introuvable ou archivé (réf. %).', v_product_id USING ERRCODE = '22023';
    END IF;

    IF v_product.sizes IS NOT NULL AND jsonb_typeof(v_product.sizes) = 'object' AND v_product.sizes <> '{}'::jsonb THEN
      IF v_size IS NULL THEN
        RAISE EXCEPTION 'Choisissez une taille pour « % ».', v_product.name USING ERRCODE = '22023';
      END IF;
      v_available := COALESCE(NULLIF(v_product.sizes->>v_size, '')::integer, 0);
    ELSE
      v_available := v_product.stock;
      v_size := NULL;
    END IF;

    IF v_available < v_quantity THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » : % disponible(s), % demandé(s).', v_product.name, v_available, v_quantity USING ERRCODE = '23514';
    END IF;

    UPDATE products p
       SET stock = p.stock - v_quantity,
           sizes = CASE WHEN v_size IS NULL THEN p.sizes
                        ELSE jsonb_set(p.sizes, ARRAY[v_size], to_jsonb(v_available - v_quantity)) END
     WHERE p.id = v_product_id;

    INSERT INTO sales (product_id, invoice_id, customer_id, customer_name, quantity, unit_price,
                       purchase_price, payment_method, seller_name, size, sold_at)
    VALUES (v_product_id, v_invoice_id, p_customer_id, p_customer_name, v_quantity, v_unit_price,
            v_product.purchase_price, p_payment_method, p_seller_name, v_size, now())
    RETURNING id INTO v_sale_id;

    INSERT INTO stock_movements (product_id, change, reason, created_at)
    VALUES (v_product_id, -v_quantity, 'Vente', now());

    v_lines := v_lines || jsonb_build_object(
      'id', v_sale_id,
      'productId', v_product_id,
      'article', v_product.name,
      'sku', v_product.sku,
      'size', v_size,
      'quantity', v_quantity,
      'unitPrice', v_unit_price,
      'subtotal', v_quantity * v_unit_price
    );
    v_total := v_total + v_quantity * v_unit_price;
    v_item_count := v_item_count + 1;
  END LOOP;

  UPDATE invoices SET total = v_total, item_count = v_item_count WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice_id,
    'total', v_total,
    'itemCount', v_item_count,
    'lines', v_lines
  );
END;
$fn$;
