-- migrate:up
-- Identity of a document's CRDT history. A new generation is created whenever a document is
-- (re)built from JSON outside the CRDT log (creation, archive restore). Clients key their local
-- replicas by generation so a stale replica from an older history can never be merged into it.
alter table doc_state add column generation uuid not null default gen_random_uuid();

-- migrate:down
alter table doc_state drop column generation;
