-- migrate:up
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  email text not null,
  name text not null,
  kind text not null default 'employee' check (kind in ('employee', 'guest')),
  org_role text not null default 'member' check (org_role in ('owner', 'admin', 'people_admin', 'auditor', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'deactivated')),
  password_hash text,
  mfa_secret text,
  mfa_enabled boolean not null default false,
  external_id text,
  title text,
  manager_id uuid references users(id),
  primary_group_id uuid,
  locale text not null default 'ru',
  preferences jsonb not null default '{}'::jsonb,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  failed_logins int not null default 0,
  locked_until timestamptz
);
create unique index users_org_email on users (org_id, lower(email));
create index users_name_trgm on users using gin (name gin_trgm_ops);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash bytea not null unique,
  csrf_token text not null,
  mfa_passed boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  ip inet,
  user_agent text
);
create index sessions_user on sessions (user_id) where revoked_at is null;

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name text not null,
  token_hash bytea not null unique,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  description text not null default '',
  kind text not null default 'group' check (kind in ('department', 'group')),
  parent_id uuid references groups(id),
  manager_id uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index groups_org on groups (org_id) where deleted_at is null;
alter table users add constraint users_primary_group_fk foreign key (primary_group_id) references groups(id);

create table group_members (
  group_id uuid not null references groups(id),
  user_id uuid not null references users(id),
  role text not null default 'member' check (role in ('member', 'manager')),
  added_by uuid references users(id),
  added_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (group_id, user_id)
);
create index group_members_user on group_members (user_id);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  description text not null default '',
  icon text,
  kind text not null check (kind in ('org', 'department', 'project', 'private', 'personal', 'archive')),
  visibility text not null default 'private' check (visibility in ('open', 'closed', 'private')),
  owner_user_id uuid references users(id),
  settings jsonb not null default '{}'::jsonb,
  sort_key text not null default 'a0',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  legal_hold boolean not null default false
);
create unique index spaces_personal_owner on spaces (owner_user_id) where kind = 'personal';
create index spaces_org on spaces (org_id);

create table pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  space_id uuid not null references spaces(id),
  parent_id uuid references pages(id),
  sort_key text not null,
  title text not null default '',
  icon text,
  cover jsonb,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  inherit_permissions boolean not null default true,
  locked boolean not null default false,
  wide boolean not null default false,
  properties jsonb not null default '{}'::jsonb,
  collection_id uuid,
  owner_id uuid references users(id),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  content_updated_at timestamptz,
  published_revision_id uuid,
  content_schema_version int not null default 1,
  review_due_at date,
  verified_at timestamptz,
  verified_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  delete_batch_id uuid,
  delete_root boolean not null default false,
  legal_hold boolean not null default false,
  word_count int not null default 0,
  version int not null default 1,
  create_request_id text,
  constraint pages_not_self_parent check (parent_id is null or parent_id <> id)
);
create index pages_tree on pages (space_id, parent_id, sort_key) where deleted_at is null;
create index pages_parent on pages (parent_id);
create index pages_deleted on pages (org_id, deleted_at) where deleted_at is not null;
create unique index pages_create_request on pages (created_by, create_request_id) where create_request_id is not null;
create index pages_title_trgm on pages using gin (title gin_trgm_ops);

-- Ancestor closure: one row per (page, ancestor-or-self). Maintained transactionally on create/move.
create table page_ancestors (
  page_id uuid not null references pages(id) on delete cascade,
  ancestor_id uuid not null references pages(id) on delete cascade,
  depth int not null,
  primary key (page_id, ancestor_id)
);
create index page_ancestors_ancestor on page_ancestors (ancestor_id, depth);

create table grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  resource_type text not null check (resource_type in ('space', 'page')),
  resource_id uuid not null,
  subject_type text not null check (subject_type in ('user', 'group', 'org')),
  subject_id uuid,
  level text not null check (level in ('none', 'view', 'comment', 'edit', 'full')),
  can_export boolean,
  can_download boolean,
  can_share boolean,
  can_publish boolean,
  starts_at timestamptz,
  expires_at timestamptz,
  reason text,
  granted_by uuid references users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references users(id),
  constraint grants_subject check ((subject_type = 'org') = (subject_id is null))
);
create index grants_resource on grants (resource_type, resource_id) where revoked_at is null;
create index grants_subject on grants (subject_type, subject_id) where revoked_at is null;
create unique index grants_unique_active on grants (resource_type, resource_id, subject_type, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)) where revoked_at is null;

-- Incremented whenever anything affecting access changes; caches/WS sessions re-check when it moves.
create table acl_epoch (
  org_id uuid primary key references organizations(id),
  epoch bigint not null default 0
);

