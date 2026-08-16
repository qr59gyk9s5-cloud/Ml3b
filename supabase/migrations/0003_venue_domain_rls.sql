-- RLS for the Phase 3 venue-domain tables. Reuses the SECURITY DEFINER
-- helpers from 0001_identity_auth_and_rls.sql (is_platform_admin,
-- has_venue_role, is_venue_teammate) — see
-- docs/architecture/authorization.md for why those exist instead of
-- inlining the subqueries.

-- ---------------------------------------------------------------------
-- sports — platform-curated reference data, fully public to read
-- ---------------------------------------------------------------------

alter table "public"."sports" enable row level security;

create policy "sports_select_all"
  on "public"."sports" for select
  using (true);

-- No insert/update/delete policy: managed via the service role (seed data
-- today, an admin tool later), never through the anon/authenticated API.

-- ---------------------------------------------------------------------
-- facilities
-- ---------------------------------------------------------------------

alter table "public"."facilities" enable row level security;

-- Public sees an active facility at an ACTIVE venue. Venue staff always
-- see every facility at their own venue, regardless of facility/venue
-- status (so they can manage a facility they've just deactivated, or one
-- at a venue still in DRAFT). Admins see everything.
create policy "facilities_select_public_or_staff_or_admin"
  on "public"."facilities" for select
  using (
    (
      is_active
      and exists (select 1 from public.venues v where v.id = venue_id and v.status = 'ACTIVE')
    )
    or public.is_venue_teammate(venue_id, auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- Facility/pricing edits: OWNER or MANAGER, not RECEPTIONIST — matches
-- the authorization matrix in docs/architecture/authorization.md.
create policy "facilities_insert_owner_manager_or_admin"
  on "public"."facilities" for insert
  with check (
    public.has_venue_role(venue_id, auth.uid(), array['OWNER', 'MANAGER'])
    or public.is_platform_admin(auth.uid())
  );

create policy "facilities_update_owner_manager_or_admin"
  on "public"."facilities" for update
  using (
    public.has_venue_role(venue_id, auth.uid(), array['OWNER', 'MANAGER'])
    or public.is_platform_admin(auth.uid())
  );

-- No delete policy: facilities are deactivated (is_active = false), never
-- hard-deleted — consistent with venues.
