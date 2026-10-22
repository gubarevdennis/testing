-- migrate:up
-- Access-control P0 gaps (docs/requirements/status/acl-admin.yaml):
--  * grants remember the time zone the dates were entered in and whether the owner was reminded before expiry (R-ACL-036, R-ACL-063);
--  * public links: noindex by default, access counters (R-PUBLISH-009);
--  * emergency access to restricted/personal content: two-person approval, reason, time limit, audit (R-ACL-056, R-ADMIN-016).
alter table grants add column time_zone text;
alter table grants add column reminder_sent_at timestamptz;

alter table share_links add column allow_index boolean not null default false;
alter table share_links add column last_access_at timestamptz;
alter table share_links add column access_count int not null default 0;
create index share_links_page on share_links (page_id) where revoked_at is null;

create table emergency_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  page_id uuid not null references pages(id),
  requested_by uuid not null references users(id),
  reason text not null,
  duration_hours int not null check (duration_hours between 1 and 72),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  grant_id uuid references grants(id),
  created_at timestamptz not null default now()
);
create index emergency_access_org on emergency_access (org_id, created_at desc);

-- migrate:down
drop table if exists emergency_access;
drop index if exists share_links_page;
alter table share_links drop column access_count;
alter table share_links drop column last_access_at;
alter table share_links drop column allow_index;
alter table grants drop column reminder_sent_at;
alter table grants drop column time_zone;
