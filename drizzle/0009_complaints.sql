CREATE TYPE "public"."complaint_status" AS ENUM('pending', 'answered');--> statement-breakpoint
CREATE TYPE "public"."complaint_type" AS ENUM('reclamo', 'queja');--> statement-breakpoint
CREATE TABLE "complaint_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"sequence" integer NOT NULL,
	"type" "complaint_type" NOT NULL,
	"consumer_name" text NOT NULL,
	"consumer_document" text,
	"consumer_email" text NOT NULL,
	"consumer_phone" text,
	"consumer_address" text NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_name" text,
	"guardian_document" text,
	"product_or_service" text NOT NULL,
	"amount_cents" integer,
	"detail" text NOT NULL,
	"consumer_request" text NOT NULL,
	"status" "complaint_status" DEFAULT 'pending' NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"responded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_responded_by_admin_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_year_sequence_idx" ON "complaints" USING btree ("year","sequence");--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" USING btree ("status");