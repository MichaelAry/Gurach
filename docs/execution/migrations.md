# Migration CLI safety and operation

The server migration commands use `MONGODB_URI` from `server/.env` or the process environment. Never put a URI, credential, password, or token in command arguments. `--database` selects the database on that authenticated Mongo deployment; the tool prints a SHA-256 target fingerprint so a reviewed plan can be compared with a later apply.

`db:audit`, `db:migrate:preflight`, `db:migrate:plan`, and `db:migrate:verify` are read-only. `db:audit` uses estimated collection counts and emits aggregate counts plus a checksum; it does not scan document contents. Reports written with `--report` must be files directly inside `.local/migration-private/`, are created with owner-only permissions, and cannot reuse files from earlier invocations.
An apply invocation reserves its report before writes and replaces that same
private report with its final result. Full before-images are stored only in the target database's migration journal.

Migration commands require explicit `--migration` and `--database` values. The batch size is bounded to 1–1000 and defaults to 100. Apply additionally requires `--apply` and currently accepts only targets named `gurach_test_*`. `--dry-run` previews the same plan without creating a journal or mutating source records. An explicit `--checkpoint` must match the stored checkpoint on apply/verify. Apply uses a lease, per-record before-image journal, expected-old-value compare-and-set, and resumable checkpoints. It does not wrap a full migration in a dataset-sized transaction.

P3.6 installs the framework. P4.3 registers `001-track-lifecycle`: it journals each legacy track before-image, sets only missing `lifecycle` values to `active`, and installs named indexes for track lifecycle pagination and operation/event claiming. Run it explicitly against an isolated restored database before using lifecycle-aware workers. Application Mongoose auto-index creation is disabled; schema index declarations become active through this migration. P5–P7 may register later migrations. No real developer database or existing volume has been migrated.

`npm run maintenance:once` runs one bounded batch of due media cleanup operations and cache-event deliveries using the same lease and retry logic as the server poller. It uses the `MONGODB_URI` target and may remove files under `STATIC_DIR`; confirm the selected database and media root before invoking it. The periodic worker polls every `MAINTENANCE_POLL_INTERVAL_MS` (5 seconds by default). Cache delivery requires the fixed `CACHE_EVENT_URL` and shared `CACHE_EVENT_SECRET`; outage retries are persisted in `cacheevents`.

`npm run media:reconcile -- --database gurach_test_restore --report .local/migration-private/media-audit.json` performs a filesystem/database read-only audit and writes a new owner-only report. It reports active missing media, shared references, allocated keys not published, staging operation ages, temporary publish files and public UUID media older than the 24-hour grace period. Dry-run does not alter media or staging. Apply is isolated-test-only and requires the fingerprint from a reviewed dry-run; it re-audits and moves only still-unreferenced, unchanged candidates to `.local/media-quarantine/` after copy, fsync and hash verification. Each run retains an append-only restore journal plus a summary manifest. Reconciliation never cleans staging directories automatically.

Migration before-images are not generically replayable because that could overwrite later operator changes. The registered `001-track-lifecycle` rollback has a narrow evidence gate: `npm run db:migrate:rollback -- --migration 001-track-lifecycle --database gurach_test_restore --report .local/migration-private/lifecycle-rollback-preview.json` is read-only by default. Review its private report, then use a new report path and the report fingerprint for explicit apply: `npm run db:migrate:rollback -- --migration 001-track-lifecycle --database gurach_test_restore --report .local/migration-private/lifecycle-rollback-apply.json --apply --expected-fingerprint <sha256>`. It only removes the exact `active` lifecycle value written by that migration when all originally referenced media still exists as safe regular UUID files, and skips changed, deleted, or media-missing records. It never sets lifecycle to `active`. Rollback state is terminal for that journal; reapplication requires a separately reviewed fresh migration journal.

Examples after the corresponding migration has been registered:

```sh
npm run db:audit -- --database gurach_test_restore
npm run db:migrate:plan -- --migration 001-track-lifecycle --database gurach_test_restore --batch-size 100
npm run db:migrate:apply -- --migration 001-track-lifecycle --database gurach_test_restore --apply --batch-size 100
npm run db:migrate:verify -- --migration 001-track-lifecycle --database gurach_test_restore
```

Keep migration summaries and target fingerprints with the private run record. Do not copy document-level journal data into tracked reports. Real-data operations remain outside this framework phase and require the backup, restore, writer-freeze, and review gates in `START-HERE.md` and P8 acceptance.

