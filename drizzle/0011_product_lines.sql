CREATE TYPE "public"."product_line_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'upcoming', 'active', 'discontinued');--> statement-breakpoint
CREATE TABLE "product_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "product_line_status" DEFAULT 'draft' NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"template" text DEFAULT 'base' NOT NULL,
	"launch_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_lines_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "line_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "release_number" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" "product_status";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "launch_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "product_lines_status_idx" ON "product_lines" USING btree ("status");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_line_id_product_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."product_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_line_idx" ON "products" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_line_release_idx" ON "products" USING btree ("line_id","release_number");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_release_number_check" CHECK ("products"."release_number" > 0);