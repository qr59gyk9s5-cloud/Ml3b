CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'IN_APP' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_status_idx" ON "notifications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events" USING btree ("status","created_at");