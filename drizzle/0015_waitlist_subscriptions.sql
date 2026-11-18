CREATE TABLE "waitlist_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"product_id" integer NOT NULL,
	"consent" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "waitlist_consent_check" CHECK ("waitlist_subscriptions"."consent" = true),
	CONSTRAINT "waitlist_email_normalized_check" CHECK ("waitlist_subscriptions"."email" = lower(btrim("waitlist_subscriptions"."email")))
);
--> statement-breakpoint
ALTER TABLE "waitlist_subscriptions" ADD CONSTRAINT "waitlist_subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_email_product_idx" ON "waitlist_subscriptions" USING btree ("email","product_id");--> statement-breakpoint
CREATE INDEX "waitlist_product_pending_idx" ON "waitlist_subscriptions" USING btree ("product_id","notified_at");