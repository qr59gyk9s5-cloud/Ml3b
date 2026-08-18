-- ---------------------------------------------------------------------
-- bookings — extend the existing insert policy (0007) for OPEN_GAME
-- source, same coarse defense-in-depth posture as MARKETPLACE/MANUAL.
-- The organizer is bookings.customer_id, same field a normal customer
-- request uses.
-- ---------------------------------------------------------------------

drop policy "bookings_insert_customer_or_staff_or_admin" on "public"."bookings";

create policy "bookings_insert_customer_or_staff_or_admin"
  on "public"."bookings" for insert
  with check (
    (source = 'MARKETPLACE' and customer_id = auth.uid())
    or (source = 'OPEN_GAME' and customer_id = auth.uid())
    or (
      source = 'MANUAL'
      and public.has_venue_role(venue_id, auth.uid(), array['OWNER', 'MANAGER', 'RECEPTIONIST'])
    )
    or public.is_platform_admin(auth.uid())
  );

-- ---------------------------------------------------------------------
-- open_games
-- ---------------------------------------------------------------------

alter table "public"."open_games" enable row level security;

-- Public, unlike bookings — the entire point of an open game is to be
-- discovered by strangers who might join it. Not a leak: everything on
-- this row (target/min players, price per player, cutoff) is exactly
-- what an organizer intends to advertise.
create policy "open_games_select_public"
  on "public"."open_games" for select
  using (true);

create policy "open_games_insert_organizer_or_admin"
  on "public"."open_games" for insert
  with check (organizer_id = auth.uid() or public.is_platform_admin(auth.uid()));

-- Coarse backstop for updates (status transitions, cutoff processing).
-- Which transition is actually legal is enforced by
-- src/domain/open-games — the only code path that should issue this.
create policy "open_games_update_organizer_or_admin"
  on "public"."open_games" for update
  using (organizer_id = auth.uid() or public.is_platform_admin(auth.uid()));

-- No delete policy: an open game is never removed, only cancelled.

-- ---------------------------------------------------------------------
-- open_game_players
-- ---------------------------------------------------------------------

alter table "public"."open_game_players" enable row level security;

-- Public for the same reason as open_games — "7/10 joined" with who's
-- filling which position is the social/matchmaking value itself, not
-- incidental exposure.
create policy "open_game_players_select_public"
  on "public"."open_game_players" for select
  using (true);

-- A user may only ever claim a roster row for themselves — never join
-- on someone else's behalf. Capacity/cutoff/status eligibility is
-- src/domain/open-games's job, not RLS's.
create policy "open_game_players_insert_self"
  on "public"."open_game_players" for insert
  with check (user_id = auth.uid());

-- A player may update their own row (e.g. leaving); the organizer of
-- the parent game may too (e.g. removing a player); so may an admin.
create policy "open_game_players_update_self_or_organizer_or_admin"
  on "public"."open_game_players" for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.open_games og
      where og.id = open_game_id and og.organizer_id = auth.uid()
    )
    or public.is_platform_admin(auth.uid())
  );

-- ---------------------------------------------------------------------
-- payments — additive policy alongside 0011's booking-based one
-- (payments.booking_id is now nullable; this covers the
-- open_game_player_id-based rows the booking-based policy can't match).
-- Multiple SELECT policies on one table are OR'd together in Postgres —
-- this does not replace 0011's policy, it adds a second path.
-- ---------------------------------------------------------------------

create policy "payments_select_via_open_game_player"
  on "public"."payments" for select
  using (
    exists (
      select 1 from public.open_game_players ogp
      join public.open_games og on og.id = ogp.open_game_id
      where ogp.id = open_game_player_id
        and (
          ogp.user_id = auth.uid()
          or og.organizer_id = auth.uid()
          or public.is_platform_admin(auth.uid())
        )
    )
  );