-- Collaboration: append-only CRDT update log (the durable journal) + compacted snapshots.
create table doc_updates (
  page_id uuid not null references pages(id),
  seq bigint not null,
  update bytea not null,
  user_id uuid references users(id),
  client_id bigint,
  op_id text,
  created_at timestamptz not null default now(),
  primary key (page_id, seq)
);
create unique index doc_updates_op on doc_updates (page_id, op_id) where op_id is not null;
create index doc_updates_time on doc_updates (page_id, created_at);

create table doc_state (
  page_id uuid primary key references pages(id),
  snapshot bytea,
  snapshot_seq bigint not null default 0,
  last_seq bigint not null default 0,
  content jsonb,
  plain_text text not null default '',
  updated_at timestamptz not null default now()
);

create table page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id),
  number int not null,
  kind text not null check (kind in ('auto', 'manual', 'publish', 'import', 'restore', 'pre-restore', 'create', 'migration')),
  label text,
  title text not null,
  state bytea not null,
  content jsonb not null,
  seq_upto bigint not null,
  authors uuid[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  restored_from uuid references page_revisions(id),
  unique (page_id, number)
);
alter table pages add constraint pages_published_rev_fk foreign key (published_revision_id) references page_revisions(id);

-- Journal of meaningful operations (edit groups with affected blocks, structural ops).
create table page_events (
  id bigserial primary key,
  org_id uuid not null,
  page_id uuid not null references pages(id),
  actor_id uuid references users(id),
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index page_events_page on page_events (page_id, id desc);

create table blobs (
  sha256 text primary key,
  size bigint not null,
  mime text not null,
  storage_key text not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  page_id uuid references pages(id),
  kind text not null default 'file' check (kind in ('file', 'image', 'video', 'import-source', 'cover', 'icon')),
  current_version int not null default 1,
  filename text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references users(id)
);
create index attachments_page on attachments (page_id);

create table attachment_versions (
  attachment_id uuid not null references attachments(id),
  version int not null,
  blob_sha256 text not null references blobs(sha256),
  size bigint not null,
  mime text not null,
  filename text not null,
  width int,
  height int,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (attachment_id, version)
);

create table upload_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null references users(id),
  page_id uuid references pages(id),
  attachment_id uuid,
  filename text not null,
  size bigint not null,
  mime text,
  received bigint not null default 0,
  sha256_expected text,
  temp_key text not null,
  status text not null default 'open' check (status in ('open', 'complete', 'failed', 'cancelled')),
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table blob_derivatives (
  blob_sha256 text not null references blobs(sha256),
  kind text not null,
  storage_key text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (blob_sha256, kind)
);

create table ocr_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  attachment_id uuid not null references attachments(id),
  version int not null,
  status text not null check (status in ('pending', 'processing', 'done', 'partial', 'error')),
  languages text not null default 'rus+eng',
  region jsonb,
  rotation int not null default 0,
  text text,
  words jsonb,
  confidence real,
  corrected_text text,
  corrected_by uuid references users(id),
  corrected_at timestamptz,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ocr_results_attachment on ocr_results (attachment_id, version, created_at desc);

create table comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  page_id uuid not null references pages(id),
  thread_id uuid not null,
  parent_id uuid references comments(id),
  block_id text,
  quote text,
  body jsonb not null,
  body_text text not null default '',
  author_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  deleted_at timestamptz,
  revision_number int
);
create index comments_page on comments (page_id, thread_id, created_at);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  page_id uuid not null references pages(id),
  revision_id uuid references page_revisions(id),
  requested_by uuid not null references users(id),
  reviewer_id uuid references users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text,
  decision_comment text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id)
);
create index approvals_page on approvals (page_id, created_at desc);

