# P4 — validated media and recoverable lifecycle

Prerequisites: P2 replica set/tools and P3 contracts/migration utility. Follow master plan P4 behavior. Do not mix filesystem side effects into retried Mongo callbacks.

## P4.1 Policy, staging and probe interfaces

Add file/file-policy.ts, file/media-validator.service.ts and file/staging.service.ts. Primary implementation defaults: file-type for signature recognition, sharp for bounded image decode/metadata and a system ffprobe executable for audio metadata. Add dependencies directly to server (never rely on transitive Next dependencies), pin compatible versions and verify primary docs/fixtures before adopting APIs. FFprobe is a documented system/CI prerequisite, configurable by an explicit executable path.

Policies: audio <=50 MiB, cover <=10 MiB, cover <=40 million pixels, 2 files/request, bounded fields/body text. Audio extensions: mp3/wav/ogg/oga/m4a/aac/flac; covers jpg/jpeg/png/webp/avif/gif. Canonicalize aliases, inspect signature/container/stream information and require allowed media kinds. Reject extension/content mismatch, truncation, zero-length data and decode failure. MIME header alone proves nothing. Do not reject valid files merely because a library lacks a detector: implement a documented format-specific bounded check or explicitly fail that unsupported format and update the contract/UI together.

`ffprobe` is a required system executable. Set `FFPROBE_PATH` when it is not on `PATH`; CI installs the FFmpeg package. The process is launched with an argument array, `shell:false`, a local file path, JSON output, `-protocol_whitelist file`, bounded analyze/probe sizes, a 10-second timeout, and a 1 MiB stdout ceiling. Do not add `pipe`, network protocols or caller-controlled probe arguments. `MEDIA_STAGING_DIR` defaults to `server/.local/media-staging` and must resolve outside `STATIC_DIR`; the staging root and per-operation directory are owner-only.

Use 2 concurrent media probes initially, <=10 seconds each and <=1 MiB captured output; kill timed-out child processes and collect exit errors. ffprobe uses spawn/execFile argument arrays with a local file path, JSON output and bounded analyze settings; no shell and no media-provided URLs. Disable remote-protocol access where supported; test malformed playlists/embedded external references. Obtain finite duration from validated audio streams; client duration is non-authoritative.

Gate: format matrix valid fixtures and malformed/mismatched/oversized fixtures behave correctly, including AAC/OGG/container edge cases and animated images' decoding limits. Fixture files are synthetic and licensed/created for tests.

## P4.2 Multipart reception and disk adapter

Replace the memory buffer reception in TrackController with private disk staging through the FileModule adapter. Reserve the upload operation ID before accepting body writes. Stage outside ServeStaticModule root, under an operation-specific directory; maintain root/name validation, non-followed symlinks and exclusive file creation. Define stage/validate/publish/remove methods and one error-cleanup owner.

Enforce file sizes/count/field limits while receiving; abort oversized bodies and register partial staging cleanup durably. Apply pre-body concurrency admission; a rejected request must not first buffer its full payload. Use a same-filesystem private staging root for atomic local renames or an explicit copy+fsync+rename protocol if configured elsewhere. Do not expose staging via /static.

Gate: request abort, Multer error, disk full/permission failure and repeated cleanup leave no unowned permanent artifact. Existing approved UUID static URLs still resolve.

## P4.3 Persistent operation model and migrations

Choose the separate-intent design so incomplete uploads do not require invalid Track placeholders. Create maintenance/schemas/media-operation.schema.ts and cache-event.schema.ts; keep Track lifecycle active/deleting/deleted. MediaOperation handles uploading/publishing/cleanup/done and reserves future trackId, media keys and validated metadata.

Fields: operationId, kind, trackId, allocated audio/picture keys, stage location relative to private root, state, leaseOwner/token, leaseUntil, attempts, nextAttemptAt, lastErrorCode, createdAt/updatedAt. OwnerId can be null until P6; normal auth writes later set it. Store no arbitrary absolute file paths supplied by callers.

CacheEvent is a separate outbox model with a fixed event type, trackId, pending/delivered state, retry fields and lease fields. Track lifecycle defaults new records to `active`; legacy records are migrated explicitly. Keep Mongoose `autoIndex` disabled and install named schema indexes through the migration CLI, including the operation/event claim indexes and `{ lifecycle: 1, _id: 1 }` only after checking the intended query with `explain`.

