-- LaunchFlow normalized product workspace schema.
-- Run this after 003_workspace_app_state.sql and any workspace member seed scripts.
-- workspace_app_state remains only as a migration/fallback bridge while these
-- normalized tables become the canonical persistence layer.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Sample Amazon Product',
  asin text not null default '',
  sku text not null default '',
  current_active_stage_index integer not null default 1 check (current_active_stage_index between 1 and 14),
  conversion_rate numeric(8, 4),
  active_ppc boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_financial_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  currency text not null default 'USD',
  unit_cost numeric(12, 2),
  landed_cost numeric(12, 2),
  retail_price numeric(12, 2),
  amazon_fees numeric(12, 2),
  ppc_budget numeric(12, 2),
  target_margin_percent numeric(8, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id),
  check (currency = upper(currency) and char_length(currency) between 3 and 6)
);

create table if not exists public.product_stage_details (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  stage_id text not null,
  stage_index integer not null check (stage_index between 1 and 14),
  is_expanded boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, stage_id),
  unique (product_id, stage_index)
);

create table if not exists public.stage_field_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage_id text not null,
  stage_index integer not null check (stage_index between 1 and 14),
  label text not null,
  field_type text not null check (field_type in ('TEXT', 'NUMBER', 'LINK', 'CURRENCY', 'WEIGHT', 'SIZING', 'DATE')),
  sort_order integer not null default 0,
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  product_stage_detail_id uuid not null references public.product_stage_details(id) on delete cascade,
  stage_field_template_id uuid references public.stage_field_templates(id) on delete set null,
  label text not null,
  field_type text not null check (field_type in ('TEXT', 'NUMBER', 'LINK', 'CURRENCY', 'WEIGHT', 'SIZING', 'DATE')),
  value jsonb not null default 'null'::jsonb,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  product_stage_detail_id uuid not null references public.product_stage_details(id) on delete cascade,
  task_name text not null,
  is_completed boolean not null default false,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.launch_monitoring_entries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  entry_date date not null default current_date,
  sessions integer,
  units_ordered integer,
  conversion_rate numeric(8, 4),
  ppc_spend numeric(12, 2),
  sales numeric(12, 2),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sessions is null or sessions >= 0),
  check (units_ordered is null or units_ordered >= 0)
);

create table if not exists public.campaign_prep_settings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  daily_budget numeric(12, 2),
  target_acos_percent numeric(8, 4),
  keyword_strategy text not null default '',
  launch_coupon_enabled boolean not null default false,
  coupon_details text not null default '',
  campaign_notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id)
);