## Social relations

`007-social-relations` installs canonical-pair and active-request unique indexes,
pagination indexes, independent block indexes, persistent request quota indexes,
and the compound username pagination index. It does not backfill or alter users.
It must be applied explicitly before enabling the friends feature; application
startup does not install these indexes. See [friends.md](friends.md) for the
storage contract, transaction requirements and existing runner target restrictions.

### Active track title/artist identity (008)

`008-track-identity` uses NFC, trim, collapsed whitespace and lowercase comparison
keys; a missing artist and an empty artist share the empty string key. Display
metadata and audio are unchanged. Only active tracks participate.

Stop all application, seed and maintenance writers for plan/apply/verify. On an
isolated restore, run the existing plan, apply and verify commands above with
`--migration 008-track-identity` and the restore database name. Planning lists
all duplicate pairs and their track IDs in its error and stops before backfill.
Duplicates require operator resolution; this migration never deletes or hides
tracks and never assigns artificial distinct keys. No automated resolution is
provided. Resume only after reviewing the entire catalogue again.

A successful apply backfills every active track and explicitly creates
`track_active_name_artist_unique`; verify must report zero issues before the
catalogue is considered fully protected. A partial backfill, or an index over
only some keyed records, is not full catalogue protection. `autoIndex` remains
disabled. Each upload checks the actual index name, keys, uniqueness and partial
filter before publishing; missing or incompatible indexes stop uploads. The
prepublication lookup also normalizes unkeyed legacy rows. Publication races
return `409 TRACK_DUPLICATE`, optionally with `existingTrackId`; both staged and
published-file cleanup retain the existing upload lifecycle.

## Staging release and recovery

The ordered release manifest is `migrationDefinitions`: 001, 002, 003, 004,
006, 007-social-relations, 008-track-identity, 009-audio-fingerprint-indexes,
010-notification-indexes, 011-playlist-indexes, 012-controlled-registration. There is no registered 005.
Runtime never applies migrations. Readiness requires every manifest version to
be completed and checks track, comment, maintenance, auth, queue, social, audio, inbox and playlist indexes.
Readiness also checks index options, including session TTL, without scanning
domain data or writing to Mongo.
Deploying runtime before completing the manifest will return 503.

Keep the normal isolated runner unchanged. Staging commands explicitly add
`--staging --database gurach_staging_<name>`. Configure secrets through the
process environment, never CLI arguments: `MIGRATOR_MONGODB_URI` authenticates a
separate database-scoped migration user, `GURACH_MIGRATOR_USER` confirms its name,
and `GURACH_STAGING_DATABASE` confirms the database. The normal `MONGODB_URI`
continues to identify the distinct runtime account. Grant migrator readWrite
and dbAdmin on this staging database only; do not grant cluster or production
roles. Runtime needs reads of migration state and index metadata, not DDL rights.

Preflight: run `db:audit` and each `db:migrate:plan` with `--staging`, a fresh
`--report .local/migration-private/<release>-<id>-plan.json`, and the explicit
database. Verify writable replica-set connectivity, authenticated identity,
backup inventory, free space and all plan conflicts before approving writes.
Review target fingerprint with the deployment inventory; fingerprint is target
identity evidence, not a substitute for checking the URI/host and credentials.
Staging apply additionally requires `--expected-fingerprint <reviewed sha256>`
and `GURACH_STAGING_WRITERS_STOPPED` set to that fingerprint. Each apply requires
a fresh private report path, reserved before writes; a started-only report means
interruption/failure and must be investigated against the Mongo journal.
Predecessor versions, fingerprint and verification are checked before each apply.
Run `db:migrate:preflight`, apply and verify for each manifest entry in order.
Preflight checks completed predecessor versions/fingerprints and their domain
verification, then scans the selected remaining plan without writes. Run it
after completing predecessors: for example, 003 cannot be planned on an
unreconciled 002 dataset. Apply repeats this preflight before reserving its
private report and before the first database write. Staging read commands also
require explicit database and fresh private report paths. Staging verify
requires completed schema state; any nonzero `issueCount` produces exit code 1
after saving its report, so release automation must stop on command failure.
Retain reports and `_gurach_migration_state` / `_gurach_migration_journal`.
Never reuse a report path or edit journal checkpoints to bypass a failure.

