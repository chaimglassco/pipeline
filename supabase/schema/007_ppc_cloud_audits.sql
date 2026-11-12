-- Server-only audit data. The application authenticates workspace membership before
-- every operation; browser roles have no direct grants on these tables.
create table if not exists ppc_audit_imports (
 id uuid primary key, workspace text not null, owner_email text not null,
 idempotency_key text not null, name text not null, filename text not null,
 status text not null default 'uploading', generation integer not null default 0,
 revision integer not null default 0, parser_version text not null,
 raw_path text not null, raw_deleted_at timestamptz, checksum text,
 workflow_id text, context jsonb, manifest jsonb not null default '[]',
 progress jsonb not null default '{}', failure text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace,idempotency_key)
);
create index if not exists ppc_audit_import_hash on ppc_audit_imports(workspace,checksum,parser_version);
create table if not exists ppc_audit_rows (
 import_id uuid not null references ppc_audit_imports(id) on delete cascade,
 generation integer not null, id text not null, scope text not null,
 source_id text not null, fact jsonb not null,
 primary key(import_id,generation,id)
);
create index if not exists ppc_audit_row_scope on ppc_audit_rows(import_id,generation,scope);
create table if not exists ppc_audit_issues (
 id bigserial primary key, import_id uuid not null references ppc_audit_imports(id) on delete cascade,
 generation integer not null, issue_key text not null, issue jsonb not null,
 unique(import_id,generation,issue_key)
);
create table if not exists ppc_audit_resolutions (
 import_id uuid not null references ppc_audit_imports(id) on delete cascade,
 scope text not null, source_id text not null, editor text not null,
 revision integer not null, created_at timestamptz not null default now(),
 primary key(import_id,scope)
);
create table if not exists ppc_audit_snapshots (
 id uuid primary key, workspace text not null,
 import_id uuid not null references ppc_audit_imports(id), generation integer not null,
 revision integer not null, name text not null, context jsonb not null,
 coverage jsonb not null, created_by text not null,
 active boolean not null default false, created_at timestamptz not null default now(),
 unique(import_id,generation,revision)
);
create unique index if not exists ppc_audit_active_workspace on ppc_audit_snapshots(workspace) where active;
create table if not exists ppc_audit_snapshot_rows (
 snapshot_id uuid not null references ppc_audit_snapshots(id) on delete cascade,
 row_id text not null, scope text not null, source_id text not null, fact jsonb not null,
 primary key(snapshot_id,row_id)
);
create index if not exists ppc_audit_snapshot_scope on ppc_audit_snapshot_rows(snapshot_id,scope);
create index if not exists ppc_audit_snapshot_identity on ppc_audit_snapshot_rows(snapshot_id,md5(fact->>'identity'));
alter table ppc_audit_imports enable row level security;
alter table ppc_audit_rows enable row level security;
alter table ppc_audit_issues enable row level security;
alter table ppc_audit_resolutions enable row level security;
alter table ppc_audit_snapshots enable row level security;
alter table ppc_audit_snapshot_rows enable row level security;
revoke all on ppc_audit_imports,ppc_audit_rows,ppc_audit_issues,ppc_audit_resolutions,ppc_audit_snapshots,ppc_audit_snapshot_rows from anon,authenticated;
