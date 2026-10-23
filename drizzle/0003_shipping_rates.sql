CREATE TABLE "shipping_region_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"region" text NOT NULL,
	"price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_region_rates_price_check" CHECK ("shipping_region_rates"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "regions" jsonb;--> statement-breakpoint
ALTER TABLE "shipping_region_rates" ADD CONSTRAINT "shipping_region_rates_zone_id_shipping_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_region_rates_zone_region_idx" ON "shipping_region_rates" USING btree ("zone_id","region");--> statement-breakpoint
-- Datos: tarifas base confirmadas (Lima y Callao S/ 15, provincias desde S/ 20) y departamentos por zona.
UPDATE "shipping_zones" SET "price_cents" = 1500, "regions" = '["Lima"]'::jsonb WHERE "slug" = 'lima';--> statement-breakpoint
UPDATE "shipping_zones" SET "price_cents" = 1500, "regions" = '["Callao"]'::jsonb WHERE "slug" = 'callao';--> statement-breakpoint
UPDATE "shipping_zones" SET "price_cents" = 2000, "name" = 'Provincias (envío por agencia)' WHERE "slug" = 'provincias';
