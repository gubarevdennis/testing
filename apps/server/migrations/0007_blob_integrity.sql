-- migrate:up
-- Periodic integrity verification of stored files (R-FILES-007): every blob is re-hashed regularly; a mismatch or a
-- missing object is recorded here, audited and shown to administrators.
alter table blobs add column verify_status text not null default 'ok' check (verify_status in ('ok', 'corrupt', 'missing'));
alter table blobs add column verify_error text;
create index blobs_verified_at on blobs (verified_at nulls first);

-- migrate:down
drop index if exists blobs_verified_at;
alter table blobs drop column verify_error;
alter table blobs drop column verify_status;
