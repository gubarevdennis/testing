-- migrate:up
-- Suggested title of pages created from a template (templates created directly from content).
alter table templates add column default_title text;

-- migrate:down
alter table templates drop column default_title;