create table if not exists public.vine_review_feedback (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_name text not null default '',
  rating integer check (rating between 1 and 5),
  review_url text not null default '',
  feedback text not null default '',
  action_required boolean not null default false,
  reviewed_at date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_workspace_id_idx on public.products (workspace_id);
create index if not exists product_stage_details_product_id_idx on public.product_stage_details (product_id);
create index if not exists stage_field_templates_workspace_stage_idx on public.stage_field_templates (workspace_id, stage_index);
create index if not exists custom_field_values_stage_detail_idx on public.custom_field_values (product_stage_detail_id);
create index if not exists checklist_tasks_stage_detail_idx on public.checklist_tasks (product_stage_detail_id);
create index if not exists launch_monitoring_entries_product_date_idx on public.launch_monitoring_entries (product_id, entry_date desc);
create index if not exists vine_review_feedback_product_id_idx on public.vine_review_feedback (product_id);

create or replace trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create or replace trigger product_financial_fields_set_updated_at before update on public.product_financial_fields for each row execute function public.set_updated_at();
create or replace trigger product_stage_details_set_updated_at before update on public.product_stage_details for each row execute function public.set_updated_at();
create or replace trigger stage_field_templates_set_updated_at before update on public.stage_field_templates for each row execute function public.set_updated_at();
create or replace trigger custom_field_values_set_updated_at before update on public.custom_field_values for each row execute function public.set_updated_at();
create or replace trigger checklist_tasks_set_updated_at before update on public.checklist_tasks for each row execute function public.set_updated_at();
create or replace trigger launch_monitoring_entries_set_updated_at before update on public.launch_monitoring_entries for each row execute function public.set_updated_at();
create or replace trigger campaign_prep_settings_set_updated_at before update on public.campaign_prep_settings for each row execute function public.set_updated_at();
create or replace trigger vine_review_feedback_set_updated_at before update on public.vine_review_feedback for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.product_financial_fields enable row level security;
alter table public.product_stage_details enable row level security;
alter table public.stage_field_templates enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.checklist_tasks enable row level security;
alter table public.launch_monitoring_entries enable row level security;
alter table public.campaign_prep_settings enable row level security;
alter table public.vine_review_feedback enable row level security;

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_financial_fields to authenticated;
grant select, insert, update, delete on public.product_stage_details to authenticated;
grant select, insert, update, delete on public.stage_field_templates to authenticated;
grant select, insert, update, delete on public.custom_field_values to authenticated;
grant select, insert, update, delete on public.checklist_tasks to authenticated;
grant select, insert, update, delete on public.launch_monitoring_entries to authenticated;
grant select, insert, update, delete on public.campaign_prep_settings to authenticated;
grant select, insert, update, delete on public.vine_review_feedback to authenticated;

-- Workspace-scoped tables: products and stage_field_templates.
drop policy if exists "products_select_members" on public.products;
create policy "products_select_members" on public.products for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "products_insert_admins" on public.products;
create policy "products_insert_admins" on public.products for insert to authenticated with check (public.is_workspace_member(workspace_id, array['owner', 'admin']) and created_by = (select auth.uid()));
drop policy if exists "products_update_admins" on public.products;
create policy "products_update_admins" on public.products for update to authenticated using (public.is_workspace_member(workspace_id, array['owner', 'admin'])) with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
drop policy if exists "products_delete_owners" on public.products;
create policy "products_delete_owners" on public.products for delete to authenticated using (public.is_workspace_member(workspace_id, array['owner']));

drop policy if exists "stage_field_templates_select_members" on public.stage_field_templates;
create policy "stage_field_templates_select_members" on public.stage_field_templates for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "stage_field_templates_insert_admins" on public.stage_field_templates;
create policy "stage_field_templates_insert_admins" on public.stage_field_templates for insert to authenticated with check (public.is_workspace_member(workspace_id, array['owner', 'admin']) and created_by = (select auth.uid()));
drop policy if exists "stage_field_templates_update_admins" on public.stage_field_templates;
create policy "stage_field_templates_update_admins" on public.stage_field_templates for update to authenticated using (public.is_workspace_member(workspace_id, array['owner', 'admin'])) with check (public.is_workspace_member(workspace_id, array['owner', 'admin']));
drop policy if exists "stage_field_templates_delete_owners" on public.stage_field_templates;
create policy "stage_field_templates_delete_owners" on public.stage_field_templates for delete to authenticated using (public.is_workspace_member(workspace_id, array['owner']));

-- Product-owned child tables inherit workspace access through products.
drop policy if exists "product_financial_fields_select_members" on public.product_financial_fields;
create policy "product_financial_fields_select_members" on public.product_financial_fields for select to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "product_financial_fields_insert_admins" on public.product_financial_fields;
create policy "product_financial_fields_insert_admins" on public.product_financial_fields for insert to authenticated with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "product_financial_fields_update_admins" on public.product_financial_fields;
create policy "product_financial_fields_update_admins" on public.product_financial_fields for update to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "product_financial_fields_delete_owners" on public.product_financial_fields;
create policy "product_financial_fields_delete_owners" on public.product_financial_fields for delete to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner'])));

drop policy if exists "product_stage_details_select_members" on public.product_stage_details;
create policy "product_stage_details_select_members" on public.product_stage_details for select to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "product_stage_details_insert_admins" on public.product_stage_details;
create policy "product_stage_details_insert_admins" on public.product_stage_details for insert to authenticated with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "product_stage_details_update_admins" on public.product_stage_details;
create policy "product_stage_details_update_admins" on public.product_stage_details for update to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "product_stage_details_delete_owners" on public.product_stage_details;
create policy "product_stage_details_delete_owners" on public.product_stage_details for delete to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner'])));

drop policy if exists "launch_monitoring_entries_select_members" on public.launch_monitoring_entries;
create policy "launch_monitoring_entries_select_members" on public.launch_monitoring_entries for select to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "launch_monitoring_entries_insert_admins" on public.launch_monitoring_entries;
create policy "launch_monitoring_entries_insert_admins" on public.launch_monitoring_entries for insert to authenticated with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])) and created_by = (select auth.uid()));
drop policy if exists "launch_monitoring_entries_update_admins" on public.launch_monitoring_entries;
create policy "launch_monitoring_entries_update_admins" on public.launch_monitoring_entries for update to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "launch_monitoring_entries_delete_owners" on public.launch_monitoring_entries;
create policy "launch_monitoring_entries_delete_owners" on public.launch_monitoring_entries for delete to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner'])));

