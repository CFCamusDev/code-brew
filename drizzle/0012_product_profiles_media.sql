CREATE TABLE "product_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"view" text NOT NULL,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_media_view_check" CHECK ("product_media"."view" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "product_profiles" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"tagline" text,
	"method" text,
	"description" text,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cup_profile" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipe_for" text,
	"recipe" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revealed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_profiles" ADD CONSTRAINT "product_profiles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_product_view_idx" ON "product_media" USING btree ("product_id","view");