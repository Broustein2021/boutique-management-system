ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sizes" jsonb;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "size" varchar(40);
--> statement-breakpoint
COMMENT ON COLUMN "products"."sizes" IS 'Stock par taille, ex: {"S": 5, "M": 8, "L": 3} — ligne lingerie.';
COMMENT ON COLUMN "sales"."size" IS 'Taille vendue (optionnel, produits à tailles).';