drop policy if exists "campaign_prep_settings_select_members" on public.campaign_prep_settings;
create policy "campaign_prep_settings_select_members" on public.campaign_prep_settings for select to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "campaign_prep_settings_insert_admins" on public.campaign_prep_settings;
create policy "campaign_prep_settings_insert_admins" on public.campaign_prep_settings for insert to authenticated with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])) and created_by = (select auth.uid()));
drop policy if exists "campaign_prep_settings_update_admins" on public.campaign_prep_settings;
create policy "campaign_prep_settings_update_admins" on public.campaign_prep_settings for update to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "campaign_prep_settings_delete_owners" on public.campaign_prep_settings;
create policy "campaign_prep_settings_delete_owners" on public.campaign_prep_settings for delete to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner'])));

drop policy if exists "vine_review_feedback_select_members" on public.vine_review_feedback;
create policy "vine_review_feedback_select_members" on public.vine_review_feedback for select to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "vine_review_feedback_insert_admins" on public.vine_review_feedback;
create policy "vine_review_feedback_insert_admins" on public.vine_review_feedback for insert to authenticated with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])) and created_by = (select auth.uid()));
drop policy if exists "vine_review_feedback_update_admins" on public.vine_review_feedback;
create policy "vine_review_feedback_update_admins" on public.vine_review_feedback for update to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "vine_review_feedback_delete_owners" on public.vine_review_feedback;
create policy "vine_review_feedback_delete_owners" on public.vine_review_feedback for delete to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_workspace_member(p.workspace_id, array['owner'])));

-- Stage-detail child tables inherit access through product_stage_details -> products.
drop policy if exists "custom_field_values_select_members" on public.custom_field_values;
create policy "custom_field_values_select_members" on public.custom_field_values for select to authenticated using (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "custom_field_values_insert_admins" on public.custom_field_values;
create policy "custom_field_values_insert_admins" on public.custom_field_values for insert to authenticated with check (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])) and created_by = (select auth.uid()));
drop policy if exists "custom_field_values_update_admins" on public.custom_field_values;
create policy "custom_field_values_update_admins" on public.custom_field_values for update to authenticated using (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "custom_field_values_delete_owners" on public.custom_field_values;
create policy "custom_field_values_delete_owners" on public.custom_field_values for delete to authenticated using (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner'])));

drop policy if exists "checklist_tasks_select_members" on public.checklist_tasks;
create policy "checklist_tasks_select_members" on public.checklist_tasks for select to authenticated using (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "checklist_tasks_insert_admins" on public.checklist_tasks;
create policy "checklist_tasks_insert_admins" on public.checklist_tasks for insert to authenticated with check (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])) and created_by = (select auth.uid()));
drop policy if exists "checklist_tasks_update_admins" on public.checklist_tasks;
create policy "checklist_tasks_update_admins" on public.checklist_tasks for update to authenticated using (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin']))) with check (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner', 'admin'])));
drop policy if exists "checklist_tasks_delete_owners" on public.checklist_tasks;
create policy "checklist_tasks_delete_owners" on public.checklist_tasks for delete to authenticated using (exists (select 1 from public.product_stage_details psd join public.products p on p.id = psd.product_id where psd.id = product_stage_detail_id and public.is_workspace_member(p.workspace_id, array['owner'])));
