# Migration CLI safety and operation

The server migration commands use `MONGODB_URI` from `server/.env` or the process environment. Never put a URI, credential, password, or token in command arguments. `--database` selects the database on that authenticated Mongo deployment; the tool prints a SHA-256 target fingerprint so a reviewed plan can be compared with a later apply.

`db:audit`, `db:migrate:plan`, and `db:migrate:verify` are read-only. `db:audit` uses estimated collection counts and emits aggregate counts plus a checksum; it does not scan document contents. Reports written with `--report` must be files directly inside `.local/migration-private/`, are created with owner-only permissions, and are never overwritten. Full before-images are stored only in the target database's migration journal.

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
