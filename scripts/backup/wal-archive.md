# Continuous WAL archiving and point-in-time recovery (PITR)

The daily logical backup (`backup.sh`) alone gives an RPO of up to 24 h. The spec requires
**RPO ≤ 5 min** for server-confirmed changes. That needs three things:

1. **Continuous WAL archiving.** `archive_timeout = 60s` caps the database RPO at about 1 min.
2. **Frequent object sync.** Run `backup.sh --objects-only` every 5 min. Objects are immutable and
   content-addressed, so a run that finds nothing new takes milliseconds.
3. **A physical base backup** to replay WAL onto (`pg_basebackup`, daily or weekly).

Every confirmed edit is a committed row in `doc_updates` (the server acknowledges only after COMMIT).
So a database recovered to time T contains every edit acknowledged before T.

## 1. Configure the primary (`postgresql.conf`)

```conf
wal_level = replica
archive_mode = on                     # needs a restart
archive_timeout = 60s                 # force a segment switch at least every minute
archive_command = 'WAL_ARCHIVE_DIR=/backups/wal /opt/kb/scripts/backup/wal-archive.sh %p %f'
max_wal_senders = 5                   # pg_basebackup -X stream
```

`wal-archive.sh` copies the segment atomically (temp file, fsync, rename) and records its sha256.
If the segment is already archived with identical content, it succeeds without rewriting it. If
a *different* file with the same name exists, it fails and never overwrites. Set
`WAL_ENCRYPT_CMD` for encryption at rest; `wal-restore.sh` then needs `WAL_DECRYPT_CMD`.

WAL archive locations:

- Keep the archive on storage that does not share a failure domain with the database.
- Ship it offsite continuously, e.g. `aws s3 sync /backups/wal s3://kb-wal-offsite` every minute
  into a bucket with object lock.
- Retain it at least as long as the oldest base backup you want to recover from.

Clean up with `pg_archivecleanup /backups/wal <oldest-needed-segment>`.

Monitoring:

- `pg_stat_archiver.failed_count` and `last_archived_time` (postgres_exporter metrics
  `pg_stat_archiver_failed_count` and `pg_stat_archiver_last_archive_age`).
- The alerts `KbWalArchivingFailing` and `KbWalArchiveStale` in
  `deploy/monitoring/prometheus-alerts.yml`.
- A failing `archive_command` makes `pg_wal` grow until the disk fills: treat it as critical.

## 2. Base backups

```bash
# separate role: CREATE ROLE kb_basebackup WITH LOGIN REPLICATION PASSWORD '...';
pg_basebackup -h db -U kb_basebackup -D /backups/base/$(date -u +%Y%m%dT%H%M%SZ) \
  -Ft -z -X stream -c fast --manifest-checksums=SHA256
# or as part of the daily run:  BACKUP_PG_BASEBACKUP=1 scripts/backup/backup.sh
pg_verifybackup -n <dir>          # checks the backup manifest (tar format: extract first)
```

## 3. Frequent object sync (files)

```cron
*/5 * * * *  STORAGE_ROOT=/var/lib/kb/objects BACKUP_DIR=/backups /opt/kb/scripts/backup/backup.sh --objects-only
```

New objects are appended to `objects/index.log`. Garbage collection never deletes pool objects
newer than the oldest retained full backup.

## 4. Recover to a point in time (new cluster, never in place)

```bash
# 0. Choose T: just before the incident (audit_events / page_events / application logs give exact times).
# 1. Restore the newest base backup taken BEFORE T into an empty data directory (owned by postgres, 0700):
mkdir -p /srv/pg-pitr && tar xzf base.tar.gz -C /srv/pg-pitr && tar xzf pg_wal.tar.gz -C /srv/pg-pitr/pg_wal
# 2. Recovery settings:
cat >> /srv/pg-pitr/postgresql.auto.conf <<'EOF'
port = 5433
archive_mode = off
restore_command = 'WAL_ARCHIVE_DIR=/backups/wal /opt/kb/scripts/backup/wal-restore.sh %f %p'
recovery_target_time = '2026-10-22 14:05:00+03'
recovery_target_action = 'promote'
EOF
touch /srv/pg-pitr/recovery.signal
# 3. Start it and wait until pg_is_in_recovery() = false.
pg_ctl -D /srv/pg-pitr -l /srv/pg-pitr.log start
# 4. Objects referenced by the recovered database:
scripts/backup/restore-objects.sh --db postgres://kb@localhost:5433/kb --pool /backups/objects --target /var/lib/kb/objects-pitr
# 5. Integrity: audit chain + documents, then start the application on it (DATABASE_URL / STORAGE_ROOT).
DATABASE_URL=postgres://kb@localhost:5433/kb node apps/server/dist/cli.js audit-verify
node scripts/backup/check-docs.mjs postgres://kb@localhost:5433/kb
```

The log should show `starting point-in-time recovery to …`, then `recovery stopping before commit of
transaction …`, then `archive recovery complete`.

## 5. Measured drill (2026-10-22, scratch PostgreSQL 16 cluster, 4 vCPU VM)

The drill is scripted: `scripts/backup/pitr-drill.sh init|basebackup|switch|recover|destroy --dir D`. It is
automated end to end with the application in `tests/resilience/pitr.test.ts`, which is skipped (with a message) when
the PostgreSQL server binaries are not installed. The latest automated run took: base backup 1.1 s, WAL switch and
archiving 0.35 s, recovery to T 1.1 s, and 1.6 s until the API was serving from the recovered data.

The first manual run produced:

| Step | Result |
|---|---|
| `pg_basebackup -Ft -z -X stream` of a 4.6 MB cluster | 1.1 s |
| Segment archiving after `pg_switch_wal()` | 4 segments archived, 0 failures |
| Recovery to T (base backup + archived WAL) and promotion | **1.6 s** |
| Rows committed before T | present (markers 1, 2) |
| The "disaster" transaction after T (`update organizations …`, marker 3) | absent; the log shows `recovery stopping before commit of transaction 739` |
| `audit-verify` on the recovered database | `{ ok: true }` |

Recovery time is dominated by WAL volume: replay is roughly 100–300 MB/s on SSD. Plan RTO from
the WAL generated since the base backup; taking base backups more often shortens recovery.
