-- LaunchFlow workspace member seed for Ruben.
-- Run this after the user exists in Supabase Auth and after 002_seed_initial_workspace_owner.sql.
-- This script is idempotent: re-running it updates the same membership instead of duplicating it.

with target_member as (
  select
    '095559b5-e02c-4f19-9faf-651a6198b11a'::uuid as user_id,
    'ruben@cartandcard.com'::text as email,
    'user'::text as role
), verified_member as (
  select auth_user.id as user_id, auth_user.email, target.role
  from auth.users auth_user
  join target_member target on target.user_id = auth_user.id
  where lower(auth_user.email) = lower(target.email)
), target_workspace as (
  select id as workspace_id
  from public.workspaces
  where id = '00000000-0000-0000-0000-000000000001'::uuid
), member_upsert as (
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select target_workspace.workspace_id, verified_member.user_id, verified_member.role, 'active'
  from target_workspace
  cross join verified_member
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        updated_at = now()
  returning workspace_id, user_id, role, status
)
select
  member_upsert.workspace_id,
  member_upsert.user_id,
  verified_member.email,
  member_upsert.role,
  member_upsert.status
from member_upsert
join verified_member on verified_member.user_id = member_upsert.user_id;
