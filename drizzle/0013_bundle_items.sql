CREATE TABLE "bundle_items" (
	"bundle_variant_id" integer NOT NULL,
	"component_variant_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_items_bundle_variant_id_component_variant_id_pk" PRIMARY KEY("bundle_variant_id","component_variant_id"),
	CONSTRAINT "bundle_items_quantity_check" CHECK ("bundle_items"."quantity" > 0),
	CONSTRAINT "bundle_items_not_self_check" CHECK ("bundle_items"."bundle_variant_id" <> "bundle_items"."component_variant_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "bundle_components" jsonb;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_variant_id_product_variants_id_fk" FOREIGN KEY ("bundle_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bundle_items_component_idx" ON "bundle_items" USING btree ("component_variant_id");--> statement-breakpoint
-- Sin packs anidados: un componente no puede ser un pack y un pack no puede ser componente de otro. Con eso ningún pack
-- se contiene a sí mismo, ni directa ni indirectamente. El bloqueo consultivo serializa los cambios concurrentes.
CREATE FUNCTION "bundle_items_no_nesting"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bundle_items'));
  IF EXISTS (SELECT 1 FROM "bundle_items" WHERE "bundle_variant_id" = NEW."component_variant_id") THEN
    RAISE EXCEPTION 'La variante % es un pack: un pack no puede contener otro pack.', NEW."component_variant_id" USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "bundle_items" WHERE "component_variant_id" = NEW."bundle_variant_id") THEN
    RAISE EXCEPTION 'La variante % es componente de un pack: no puede ser un pack.', NEW."bundle_variant_id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "bundle_items_no_nesting" BEFORE INSERT OR UPDATE OF "bundle_variant_id", "component_variant_id" ON "bundle_items"
  FOR EACH ROW EXECUTE FUNCTION "bundle_items_no_nesting"();