Example from the repository root (secrets already exported through the deployment
secret store; use a new report filename for every invocation):

```sh
cd server
npm run db:audit -- --staging --database "$GURACH_STAGING_DATABASE" --report .local/migration-private/release-audit.json
npm run db:migrate:preflight -- --staging --database "$GURACH_STAGING_DATABASE" --migration 001-track-lifecycle --report .local/migration-private/release-001-preflight.json
# Review the report and inventory, stop writers, and export the reviewed fingerprint.
npm run db:migrate:apply -- --staging --database "$GURACH_STAGING_DATABASE" --migration 001-track-lifecycle --apply --expected-fingerprint "$GURACH_STAGING_WRITERS_STOPPED" --report .local/migration-private/release-001-apply.json
npm run db:migrate:verify -- --staging --database "$GURACH_STAGING_DATABASE" --migration 001-track-lifecycle --report .local/migration-private/release-001-verify.json
```

Before backup or apply, disable ingress mutations and stop all API writers,
uploads, queue sync, social/inbox/playlist writes, seeders, maintenance pollers
and cache-event workers. Drain in-flight operations. Keep writes stopped until
verification and HTTPS smoke checks finish. Take a consistent Mongo backup with
replica-set metadata and matching snapshots of both STATIC_DIR and
MEDIA_STAGING_DIR (which may be outside STATIC_DIR); record checksums, timestamps, storage locations and the application commit.
Encrypt backups, restrict access, and verify restore credentials separately.
Do not treat an estimated-count audit as a backup consistency proof.

Rehearse against an isolated restored copy and separate media directory with
outbound deliveries disabled. Restore both snapshots, run the full ordered
plan/apply/verify sequence, then start the release behind HTTPS. Check live and
ready, login/cookies, catalogue/media playback, queue persistence, friends,
private inbox and private/link playlists. Remove a critical index on the copy
and confirm ready becomes 503; recover through the explicit migration workflow.
Record actual commands, fingerprints, checksums and results privately.

Recovery: keep writers frozen, preserve failure reports and journals, and first
attempt the documented resumable apply only after resolving conflicts. Generic
rollback is not supported. For a failed release restore the matching Mongo AND
media snapshots into a new isolated target, verify checksums and rehearse the
previous application version before switching staging traffic. Never restore
one half of the pair or overwrite later writes without a reviewed data-loss
window. The narrow 001 rollback evidence gate remains available; it is not a
release-wide recovery strategy. This workflow authorizes no production migration
or restoration.

### Verification performed for this release workflow

On 2026-11-16, an ephemeral authenticated Mongo replica set was provisioned
using the existing isolated runner bootstrap. A new empty staging database and
a separate database-scoped readWrite/dbAdmin migrator were used. All ten
registered migrations passed plan/apply/verify in manifest order; incorrect
fingerprints were rejected. The real HealthController was served through a
local HTTPS harness: readiness returned 200, then 503 after dropping
`playlist_owner`, then 200 after explicit index recovery. The existing HTTPS
production-cookie browser check also passed against its API fixture.
This was an empty-database rehearsal, not a restore of production data or media;
backup restoration and a full application HTTPS smoke against restored data
remain operator acceptance steps before a real staging release.

On 2026-11-17, the follow-up rehearsal used another disposable authenticated
replica set with a synthetic legacy track, reverse comment reference and media
file. `mongodump`/`mongorestore` restored that fixture into a separate staging
database; independent public-media and staging-directory copies were restored
and checked against their original contents/hash. All ten migrations passed
preflight/apply/verify in order. Wrong fingerprints, missing writer-freeze
confirmation, runtime-account migration attempts, incomplete predecessors and
verification without completed state were rejected. Preflight left migration
state unchanged. HTTPS probes trusted the generated local certificate and used
a read-only runtime Mongo account: readiness returned 200, returned 503 for a
missing playlist/comment index or wrong schema version, and returned 200 after
explicit recovery. CLI verify returned nonzero for the missing playlist index.
This checks synthetic backup/restore and the real readiness controller through
an HTTPS harness; it does not establish production-data recovery, browser login,
playback or a full deployed application smoke test.

For task 22 and later, `MEDIA_STAGING_DIR` also retains private original audio
and covers for published background jobs. It must be backed up and restored with
Mongo and `STATIC_DIR`; see [background-media.md](../implementation/background-media.md)
for job recovery, quota accounting, rollback compatibility and proxy checks.
