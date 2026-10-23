ALTER TABLE "orders" ADD COLUMN "stock_shortage" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "bags" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "free_from_bags" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_bags_check" CHECK ("product_variants"."bags" > 0);--> statement-breakpoint
-- Datos: el Pack Developer trae 2 bolsas; envío gratis desde 3 bolsas en Lima y Callao.
UPDATE "product_variants" SET "bags" = 2 WHERE "sku" = 'pack-developer';--> statement-breakpoint
UPDATE "shipping_zones" SET "free_from_bags" = 3 WHERE "slug" IN ('lima', 'callao');
