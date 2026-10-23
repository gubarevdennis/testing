-- migrate:up
-- History, page model and search P0 gaps (docs/requirements/status/collab-tree.yaml):
--  * every revision keeps a snapshot of the page properties (icon, cover, status, owner, tags, custom properties…),
--    so versions can be compared by properties, not only by text, and restored with them (V16-S11, R-HISTORY-013);
--  * pages get tags and a readable slug (R-PAGE-001); tags and headings are indexed for search (R-SEARCH-003);
--  * content_schema_version is kept per page and per revision for safe schema migrations (R-COLLAB-037).
alter table page_revisions add column props jsonb;
alter table page_revisions add column content_schema_version int not null default 1;

alter table pages add column tags text[] not null default '{}';
alter table pages add column slug text not null default '';
create index pages_tags on pages using gin (tags) where deleted_at is null;

-- Readable URL part derived from the title (Russian transliteration). The UUID stays the identity: links by id never
-- break on rename or move; the slug is cosmetic and always recomputed from the current title.
create or replace function kb_slug(t text) returns text language plpgsql immutable as $$
declare s text := lower(coalesce(t, ''));
begin
  s := replace(s, 'щ', 'shch'); s := replace(s, 'ж', 'zh'); s := replace(s, 'х', 'kh'); s := replace(s, 'ц', 'ts');
  s := replace(s, 'ч', 'ch'); s := replace(s, 'ш', 'sh'); s := replace(s, 'ю', 'yu'); s := replace(s, 'я', 'ya');
  s := replace(s, 'ё', 'e'); s := replace(s, 'ъ', ''); s := replace(s, 'ь', '');
  s := translate(s, 'абвгдезийклмнопрстуфыэ', 'abvgdeziyklmnoprstufye');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := trim(both '-' from s);
  return left(s, 80);
end $$;
create or replace function pages_set_slug() returns trigger language plpgsql as $$
begin
  new.slug := kb_slug(new.title);
  return new;
end $$;
create trigger pages_slug before insert or update of title on pages for each row execute function pages_set_slug();
update pages set slug = kb_slug(title);

alter table search_index add column tags text not null default '';
alter table search_index add column headings text not null default '';

-- migrate:down
alter table search_index drop column headings;
alter table search_index drop column tags;
drop trigger if exists pages_slug on pages;
drop function if exists pages_set_slug();
drop function if exists kb_slug(text);
drop index if exists pages_tags;
alter table pages drop column slug;
alter table pages drop column tags;
alter table page_revisions drop column content_schema_version;
alter table page_revisions drop column props;
