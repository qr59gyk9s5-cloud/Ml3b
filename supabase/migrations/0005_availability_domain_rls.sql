-- RLS for availability_rules / availability_exceptions. Both tables key
-- off facility_id, not venue_id directly, so every policy joins through
-- facilities to reach the venue-scoped helpers from 0001/0003.

-- ---------------------------------------------------------------------
-- availability_rules
-- ---------------------------------------------------------------------

alter table "public"."availability_rules" enable row level security;

-- Opening hours aren't sensitive — public once the facility itself is
-- public (active facility, ACTIVE venue). Staff always see their own
-- venue's rules regardless of status, so they can configure a facility
-- that isn't live yet.
create policy "availability_rules_select_public_or_staff_or_admin"
  on "public"."availability_rules" for select
  using (
    exists (
      select 1 from public.facilities f
      join public.venues v on v.id = f.venue_id
      where f.id = facility_id
        and (
          (f.is_active and v.status = 'ACTIVE')
          or public.is_venue_teammate(f.venue_id, auth.uid())
          or public.is_platform_admin(auth.uid())
        )
    )
  );

create policy "availability_rules_insert_owner_manager_or_admin"
  on "public"."availability_rules" for insert
  with check (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and (
          public.has_venue_role(f.venue_id, auth.uid(), array['OWNER', 'MANAGER'])
          or public.is_platform_admin(auth.uid())
        )
    )
  );

create policy "availability_rules_update_owner_manager_or_admin"
  on "public"."availability_rules" for update
  using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and (
          public.has_venue_role(f.venue_id, auth.uid(), array['OWNER', 'MANAGER'])
          or public.is_platform_admin(auth.uid())
        )
    )
  );

create policy "availability_rules_delete_owner_manager_or_admin"
  on "public"."availability_rules" for delete
  using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and (
          public.has_venue_role(f.venue_id, auth.uid(), array['OWNER', 'MANAGER'])
          or public.is_platform_admin(auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------------
-- availability_exceptions
-- ---------------------------------------------------------------------

alter table "public"."availability_exceptions" enable row level security;

create policy "availability_exceptions_select_public_or_staff_or_admin"
  on "public"."availability_exceptions" for select
  using (
    exists (
      select 1 from public.facilities f
      join public.venues v on v.id = f.venue_id
      where f.id = facility_id
        and (
          (f.is_active and v.status = 'ACTIVE')
          or public.is_venue_teammate(f.venue_id, auth.uid())
          or public.is_platform_admin(auth.uid())
        )
    )
  );

create policy "availability_exceptions_insert_owner_manager_or_admin"
  on "public"."availability_exceptions" for insert
  with check (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and (
          public.has_venue_role(f.venue_id, auth.uid(), array['OWNER', 'MANAGER'])
          or public.is_platform_admin(auth.uid())
        )
    )
  );

create policy "availability_exceptions_delete_owner_manager_or_admin"
  on "public"."availability_exceptions" for delete
  using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and (
          public.has_venue_role(f.venue_id, auth.uid(), array['OWNER', 'MANAGER'])
          or public.is_platform_admin(auth.uid())
        )
    )
  );

-- No update policy for exceptions: they're one-off records tied to a
-- specific reason/window — change is a delete + re-create, not an edit,
-- keeping the audit trail (who created which closure, when) honest.
