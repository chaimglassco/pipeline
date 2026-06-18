-- LaunchFlow shared workspace app state.
-- Run this after 001_core_auth_workspace.sql.
-- This provides a safe JSONB bridge for current local-only workspace fields/dropdowns
-- before the data is split into fully normalized product/stage tables.

create table if not exists public.workspace_app_state (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state_key text not null,
  state_data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, state_key)
);

create index if not exists workspace_app_state_workspace_id_idx
on public.workspace_app_state (workspace_id);

create or replace trigger workspace_app_state_set_updated_at
before update on public.workspace_app_state
for each row execute function public.set_updated_at();

alter table public.workspace_app_state enable row level security;

grant select, insert, update, delete on public.workspace_app_state to authenticated;

drop policy if exists "workspace_app_state_select_members" on public.workspace_app_state;
create policy "workspace_app_state_select_members"
on public.workspace_app_state for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_app_state_insert_admins" on public.workspace_app_state;
drop policy if exists "workspace_app_state_insert_editors" on public.workspace_app_state;
create policy "workspace_app_state_insert_editors"
on public.workspace_app_state for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, array['owner', 'admin', 'user'])
  and updated_by = (select auth.uid())
);

drop policy if exists "workspace_app_state_update_admins" on public.workspace_app_state;
drop policy if exists "workspace_app_state_update_editors" on public.workspace_app_state;
create policy "workspace_app_state_update_editors"
on public.workspace_app_state for update
to authenticated
using (public.is_workspace_member(workspace_id, array['owner', 'admin', 'user']))
with check (
  public.is_workspace_member(workspace_id, array['owner', 'admin', 'user'])
  and updated_by = (select auth.uid())
);

drop policy if exists "workspace_app_state_delete_owners" on public.workspace_app_state;
create policy "workspace_app_state_delete_owners"
on public.workspace_app_state for delete
to authenticated
using (public.is_workspace_member(workspace_id, array['owner']));
