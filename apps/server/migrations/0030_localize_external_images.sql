-- migrate:up
-- Images hot-linked from external sites in existing documents (pasted before images were copied on paste, SEC-L1)
-- would stop showing under CSP img-src 'self'. One background job per organisation copies them into the knowledge
-- base through the SSRF-guarded fetcher and points the documents at the copies (services/localize-images.ts).
insert into jobs (org_id, type, params)
select o.id, 'localize-images', '{}'::jsonb from organizations o
 where not exists (select 1 from jobs j where j.org_id = o.id and j.type = 'localize-images');

-- migrate:down
delete from jobs where type = 'localize-images' and status = 'queued';
