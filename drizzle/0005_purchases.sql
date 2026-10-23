CREATE TYPE "public"."purchase_category" AS ENUM('cafe_verde', 'tueste', 'empaques', 'envios', 'marketing', 'servicios', 'otros');--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchased_on" date NOT NULL,
	"supplier" text NOT NULL,
	"category" "purchase_category" NOT NULL,
	"description" text NOT NULL,
	"document_number" text,
	"amount_cents" integer NOT NULL,
	"notes" text,
	"admin_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_amount_check" CHECK ("purchases"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("purchased_on");