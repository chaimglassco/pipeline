-- LaunchFlow core Supabase schema: auth profiles, workspaces, and memberships.
-- Run this in Supabase SQL Editor after creating the Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'LaunchFlow Workspace',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'user', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create or replace trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.is_workspace_member(target_workspace_id uuid, allowed_roles text[] default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (allowed_roles is null or member.role = any(allowed_roles))
  );
$$;

create or replace function public.workspace_has_members(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = target_workspace_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated"
on public.workspaces for insert
to authenticated
with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

drop policy if exists "workspaces_select_members" on public.workspaces;
create policy "workspaces_select_members"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

drop policy if exists "workspaces_update_admins" on public.workspaces;
create policy "workspaces_update_admins"
on public.workspaces for update
to authenticated
using (public.is_workspace_member(id, array['owner', 'admin']))
with check (public.is_workspace_member(id, array['owner', 'admin']));

drop policy if exists "workspace_members_select_workspace_members" on public.workspace_members;
create policy "workspace_members_select_workspace_members"
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert_first_owner_or_admin" on public.workspace_members;
create policy "workspace_members_insert_first_owner_or_admin"
on public.workspace_members for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, array['owner', 'admin'])
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and status = 'active'
    and not public.workspace_has_members(workspace_id)
  )
);

drop policy if exists "workspace_members_update_admins" on public.workspace_members;
create policy "workspace_members_update_admins"
on public.workspace_members for update
to authenticated
using (public.is_workspace_member(workspace_id, array['owner', 'admin']))
with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));

drop policy if exists "workspace_members_delete_owners" on public.workspace_members;
create policy "workspace_members_delete_owners"
on public.workspace_members for delete
to authenticated
using (public.is_workspace_member(workspace_id, array['owner']));
