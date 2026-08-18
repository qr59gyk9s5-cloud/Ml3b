CREATE TYPE "public"."open_game_player_status" AS ENUM('JOINED', 'LEFT', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."open_game_status" AS ENUM('AWAITING_VENUE', 'FILLING', 'MINIMUM_REACHED', 'CONFIRMED', 'VENUE_REJECTED', 'FAILED_TO_FILL', 'ORGANIZER_CANCELLED', 'VENUE_CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'COMPETITIVE');--> statement-breakpoint
ALTER TYPE "public"."booking_source" ADD VALUE 'OPEN_GAME';--> statement-breakpoint
ALTER TYPE "public"."cancellation_reason" ADD VALUE 'INSUFFICIENT_PLAYERS' BEFORE 'OTHER';--> statement-breakpoint
CREATE TABLE "open_game_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"open_game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" text,
	"skill_level" "skill_level",
	"status" "open_game_player_status" DEFAULT 'JOINED' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"organizer_id" uuid NOT NULL,
	"target_players" integer NOT NULL,
	"min_players" integer NOT NULL,
	"price_per_player_minor" integer NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"join_cutoff_at" timestamp with time zone NOT NULL,
	"auto_confirm_if_min_met" boolean DEFAULT false NOT NULL,
	"status" "open_game_status" DEFAULT 'AWAITING_VENUE' NOT NULL,
	"cancelled_reason" "cancellation_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_games_min_le_target_check" CHECK ("open_games"."min_players" <= "open_games"."target_players"),
	CONSTRAINT "open_games_min_players_positive_check" CHECK ("open_games"."min_players" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "open_game_player_id" uuid;--> statement-breakpoint
ALTER TABLE "open_game_players" ADD CONSTRAINT "open_game_players_open_game_id_open_games_id_fk" FOREIGN KEY ("open_game_id") REFERENCES "public"."open_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_game_players" ADD CONSTRAINT "open_game_players_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_games" ADD CONSTRAINT "open_games_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_games" ADD CONSTRAINT "open_games_organizer_id_profiles_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_game_players_open_game_id_idx" ON "open_game_players" USING btree ("open_game_id");--> statement-breakpoint
CREATE INDEX "open_game_players_user_id_idx" ON "open_game_players" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "open_game_players_one_active_join_per_user" ON "open_game_players" USING btree ("open_game_id","user_id") WHERE "open_game_players"."status" = 'JOINED';--> statement-breakpoint
CREATE INDEX "open_games_booking_id_idx" ON "open_games" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "open_games_organizer_id_idx" ON "open_games" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "open_games_status_join_cutoff_idx" ON "open_games" USING btree ("status","join_cutoff_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_open_game_player_id_open_game_players_id_fk" FOREIGN KEY ("open_game_player_id") REFERENCES "public"."open_game_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_open_game_player_id_idx" ON "payments" USING btree ("open_game_player_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_exactly_one_target_check" CHECK (("payments"."booking_id" is not null) <> ("payments"."open_game_player_id" is not null));