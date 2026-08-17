CREATE TYPE "public"."actor_type" AS ENUM('CUSTOMER', 'VENUE_USER', 'ADMIN', 'SYSTEM', 'AI_AGENT');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('MARKETPLACE', 'MANUAL', 'ADMIN', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('REQUESTED', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_VENUE', 'COMPLETED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."cancellation_reason" AS ENUM('MAINTENANCE', 'WEATHER', 'SCHEDULING_ERROR', 'DOUBLE_BOOKED', 'VENUE_CLOSED', 'OTHER');--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"venue_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"customer_id" uuid,
	"status" "booking_status" DEFAULT 'REQUESTED' NOT NULL,
	"source" "booking_source" DEFAULT 'MARKETPLACE' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"customer_name" text,
	"customer_phone" text,
	"customer_note" text,
	"venue_private_note" text,
	"cancellation_reason" "cancellation_reason",
	"subtotal_minor" integer NOT NULL,
	"platform_fee_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"idempotency_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bookings_time_range_check" CHECK ("bookings"."start_at" < "bookings"."end_at")
);
--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_facility_id_start_end_idx" ON "bookings" USING btree ("facility_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "bookings_venue_id_status_idx" ON "bookings" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_customer_id_idempotency_key_key" ON "bookings" USING btree ("customer_id","idempotency_key") WHERE "bookings"."idempotency_key" is not null;