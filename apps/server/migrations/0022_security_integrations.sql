-- migrate:up
-- Security and integrations (docs/SECURITY.md, SEC-L3/SEC-L4, R-ACL-036):
--  * OIDC sessions remember how they were created and the (sealed) ID token, so logout can end the IdP session
--    (RP-initiated logout with id_token_hint); group memberships carry their source so SSO group/department mapping
--    only ever removes memberships it added itself;
--  * grants can name the members of a space as their subject («участники пространства X», R-ACL-036);
--  * rate-limit counters shared by all application instances (fixed windows; UNLOGGED: counters are disposable,
--    losing them on a PostgreSQL crash only resets the windows).
alter table sessions add column auth_method text not null default 'password';
alter table sessions add column id_token_sealed text;

alter table group_members add column source text not null default 'manual' check (source in ('manual', 'oidc'));

alter table grants drop constraint grants_subject_type_check;
alter table grants add constraint grants_subject_type_check check (subject_type in ('user', 'group', 'org', 'space'));

create unlogged table rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null,
  primary key (key, window_start)
);
create index rate_limit_counters_window on rate_limit_counters (window_start);

-- migrate:down
drop table rate_limit_counters;
delete from grants where subject_type = 'space';
alter table grants drop constraint grants_subject_type_check;
alter table grants add constraint grants_subject_type_check check (subject_type in ('user', 'group', 'org'));
alter table group_members drop column source;
alter table sessions drop column id_token_sealed;
alter table sessions drop column auth_method;