Add migration `001-track-lifecycle`: audit refs, backfill missing lifecycle to active without changing filenames/IDs, preserve before-images. Add explicit claim/query indexes and {lifecycle:1,_id:1} after explain evidence. Disable reliance on automatic index sync in normal production startup.

Gate: migration dry run/apply/resume/second no-op pass on restored fixtures; legacy missing optional audio remains a readable unavailable record rather than data loss.

## P4.4 Upload commit protocol

Persist intent/all allocated keys before file publication. Validate staged files; publish them to allocated UUID keys. In a Mongo transaction: insert the complete active Track, mark the owned operation completed and insert its activation cache event. Compare expected operation state/lease token to fence a stale publisher. No rename/probe/network request in this transaction.

If commit fails, keep/transition intent to cleanup with retry metadata. If a crash happens after publication but before activation, maintenance finds allocated keys. If the HTTP response is lost after commit, the record remains valid; do not automatically retry non-idempotent create as a second upload. Include operation identity in errors/diagnostics without leaking paths.

Gate: fault injection after each published file and before/after commit converges to either one complete active track or recoverable cleanup, never a partial active track.

The HTTP path allocates the track ObjectId and UUID media keys before writing a `uploading` MediaOperation with validated audio/image metadata and a stage directory relative to `MEDIA_STAGING_DIR`. It CAS-transitions that intent to `publishing` with a random lease token, publishes to the preallocated keys, then uses a Mongo transaction containing only DB writes: insert the active Track, mark the matching operation `done`, and insert its `track.activated` CacheEvent. The final update must match operation ID, state and lease token. If publication or transaction fails, transition the intent to `cleanup` with a stable error code and retry timestamp; do not unlink possibly published files in the request path. A retry after a lost HTTP response is not automatically issued by the server.

## P4.5 Delete and worker protocol

In a Mongo transaction mark Track deleting and create/reuse its cleanup operation plus deletion cache event. Retry DELETE returns the same known operation, including a deleted tombstone. Unknown ID ->404, accepted->202. Get/list/search/listen/comment-creation paths require active state (legacy fallback only during migration).

MaintenanceService runs periodically (initial 5-second poll) and also exposes the same run-once CLI path. Claim with atomic state/due/expired-lease query, random lease token, 30-second lease and heartbeat for long work; only current owner may advance state. Drain/stop on application shutdown. Backoff starts at 5 seconds, doubles to 5-minute cap and remains retryable with visible attempts/error state.

Cleanup deletes comments, removes allocated media only when not referenced by another active record/pending intent, and marks tombstone/operation completed. ENOENT succeeds; permissions/I/O failures remain pending. A legacy shared filename must not be removed while another live record needs it. Tombstones and unfinished operations have no automatic TTL deletion.

Expired publishers can perform late disk actions despite a Mongo fence, so reconciliation remains necessary: track every allocated key, periodically revisit keys of failed/deleted operations and never claim disk+DB atomicity. Stale workers cannot mark another worker's operation complete.

Gate: restart after tombstone/comment unlink/first media unlink recovers; two workers do not both finalize; repeated deletion does not lose refs; all-unavailable/active query paths agree.

`DELETE /tracks/:id` returns 202 with the stable operation ID. One Mongo transaction changes `active` to `deleting`, inserts/reuses a delete MediaOperation and writes the `track.deleted` outbox event. Repeated DELETE returns that operation, including for tombstones; unknown IDs remain 404. The maintenance worker claims due cleanup intents with an atomic lease/token, heartbeats during long work, removes comments idempotently, removes media only when no active track or in-flight upload references its key, and commits `deleted` plus operation `done` in a short DB transaction. Failures retain the tombstone and use 5-second exponential backoff capped at 5 minutes. Shutdown stops polling and waits for the active batch. `npm run maintenance:once` invokes the same bounded run-once code path as the periodic worker. Unsafe legacy media names are never passed to filesystem operations and are left for P4.7 reconciliation.

## P4.6 Cache event delivery

Add a durable event dispatcher to maintenance and client/app/api/internal/cache-events/route.ts. Events contain fixed type/id/trackId; Next derives allowed tags and does not accept arbitrary URLs/tags from callers. Use bounded requests, a shared random secret provisioned privately into both envs, constant-time secret comparison and no token in query strings/logs. Duplicate delivery is harmless.

