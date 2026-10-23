-- migrate:up
-- Items 7, 17, 29: organisation appearance lives in organizations.settings (jsonb, no schema change); page covers in
-- pages.cover (exists since 0001, now also { gallery }). Here: contacts on the profile card and the record of
-- people mentioned in documents, so each new mention notifies its person exactly once.

-- Contacts shown to colleagues of the organisation on the profile card (never to guests or other organisations).
alter table users add column if not exists phone text, add column if not exists telegram text;
alter table users add constraint users_phone_format check (phone is null or (char_length(phone) <= 40 and phone ~ '^\+?[0-9 ()-]+$'));
alter table users add constraint users_telegram_format check (telegram is null or telegram ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');

-- One row per (page, mentioned person, block). block_id '*' = mentions that existed before this migration (any block):
-- they were never notified as document mentions and must not be after the upgrade.
create table page_mentions (
  page_id uuid not null references pages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  block_id text not null,
  mentioned_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (page_id, user_id, block_id)
);
create index page_mentions_user on page_mentions (user_id, created_at desc);

insert into page_mentions (page_id, user_id, block_id)
select distinct d.page_id, u.id, '*'
  from doc_state d
  cross join lateral jsonb_path_query(d.content, 'strict $.**') n
  join users u on u.id::text = n->'attrs'->>'id'
 where d.content is not null and jsonb_typeof(n) = 'object' and n->>'type' = 'mention'
on conflict do nothing;

-- migrate:down
drop table if exists page_mentions;
alter table users drop constraint if exists users_telegram_format;
alter table users drop constraint if exists users_phone_format;
alter table users drop column if exists telegram, drop column if exists phone;
