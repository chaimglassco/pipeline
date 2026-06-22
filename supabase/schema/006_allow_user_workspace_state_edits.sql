-- Allow active workspace users to edit shared LaunchFlow workspace data.
-- Run this after 003_workspace_app_state.sql. It fixes USER-level accounts such
-- as ruben@cartandcard.com so field edits save to Supabase instead of staying
-- local-only in one browser/account.

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
