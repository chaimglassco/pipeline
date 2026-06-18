-- LaunchFlow initial workspace owner seed.
-- Run this after 001_core_auth_workspace.sql and after creating the admin Auth user.
-- This script is idempotent: re-running it updates the same workspace/member instead of duplicating them.

with target_admin as (
  select
    'c4ff8192-082c-4328-a4ec-5fe42690ad35'::uuid as user_id,
    'chaim@glasscosupplies.com'::text as email
), verified_admin as (
  select auth_user.id as user_id, auth_user.email
  from auth.users auth_user
  join target_admin target on target.user_id = auth_user.id
  where lower(auth_user.email) = lower(target.email)
), workspace_upsert as (
  insert into public.workspaces (id, name, created_by)
  select
    '00000000-0000-0000-0000-000000000001'::uuid,
    'LaunchFlow Workspace',
    verified_admin.user_id
  from verified_admin
  on conflict (id) do update
    set name = excluded.name,
        created_by = coalesce(public.workspaces.created_by, excluded.created_by),
        updated_at = now()
  returning id
), owner_upsert as (
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select workspace_upsert.id, verified_admin.user_id, 'owner', 'active'
  from workspace_upsert
  cross join verified_admin
  on conflict (workspace_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now()
  returning workspace_id, user_id, role, status
)
select
  owner_upsert.workspace_id,
  owner_upsert.user_id,
  verified_admin.email,
  owner_upsert.role,
  owner_upsert.status
from owner_upsert
join verified_admin on verified_admin.user_id = owner_upsert.user_id;