create table favorites (
  user_id uuid not null references users(id),
  page_id uuid not null references pages(id),
  sort_key text not null default 'a0',
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

create table recent_views (
  user_id uuid not null references users(id),
  page_id uuid not null references pages(id),
  viewed_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
create index recent_views_time on recent_views (user_id, viewed_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  type text not null,
  page_id uuid references pages(id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user on notifications (user_id, created_at desc);

create table templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  space_id uuid references spaces(id),
  key text,
  name text not null,
  description text not null default '',
  category text not null default 'Общее',
  icon text,
  content jsonb not null,
  properties jsonb not null default '{}'::jsonb,
  required_properties text[] not null default '{}',
  builtin boolean not null default false,
  published boolean not null default true,
  version int not null default 1,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index templates_builtin_key on templates (org_id, key) where key is not null;

create table template_versions (
  template_id uuid not null references templates(id),
  version int not null,
  content jsonb not null,
  properties jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (template_id, version)
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  page_id uuid not null references pages(id),
  name text not null,
  schema jsonb not null default '[]'::jsonb,
  views jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table pages add constraint pages_collection_fk foreign key (collection_id) references collections(id);
create index pages_collection on pages (collection_id) where collection_id is not null and deleted_at is null;

create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'awaiting_confirmation', 'succeeded', 'partial', 'failed', 'cancelled')),
  idempotency_key text,
  created_by uuid references users(id),
  params jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  result jsonb,
  report jsonb,
  error text,
  attempts int not null default 0,
  cancel_requested boolean not null default false,
  locked_by text,
  locked_until timestamptz,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create unique index jobs_idempotency on jobs (org_id, type, created_by, idempotency_key) where idempotency_key is not null;
create index jobs_queue on jobs (status, run_after) where status in ('queued', 'running');

create table idempotency_keys (
  key text not null,
  user_id uuid not null,
  method text not null,
  path text not null,
  status int not null,
  body jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table outbox (
  id bigserial primary key,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index outbox_pending on outbox (id) where processed_at is null;

create table search_index (
  page_id uuid primary key references pages(id),
  org_id uuid not null,
  space_id uuid not null,
  title text not null default '',
  body text not null default '',
  ocr text not null default '',
  files text not null default '',
  properties text not null default '',
  tsv tsvector not null,
  pub_title text,
  pub_body text,
  pub_tsv tsvector,
  updated_at timestamptz not null default now()
);
create index search_index_tsv on search_index using gin (tsv);
create index search_index_pub_tsv on search_index using gin (pub_tsv);
create index search_index_body_trgm on search_index using gin (body gin_trgm_ops);
create index search_index_title_trgm on search_index using gin (title gin_trgm_ops);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  email text not null,
  user_id uuid references users(id),
  token_hash bytea not null unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  page_id uuid not null references pages(id),
  token_hash bytea not null unique,
  password_hash text,
  include_children boolean not null default false,
  allow_download boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references users(id)
);

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  resource_type text not null,
  resource_id uuid not null,
  user_id uuid not null references users(id),
  level text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references users(id),
  decided_at timestamptz
);

create table backups (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null,
  location text,
  size_bytes bigint,
  checksum text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  verified_at timestamptz,
  verify_status text,
  verify_details jsonb
);

-- Tamper-evident audit log: hash chain, no UPDATE/DELETE.
create table audit_events (
  id bigserial primary key,
  org_id uuid,
  at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_name text,
  session_id uuid,
  ip inet,
  action text not null,
  target_type text,
  target_id text,
  outcome text not null default 'success',
  correlation_id text,
  details jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text not null
);
create index audit_events_org_time on audit_events (org_id, at desc);
create index audit_events_target on audit_events (target_type, target_id);

create function audit_events_immutable() returns trigger language plpgsql as $$
begin
  if current_setting('kb.allow_audit_purge', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'audit_events is append-only';
end $$;
create trigger audit_events_no_update before update or delete on audit_events
  for each row execute function audit_events_immutable();

-- Link graph between pages (backlinks, broken link detection), rebuilt from document content.
create table page_links (
  source_page_id uuid not null references pages(id) on delete cascade,
  target_page_id uuid not null,
  kind text not null default 'link',
  primary key (source_page_id, target_page_id, kind)
);
create index page_links_target on page_links (target_page_id);

create table user_state (
  user_id uuid primary key references users(id),
  sidebar jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- migrate:down
drop table if exists user_state;
drop table if exists page_links;
drop trigger if exists audit_events_no_update on audit_events;
drop function if exists audit_events_immutable();
drop table if exists audit_events;
drop table if exists backups;
drop table if exists access_requests;
drop table if exists share_links;
drop table if exists invitations;
drop table if exists search_index;
drop table if exists outbox;
drop table if exists idempotency_keys;
drop table if exists jobs;
alter table if exists pages drop constraint if exists pages_collection_fk;
drop table if exists collections;
drop table if exists template_versions;
drop table if exists templates;
drop table if exists notifications;
drop table if exists recent_views;
drop table if exists favorites;
drop table if exists approvals;
drop table if exists comments;
drop table if exists ocr_results;
drop table if exists blob_derivatives;
drop table if exists upload_sessions;
drop table if exists attachment_versions;
drop table if exists attachments;
drop table if exists blobs;
drop table if exists page_events;
alter table if exists pages drop constraint if exists pages_published_rev_fk;
drop table if exists page_revisions;
drop table if exists doc_state;
drop table if exists doc_updates;
drop table if exists acl_epoch;
drop table if exists grants;
drop table if exists page_ancestors;
drop table if exists pages;
drop table if exists spaces;
drop table if exists group_members;
alter table if exists users drop constraint if exists users_primary_group_fk;
drop table if exists groups;
drop table if exists api_tokens;
drop table if exists sessions;
drop table if exists users;
drop table if exists organizations;
