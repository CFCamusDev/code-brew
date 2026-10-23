CREATE TABLE "shipping_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"eta" text NOT NULL,
	"price_cents" integer NOT NULL,
	"free_from_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_zones_slug_unique" UNIQUE("slug"),
	CONSTRAINT "shipping_zones_price_check" CHECK ("shipping_zones"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_zone_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_zone_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE restrict ON UPDATE no action;