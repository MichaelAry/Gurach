# P5 — independent comments and safe relationship migration

Prerequisites: P3 migration/contracts and P4 lifecycle/maintenance. Continue using the master plan's one-way relationship and quarantine policy.

## P5.1 Audit and reconciliation rules

Implement migration `002-comment-parents` with dry-run classification of every comment and reverse reference. Valid comment.track_id pointing to an existing track is authoritative, even if an old Track.comments array disagrees. If the parent is invalid/missing, repair only when exactly one valid track reverse array references it. Multiple/no candidates are unresolved.

Store full before-images/reasons privately/in journal. Copy unresolved rows reversibly to comment_quarantine (unique original ID+migration ID), verify copies and mark them excluded from active reads. Never drop text/rating/username/timestamps or invent authors from usernames. Log counts and checksums, not private comment text.

Gate: fixtures cover every rule, conflicts are reproducible and dry-run mutates nothing. Unresolved destructive-contract work is blocked, not guessed.

Implementation note: `002-comment-parents` classifies every comment and every legacy `Track.comments` reference in a private `--report`. The stdout summary contains only counts and checksums. A valid `track_id` pointing to an existing track wins over all reverse-array disagreements; canonical string ObjectIds are normalized to BSON ObjectIds so the existing query can find them. A missing/invalid parent is repaired only when exactly one existing track reverse array references the comment. No candidate or multiple candidates are unresolved: the migration journals their full before-image, writes a quarantine marker/reason to the source comment, copies the before-image into `comment_quarantine`, and verifies the copy checksum. Normal comment reads and individual comment deletes exclude marked rows. No comment is deleted, and text, username, rating and timestamps are copied without modification. The quarantine collection has a unique `{ migrationId, originalId }` index.

Preview on an isolated clone with `npm run db:migrate:plan -- --migration 002-comment-parents --database gurach_test_restore --report .local/migration-private/comment-parents-plan.json`; inspect the private per-record classifications and aggregate checksums. Apply on an isolated fixture requires a new private report path and explicit `--apply`: `npm run db:migrate:apply -- --migration 002-comment-parents --database gurach_test_restore --report .local/migration-private/comment-parents-apply.json --apply`. The migration is resumable through P3 journal checkpoints; final quarantine copying is idempotent and verifies each stored copy before completion. Do not apply to original data until the P0 restore and P5 writer-freeze gates are satisfied.

P5.2 implementation: the Mongoose model now lives at `server/src/comment/schemas/comment.schema.ts`; `TrackModule` and `MaintenanceModule` register that same model without a reverse module dependency. Migration 002 installs and verifies `{ track_id: 1, _id: 1 }` and the unique quarantine index. The marker remains hidden from normal projections and is included in comment list/delete predicates while unresolved rows remain in `comments`.

`npm run test:isolated` now interrupts the migration after its first journaled source update, resumes it, verifies the result and proves a second apply is a no-op. Before applying, it also `mongodump`s the `tracks` and `comments` fixtures from the disposable Mongo container and restores them into a second isolated test DB. It checks counts and confirms unknown timestamps remain absent. The backup config contains only synthetic disposable-root credentials in a mode-0600 temporary file; no live or dev database is used.

## P5.2 Expand schema, index and tools

Move/copy comment schema to comment/schemas/comment.schema.ts. Keep stored track_id, nullable authorId and display username. Legacy createdAt/updatedAt remain absent/null if unknown. Add {track_id:1,_id:1}; include a quarantine marker filter if unresolved records remain in the main collection.

Implement resumable apply/verify using P3 journal, expected-old predicates, bounded batches and explicit target DB. Rehearse backup restore, interruption/resume and second no-op on isolated real-shaped data. Do not apply the irreversible contract removal with writers running.

Gate: no active resolved comment has an invalid parent, no document unexpectedly disappears and all unresolved records are preserved for review.

## P5.3 Module and API extraction

Create comment.module.ts, comment.controller.ts, comment.service.ts, dto/, mappers/. TrackModule exports a narrow TrackAccessService for active-parent operations; CommentModule imports it; TrackService never imports CommentModule back. Maintenance uses its own model registration for cleanup, not a circular feature dependency.

