CREATE TYPE "public"."exception_kind" AS ENUM('HOLIDAY', 'MAINTENANCE', 'TOURNAMENT', 'PRIVATE_EVENT', 'WEATHER', 'SPECIAL_HOURS', 'OTHER');--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"kind" "exception_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_closed" boolean DEFAULT true NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_range_check" CHECK ("availability_exceptions"."starts_at" < "availability_exceptions"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_day_of_week_check" CHECK ("availability_rules"."day_of_week" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_exceptions_facility_id_range_idx" ON "availability_exceptions" USING btree ("facility_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "availability_rules_facility_id_day_idx" ON "availability_rules" USING btree ("facility_id","day_of_week");