Persist event atomically with activation/deletion above, then deliver asynchronously and mark sent only after acknowledgement. Retry outages. Configure a fixed internal callback URL from env, never from event content. In installed Next docs choose a hard tag-expiration API for deletion (e.g. revalidateTag with expire:0 if supported); add integration proof, not a guessed call signature. Activation invalidates catalogue/detail appropriately.

The server sends only `{ eventId, type, trackId }` to the fixed `CACHE_EVENT_URL` with a shared `CACHE_EVENT_SECRET` header; no token appears in URL, body, logs or response. The Next POST handler enforces a 4 KiB streaming body cap, exact object shape, known event types/ObjectIds and an `eventId` derived from the event type. It compares fixed-size secret digests with `timingSafeEqual`, derives tags itself, and uses the installed Next 16.4.5 `revalidateTag(tag, { expire: 0 })` API. Activation expires `tracks` and `track:<id>`; deletion additionally expires `track-comments:<id>`. It returns 202 after revalidation is accepted, so duplicate deliveries remain harmless. Production server configuration requires both endpoint and 32–256 URL-safe secret; generate one secret and provision it privately into both apps.

Gate: crash before/after callback and callback timeout are replayable; a callback with wrong secret/shape is rejected; public cached deleted data is evicted after successful delivery. Document the bounded eventual-consistency window while callback is down.

## P4.7 Reconciliation and CLI

Extend the migration CLI with a media audit and new `maintenance:once` command. Add private reconciliation report/dry-run for staging age, allocated-but-unpublished files, public orphans, shared keys and active missing media. Initial orphan grace: 24 hours. Quarantine uncertain files; never mass-unlink based on a single directory scan.

Dry-run is default for orphan actions; explicit apply identifies isolated/root target and private report. Respect leases/pending intents and no-path-traversal protections. Quarantine itself preserves metadata sufficient for manual restore. Migration rollback restores metadata only with matching file evidence; do not reactivate records whose media was intentionally deleted.

Gate: live upload is never swept just for being old; stale intent reclaims safely; dry-run performs no filesystem mutation; ambiguous/shared files remain protected.

Implementation: `npm run media:reconcile -- --database gurach_test_<name> --report .local/migration-private/media-audit.json` writes a private read-only report (report path must be new). It inventories active missing media, duplicate active keys, non-done operations and staging directories, and only lists UUID-named public files older than 24 hours with no active or pending-operation reference. It does not modify staging or database state. Apply is restricted to isolated `gurach_test_*` databases and requires the fingerprint from the reviewed report: `npm run media:reconcile -- --database gurach_test_<name> --report .local/migration-private/media-apply.json --apply --expected-fingerprint <sha256>`. Apply recomputes inventory, rechecks each file's references and identity immediately before quarantine, copies with no-follow/exclusive handles, fsyncs and compares SHA-256 before unlinking the source. Quarantine lives in owner-only `.local/media-quarantine/<run-id>/` with a restore manifest. Keep the original dry-run report; use a fresh report path for each invocation. `maintenance:once` remains the worker's run-once path from P4.5.

`db:migrate:rollback` is intentionally limited to registered migrations with an evidence callback. For `001-track-lifecycle`, it restores only the original absence of `lifecycle`, only while the current value still equals the migration's `active` value and every originally referenced media file is a safe regular UUID file present on disk. Changed/deleted records and missing/unsafe media are skipped with reason counts. The rollback never sets lifecycle to `active`; deleted tombstones remain deleted. Journal records and migration state are marked rolled back, and the old migration cannot be reapplied from that journal.

## P4.8 Verification and checkpoint

Add unit tests for policy/probe/parser/path checks and replica-set integration tests for commit/recovery/cache events. Use fault injection hooks supplied only by test setup, not a public request bypass. Browser smoke verifies valid media metadata, Range/206 seeking and inaccessible private staging.

Run lint/typecheck/build/test/contracts drift plus real lifecycle tests. Update ffprobe/system requirements, policies, lifecycle/maintenance commands and backup/restore docs. Do not apply to original developer data unless P0 recovery and migration gates pass.