Endpoints: GET/POST /tracks/:trackId/comments and DELETE /comments/:commentId. GET has count/cursor, returns CursorPage<CommentResponse> and scopes cursor to trackId. Inactive/missing parent->404; malformed ID->400; rating optional integer 1..10; required text rejects whitespace. Username remains transitional until P6 replaces it with session identity.

Gate: actual serialized responses match P3 schema; reads bounded to 100, defaults 20; no reverse-array mutation from new methods.

## P5.4 Transactional creation and delete ordering

In a Mongo transaction, conditionally update the active Track's commentWriteRevision and insert the comment using the same session. This parent write conflicts with P4 delete-state transition. Only bounded transient transaction retries; no HTTP/cache/file actions inside retry callback.

If delete wins, no active comment is inserted; if create wins, later maintenance deletes it. Individual comment removal operates on comment ID and respects lifecycle, using a consistent missing-resource policy. P6 adds actor permission checks without bypassing these state predicates.

Gate: concurrent integration tests with real replica set repeatedly race create vs delete; after maintenance no active orphan survives. Reading an active parent in a transaction alone is not sufficient implementation.

## P5.5 Client and BFF

Add app/api/tracks/[id]/comments/route.ts and app/api/comments/[id]/route.ts. Forward only DTO fields/approved headers and retain errors. Add features/comments/api/getCommentsPage.ts, components/CommentsSection.tsx and useCommentPages.ts.

Detail page renders track data and an independent comment first page/loading/error state. More comments append by ID with scoped cursor and stale-request protection. Do not render a first-page size as total. Anonymous read remains usable after P6. Keep authoring placeholder clearly nonfunctional or implement a separate real form only if within authorized scope; do not wire a button to a fake successful POST.

Gate: multiple comment pages, missing timestamp, no comments and upstream failure all render correctly; page retries do not duplicate entries.

## P5.6 Switch and contract migration

Freeze all app/seed/maintenance writers for real-data apply; test on clone first. Switch all runtime reads/writes to the new service, remove old comments routes/callers and track $push/$pull/populate. Search/list/detail no longer depend on reverse arrays.

Implement migration `003-remove-track-comment-arrays`: remove schema field/default first, verify reconciliation completed or unresolved rows safely quarantined with no data-loss ambiguity, journal old arrays and unset them in batches. No old binary/script may run after writers reopen. Regenerate contracts and update all client types/imports in this same bounded change.

Gate: rg finds no runtime Track.comments updates/population, second migration run no-ops and all preserved comment counts reconcile across active+quarantine.

## P5.7 Verification and rollback record

Run API/schema/browser/concurrency tests plus migration restore/resume tests. Document the no-new-writes rollback window: before writers reopen, restore before-images and matching code; after reopening, forward repair or rebuild reverse arrays under another freeze, not a raw stale snapshot restore.

Record actual target/apply status. If original data is unavailable, tests on isolated fixtures may pass but original apply remains explicitly unapplied. Do not conflate implementation complete with developer dataset migrated.

## P5.3 execution record

Comment routes and persistence moved into `CommentModule` / `CommentService`; `TrackModule` exports only `TrackAccessService`, and `TrackService` no longer injects or reads the Comment model. Maintenance continues registering Comment independently. The new routes are `GET/POST /tracks/:trackId/comments` and `DELETE /comments/:commentId`. Reads validate an active parent, scope cursors to the parent, cap page sizes at 100 and exclude quarantine-marked rows. Comment creation and deletion no longer write `Track.comments`.

The old `GET /tracks/comments?trackId=...` alias was retired early because it is shadowed by `GET /tracks/:id` under Nest's route registration order. To preserve functionality without a circular TrackModule ↔ CommentModule dependency, the server-side client fetch now uses the resource route. Legacy POST and DELETE aliases remain temporarily. P5.4 will replace the remaining nontransactional create/delete ordering with the parent revision transaction protocol.

Verification on 2026-11-08: `npm run test:isolated` passed (5 files / 28 tests); server typecheck, lint, build, OpenAPI generation, contract synchronization and `git diff --check` passed. The host-only unit run still lacks `ffmpeg`; isolated integration coverage is green.

## P5.4 execution record

