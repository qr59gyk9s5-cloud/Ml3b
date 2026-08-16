CREATE TYPE "public"."booking_mode" AS ENUM('REQUEST_TO_BOOK', 'INSTANT_BOOK');--> statement-breakpoint
CREATE TABLE "sports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"sport_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"capacity" integer,
	"booking_mode" "booking_mode" DEFAULT 'REQUEST_TO_BOOK' NOT NULL,
	"slot_duration_minutes" integer DEFAULT 60 NOT NULL,
	"minimum_duration_minutes" integer DEFAULT 60 NOT NULL,
	"maximum_duration_minutes" integer DEFAULT 120 NOT NULL,
	"base_price_minor" integer NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_duration_check" CHECK ("facilities"."minimum_duration_minutes" <= "facilities"."maximum_duration_minutes"),
	CONSTRAINT "facilities_price_check" CHECK ("facilities"."base_price_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_venue_id_slug_key" ON "facilities" USING btree ("venue_id","slug");--> statement-breakpoint
CREATE INDEX "facilities_venue_id_idx" ON "facilities" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "facilities_sport_id_idx" ON "facilities" USING btree ("sport_id");