-- Supabase-specific glue that Drizzle doesn't express: the FK from
-- profiles to auth.users, the signup trigger, and RLS policies.
-- See docs/architecture/authorization.md for the matrix this encodes and
-- docs/security/security-model.md for why RLS exists alongside — not
-- instead of — server-side checks in src/domain/authz.

-- ---------------------------------------------------------------------
-- profiles <-> auth.users
-- ---------------------------------------------------------------------

alter table "public"."profiles"
  add constraint "profiles_id_fkey"
  foreign key ("id") references auth.users (id) on delete cascade;

-- Creates a profile row automatically when someone signs up. Runs as the
-- function owner (security definer) so it can write to public.profiles
-- even though the new user has no session/RLS grants yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RLS helper functions
--
-- A policy on `platform_admins` that queries `platform_admins` (to check
-- "is the requester an admin") — or a policy on `venue_members` that
-- queries `venue_members` (to check "is the requester a teammate") — is
-- self-referencing: Postgres has to re-run the same RLS-guarded policy to
-- evaluate itself, which raises "infinite recursion detected in policy".
--
-- The fix is the standard one: put the lookup in a SECURITY DEFINER
-- function. It runs with the function owner's privileges, bypassing RLS
-- for just that one lookup, which breaks the recursion. These functions
-- are the *only* place that happens — everything else stays RLS-checked.
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = uid);
$$;

create or replace function public.has_venue_role(target_venue_id uuid, uid uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.venue_members m
    where m.venue_id = target_venue_id and m.user_id = uid and m.role::text = any(roles)
  );
$$;

create or replace function public.is_venue_teammate(target_venue_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.venue_members m
    where m.venue_id = target_venue_id and m.user_id = uid
  );
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

alter table "public"."profiles" enable row level security;

-- A user reads their own profile. Admins read everyone's (support/
-- moderation needs this; it's audited at the application layer when used
-- for anything beyond routine display).
create policy "profiles_select_own_or_admin"
  on "public"."profiles" for select
  using (id = auth.uid() or public.is_platform_admin(auth.uid()));

-- A user may only ever edit their own profile.
create policy "profiles_update_own"
  on "public"."profiles" for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy: rows are created only by the handle_new_user
-- trigger (security definer, bypasses RLS) and never deleted directly —
-- they cascade from auth.users.

-- ---------------------------------------------------------------------
-- platform_admins
-- ---------------------------------------------------------------------

alter table "public"."platform_admins" enable row level security;

-- A user can check their own admin status; existing admins can see the
-- full admin roster. Granting/revoking admin access happens only via the
-- service role (never through the anon/authenticated API) — no insert,
-- update, or delete policy exists here on purpose.
create policy "platform_admins_select_self_or_admin"
  on "public"."platform_admins" for select
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------

alter table "public"."venues" enable row level security;

-- Public can browse venues once they're live. Staff can always see their
-- own venue regardless of status (so an owner can see their DRAFT venue
-- while configuring it). Admins see everything.
create policy "venues_select_active_or_member_or_admin"
  on "public"."venues" for select
  using (
    status = 'ACTIVE'
    or public.is_venue_teammate(id, auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- Any authenticated user may submit a venue (it starts life as DRAFT);
-- the row must be self-attributed.
create policy "venues_insert_self"
  on "public"."venues" for insert
  with check (created_by = auth.uid());

-- OWNER/MANAGER members of the venue, or admins, may update it. This is a
-- coarse defense-in-depth boundary — the actual lifecycle transition
-- rules (DRAFT -> PENDING_REVIEW -> ACTIVE, who may set which status)
-- live in the Phase 3 domain service, not here.
create policy "venues_update_staff_or_admin"
  on "public"."venues" for update
  using (
    public.has_venue_role(id, auth.uid(), array['OWNER', 'MANAGER'])
    or public.is_platform_admin(auth.uid())
  );

-- No delete policy: venues are archived via status, never hard-deleted.

-- ---------------------------------------------------------------------
-- venue_members
-- ---------------------------------------------------------------------

alter table "public"."venue_members" enable row level security;

-- A member sees their own membership rows, and every membership row for
-- any venue they themselves belong to (so staff can see their
-- teammates). Admins see everything.
create policy "venue_members_select_teammates_or_admin"
  on "public"."venue_members" for select
  using (
    user_id = auth.uid()
    or public.is_venue_teammate(venue_id, auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- Only an existing OWNER/MANAGER of the venue (or an admin) may add staff.
create policy "venue_members_insert_owner_manager_or_admin"
  on "public"."venue_members" for insert
  with check (
    public.has_venue_role(venue_id, auth.uid(), array['OWNER', 'MANAGER'])
    or public.is_platform_admin(auth.uid())
  );

-- Role changes/removal: OWNER of the venue, or an admin. (The finer rule
-- that a MANAGER may remove a RECEPTIONIST but not another MANAGER is
-- enforced in the Phase 3 domain service — RLS here is the coarse
-- backstop, not the full authorization matrix.)
create policy "venue_members_update_owner_or_admin"
  on "public"."venue_members" for update
  using (
    public.has_venue_role(venue_id, auth.uid(), array['OWNER'])
    or public.is_platform_admin(auth.uid())
  );

create policy "venue_members_delete_owner_or_admin"
  on "public"."venue_members" for delete
  using (
    public.has_venue_role(venue_id, auth.uid(), array['OWNER'])
    or public.is_platform_admin(auth.uid())
  );