`Track.commentWriteRevision` now provides the shared write point. Comment creation conditionally increments it on an active Track and inserts the Comment in one snapshot/majority transaction. Track deletion already changes `lifecycle` inside a transaction on that same Track document, so MongoDB write conflicts serialize the operations: a deletion that wins makes the comment write return 404; a comment transaction that commits first is later removed by deletion maintenance. Individual comment deletion uses the same parent lifecycle/revision guard.

Comment transactions retry only `TransientTransactionError`, with a maximum of three transaction attempts. Unknown commit results retry commit on the same transaction up to three times. HTTP, cache callbacks and filesystem work are outside transaction callbacks. A disposable replica-set integration test raced create against delete three times and verified maintenance left no comment on the deleting/deleted parent.

Verification on 2026-11-08: isolated integration tests passed (5 files / 29 tests), along with typecheck, lint, build, contract synchronization and diff checks. No original database was changed.

## P5.5 execution record

Added BFF routes for `GET/POST /api/tracks/:id/comments` and `DELETE /api/comments/:id`. The read route forwards only `count` and `cursor`; create forwards only `username`, `text` and `rating`. The client detail page no longer waits for comments during server rendering: `CommentsSection` loads independently and supports cursor pages, request cancellation, stale-response protection, retry, and ID-based deduplication. Missing timestamps render as “Дата неизвестна”. The authoring button remains disabled and does not pretend to submit a comment.

Verification on 2026-11-08: client typecheck, lint, 22 unit tests, API contract check and optimized production build passed. Playwright in the project’s Docker image passed all three browser tests: comment pagination and retry without duplicates, empty/upstream-error states while track content remains visible, and the existing catalogue journey. The host browser lacked `libnspr4.so`, so browser tests used Docker; the test build/result directories were isolated from existing local artifacts.

## P5.6 contract migration and operating procedure

Runtime schema and maintenance no longer write Track.comments; legacy comment endpoints have been removed and OpenAPI/client types regenerated. Migration 003 verifies reconciliation 002 before each batch, journals complete track before-images, and unsets arrays with expected-old predicates. The runner now supports updates containing only unsets.

For original-data application: stop every application, seed and maintenance writer; take and restore-check a backup; apply/verify 002 then plan/apply/verify 003 against the explicitly named database. Deploy the matching code before reopening writers. No old binary or script may restart afterward. The original developer dataset remains unapplied.

Rollback is limited to the frozen no-new-writes window. Migration 003 permits restoring an array only when the rest of the track still matches its before-image exactly. After writers reopen, use forward repair or rebuild relations under a new freeze rather than restoring stale arrays. The isolated rehearsal checks interruption after CAS, resume, preservation of comment rows, a second no-op apply, rollback preview and exact before-image restoration.

## P5.7 final verification record (2026-11-08)

| Evidence | Result | Environment |
| --- | --- | --- |
| API, parent lifecycle, three create/delete races, migration backup/restore/resume and no-op | 30 tests passed in P5.6; unchanged implementation reused | Disposable Mongo replica set |
| Full server unit suite including media validators | 102 passed | Disposable Playwright container with FFmpeg |
| Rollback refusal after revision/lifecycle changes | 1 passed | Host Vitest |
| Client/BFF unit suite | 22 passed | Host Vitest |
| Pagination, failed continuation retry, unknown date, empty/error states and catalogue | 3 passed | Playwright Docker, current code |
| Server/client typecheck and lint, OpenAPI drift | Passed | Host |

Code verification is complete. Original/developer database application of migrations 002 and 003 is **UNAPPLIED**. Only generated disposable test databases were written. A successful rehearsal does not certify migration of existing developer data.

Before reopening writers, rollback requires restoring 003 before-images using the journal's read-only preview, reviewed target fingerprint and explicit apply, plus deploying the matching older code. Restore 003 before considering any earlier migration rollback. The 003 evidence callback refuses records changed since array removal, including comment revisions and lifecycle transitions. This is an additional guard, not proof that all writers were stopped: the operator must enforce the freeze. After any new writes, use forward repair or reconstruct arrays from current authoritative comment parents under another freeze. Do not replay a stale database snapshot or reopen old writers against the contracted schema.
