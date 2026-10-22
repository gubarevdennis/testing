-- migrate:up
-- Search also covers comment text and the text of attached documents (R-SEARCH-003, R-SEARCH-013).
alter table search_index add column comments text not null default '';
alter table search_index add column file_text text not null default '';
-- Extracted text of stored files, keyed by content hash (identical files are extracted once).
create table blob_texts (
  blob_sha256 text primary key,
  status text not null check (status in ('done', 'unsupported', 'error')),
  text text not null default '',
  error text,
  extracted_at timestamptz not null default now()
);

-- migrate:down
drop table blob_texts;
alter table search_index drop column file_text;
alter table search_index drop column comments;
