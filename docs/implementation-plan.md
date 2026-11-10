# Gurach implementation plan

Date: 2026-11-08. Status: proposed implementation sequence; application is pre-production.

Execution entry point: [docs/execution/START-HERE.md](execution/START-HERE.md). It supplies ordered implementation steps for P0–P8, exact completion gates and a resumable progress ledger. Use this document for architecture and behavior; use the execution files to perform the work.

This document covers the seven agreed tasks. It defines implementation work; it does not report that the work has already been completed. The existing fixes and their verification are recorded in [architecture-review.md](architecture-review.md). This document supersedes that review's earlier task ordering and uses the agreed pre-production priorities.

## 1. Execution order and dependencies

| Order | Work package | Result | Depends on |
|---|---|---|---|
| P0 | Baseline and recovery preparation | Known starting point and recoverable data | None |
| P1 | Catalogue pagination | Every track is reachable with bounded requests | P0 |
| P2 | Dependencies and local configuration | Clean installation, predictable startup and CI | P0; integrate after P1 |
| P3 | API contracts and generated client types | Explicit transport contracts across all endpoints | P1, P2 |
| P4 | File validation and recoverable lifecycle | Validated uploads and repeatable cleanup | P2, P3 |
| P5 | Comment storage and migration | One authoritative relationship and bounded reads | P3, P4 |
| P6 | Authentication and ownership enforcement | Enforced permissions and usable login | P2–P5 |
| P7 | Playback queue: API, persistence, player and UI | Complete queue management with at most 100 entries | P1, P3, P4, P6 |
| P8 | Integrated acceptance | All seven changes work together | P1–P7 |

P1 includes the minimum response type and mapper needed for pagination; P3 generalizes those foundations. P3 defines nullable ownership fields; P5 carries them through migration; P6 enforces them. P2 includes the transaction-capable development database required by P5. P7 is a separate queue feature: catalogue pagination never raises the queue capacity above 100. P6 supplies account identity for persistent private queues; guest queues remain usable locally. Integration gates are sequential even when investigations can be independent.

If P0 cannot run the applications, repair the specific P2 startup blocker first, then return to P1. Do not implement pagination against an installation whose behavior cannot be reproduced.

Each work package should be independently reviewable and have a passing checkpoint. No existing Mongo volume or media directory is discarded to make a checkpoint pass.

## 2. Architecture decisions

- Keep two deployable applications and the current npm layout: `client/` and `server/`, each with its own package.json and lockfile. No workspace conversion is required.
- Next owns presentation, request-time rendering, feature caches and browser-facing route handlers. Nest owns validation, permissions, application operations and persistence.
- Keep MongoDB and local disk storage. Introduce a small persistent maintenance process in Nest for lifecycle recovery; Redis, a broker and separate services are unnecessary for this scope.
- Controllers validate transport inputs; services implement operations; response mappers produce API DTOs. Mongo/Mongoose types stay inside Nest.
- Use cursor pagination ordered by ascending `_id`; default page size 20, maximum 100. Keep the existing `count` query name to minimize churn; replace `offset` in the canonical API with `cursor`.
- All seven changes can update client and server together because there are no established production consumers. Avoid indefinite compatibility adapters. Confirm scripts/external development callers in P0 before removing an old shape.
- Preserve public identifier spelling `_id`, and public media fields `audio`/`picture`, throughout this plan. Preserve `lyrics` in the read API and legacy `text` in the track write DTO initially. Database field renames are not needed.
- Treat media as public. Authentication protects creation/deletion; it does not imply private audio URLs.
- Preserve existing records. Legacy tracks/comments have nullable owner/author references and remain readable. No ownership is inferred from a display name.
- A playback queue contains 0–100 ordered entries, including repeated occurrences of the same track. Catalogue size and page size are independent of this limit. Account queues persist in MongoDB; anonymous queues persist locally in the browser. Playback time and the audio element remain device-local.

Proposed final structure, introducing files only when their work package needs them:

```text
server/src/
  auth/                  # P6: users, sessions, guards, permission checks
  common/                # env, HTTP errors, request IDs, cursor codec
  contracts/             # shared API pagination/error response DTOs
  track/
    dto/ schemas/ mappers/
    track.controller.ts
    track.service.ts
  queue/                 # P7: private queue DTOs/schema/controller/service
  comment/               # P5: independent DTOs/schema/controller/service
  file/                  # validation and disk operations
  maintenance/           # P4: recover uploads and retry deletions
server/scripts/          # audits, migrations, reconciliation, bootstrap user
server/openapi.json      # deterministic generated transport schema
client/
  app/                   # layouts, routes and thin page composition
  features/tracks/       # list/detail presentation and data access
  features/comments/     # P5: bounded comment reading
  features/auth/         # P6: login and session UI
  features/player/       # audio engine, selection, progress and transport
  features/queue/        # P7: commands, persistence, panel and synchronization
  lib/server/            # backend transport and P6 authenticated BFF helpers
  lib/api/schema.d.ts     # generated; never edited manually
```

Moving player files is optional during P1: change the queue behavior first and avoid an unrelated import-renaming diff. A repository abstraction over every Mongoose query is not part of the design.

## 3. P0 — establish the baseline

### Work

1. Record the existing dirty tree, including untracked source files, deleted root manifests, dependency modifications and generated files. Keep a machine-readable inventory outside secret-bearing env files.
2. Capture dependency patch diffs before installation or Git cleanup. Identify which physical `node_modules` each application actually resolves. A root dependency patch may be irrelevant to the package-local installation; verify rather than copying it blindly.
3. Record Node/npm versions, package lock versions, Nest/Next start commands, Mongo image version and database topology. Redact credential-bearing URLs.
4. Inventory actual collections and media: document counts, missing fields, invalid IDs/references, duplicate filenames, orphan comments and files referenced by multiple records. README sample counts are not evidence of current database contents.
5. Create a database dump and media backup, then restore them into an isolated database and directory. Verify counts and selected audio/cover checksums after restore.
6. Run existing lint, typecheck, tests and builds. Check current API shapes using representative existing data. Investigate the previously observed Turbopack failure in the current environment; do not assume it still occurs.
7. Identify every caller of `getTracks`, `ITrack`, `/tracks`, search, comments and `FileService`, including `server/seed.sh`.

### Exit gate

There is a recorded baseline, recoverable data and a list of existing failures distinguished from new regressions. No dependency patch or user modification is lost. All later tests use an isolated database and media root.

## 4. P1 — catalogue pagination

### Target behavior

`GET /tracks?count=20&cursor=<opaque>` returns a bounded page:

```ts
type PlayableTrack = {
  _id: string
  name: string
  artist: string | null
  audio: string | null
  picture: string | null
  duration: number | null
}

type TrackListItem = PlayableTrack & { listens: number }
type CursorPage<T> = { items: T[]; nextCursor: string | null }
```

No comments or lyrics are included in list items. A valid empty result is `{ items: [], nextCursor: null }`. The end of a nonempty final page also has `nextCursor: null`. No total count is required by the proposed load-more UI.

### Server work

1. Add a query DTO for `count` and `cursor`. Parse decimal count explicitly; reject fractions, repeated values, empty values, NaN and values outside 1–100. The default applies only when the parameter is absent.
2. Define a bounded cursor codec containing `{ v: 1, after: <24-hex ID> }`. Base64url is encoding, not authorization. Reject oversized input before decoding, malformed JSON, unsupported versions and unexpected fields.
3. Query `_id > after`, ascending sort, projection to list fields, and `limit(count + 1)`. Return at most count items; produce a cursor from the last returned item only when the extra row exists.
4. Use a minimal explicit list mapper. Convert ObjectId to string and stored media names to URLs. Normalize missing legacy values without modifying the database. Do not call lean() and assume schema.toJSON transforms will run.
5. Stop populating comments for list reads. Preserve detail behavior until P3/P5 replace its contract.
6. Remove offset from the catalogue API after updating known callers. Return a clear 400 when offset is supplied. Search keeps its existing interface until P3; do not silently change search semantics here.
7. For this stage use the existing _id index. P4 adds lifecycle filtering and evaluates its compound index.

Pagination is a traversal of live data, not a snapshot. Deleting the boundary document does not invalidate its cursor. New records inserted before the current boundary may require refreshing the list; ObjectId order is the documented sort order, not guaranteed business chronology.

### Client and BFF work

1. Change `getTracks` into `getTracksPage({ cursor, count })`, with arguments forming the cache key and the existing `tracks` cache tag. Return the page type.
2. Update the Next GET proxy to forward only the approved count/cursor parameters and preserve upstream validation errors. Remove the offset forwarding introduced by the old interface.
3. Render the first page on the server and hydrate a client catalogue component. Put the async initial-page component under Suspense; inside it await connection() before calling the cached getTracksPage function. The runtime boundary is outside the cached function. This makes build independence explicit; Suspense alone around cacheable work does not establish it. Verify against the installed Next documentation.
4. Add a keyboard-accessible “Load more” button, pending indicator, inline failure/retry state and end-of-list state. Disable concurrent clicks. Append by ID, maintain order and retain existing rows on failure.
5. Use AbortController on unmount and ignore stale responses after a catalogue reset. A failed page keeps its cursor for retry; a successful page advances it exactly once.
6. Keep catalogue pagination independent of queue capacity. Until P7 introduces explicit queue commands, playing a catalogue selection creates a bounded snapshot starting at that selection and containing at most 100 loaded entries. Make this behavior visible; do not truncate a bulk enqueue request silently. Loading another page changes only the catalogue, never restarts audio or replaces the current queue.
7. Extract/use PlayableTrack for the player. Selection from a detail page supplies a single-item queue. Do not require list responses to include fabricated comments/lyrics fields just to satisfy ITrack.
8. If queue updates expose broad rerenders, split progress from queue/selection context in this work package. Verify the change with React profiling before adding a new state library.

### Files primarily affected

`server/src/track/{track.controller.ts,track.service.ts,dto/,mappers/}`, a cursor utility, `client/features/tracks/api/getTracks.ts`, catalogue page/components, `client/app/api/tracks/route.ts`, player types and queue API. Update current pagination tests to the new contract rather than retaining dead offset tests.

### Acceptance and tests

- Datasets of 0, 1, 20, 21, 40 and 41 tracks produce correct pages and termination.
- Traversing a static dataset returns every ID once, without duplicates or omissions.
- Malformed cursors/counts return 400; a cursor whose original document was deleted still works.
- List queries never populate comments or return their IDs accidentally.
- Double clicks, failed retries and navigation during a request do not duplicate or reorder rows.
- Loading page two while playing does not restart audio or mutate its queue; selecting a later track can create a new bounded queue. Test a catalogue larger than 100 without exceeding 100 queue entries. P7 replaces this interim snapshot behavior with explicit queue commands.
- A failing Nest produces an error/retry view, never a cached empty-success catalogue.
- A production client build can complete with Nest deliberately unavailable, using a syntactically valid API_URL.

### Recovery

No data migration. Roll back client/server response changes together. Existing catalogue documents remain untouched.

## 5. P2 — dependencies, configuration and reproducible startup

### Dependencies and Git

1. Compare each tracked dependency modification with its exact upstream package version. Classify it as required, accidental or superseded; record the evidence for each decision.
2. Store required changes as explicit reproducible patches associated with the package/version, including patch application in installation and a failure on version mismatch. Investigate whether a standard configuration removes the need first.
3. Keep client/server manifests and lockfiles authoritative. Add a small root command orchestrator only if needed; it must not become a third dependency installation containing copies of both frameworks.
4. Inventory accidental generated directories such as `client/client/.next`; preserve evidence, exclude them and remove them from the index when applicable.
5. Remove tracked dependencies from Git's index after patch preservation. This operation must leave the working installation available. No history rewrite is required.
6. Validate two fresh temporary checkouts using only tracked inputs and documented env templates. npm ci must not depend on an ancestor node_modules, a global CLI or a developer's home files.
7. Pin the tested Node runtime through a version file and engines; record npm version. Lock framework/tool versions through committed lockfiles. Verify compatibility instead of upgrading everything at once.

### MongoDB and environment

1. Select the Mongo image version based on the actual existing database/version and restore test; pin its tag/digest. Never attach an arbitrary older image to the current volume.
2. Provide a documented local single-node replica-set topology with authentication for later transactions. Define initiation, keyfile/permissions, healthcheck, reconnect URI and hostnames reachable by host-run Nest. Do not advertise only a Docker service hostname to a host process.
3. Exercise migration to this topology with a restored copy first. Preserve the original volume as a rollback source until verification completes.
4. Align root Compose credentials with server templates and document copying/configuring both. Use an application DB user for Nest when bootstrap tooling supports it; migration privileges are separate.
5. Keep shell-env precedence. Validate positive safe integers for upload sizes, TTLs, limits and ports; validate HTTP(S) URLs and Mongo URI schemes. Treat empty optional values consistently. Redact secrets in all startup failures.
6. Separate API_URL (server-to-server), PUBLIC_URL (browser-visible media) and the future browser application origin. Document container and host examples separately.
7. Add health/readiness checks. Readiness requires Mongo access and expected topology; configure shutdown so requests and maintenance jobs can drain.
8. Update the seed tool to take API/media/count arguments, avoid personal home filenames, report HTTP failures and obey limits. After P6 it must accept an explicit admin session/token or use a documented privileged CLI operation.

### Scripts and CI

Provide explicit client/server typecheck commands, lint, build and test commands. Add CI jobs for fresh installation, static checks, server unit tests, API integration tests against an isolated replica set, and a client production build with no live Nest dependency. Add browser smoke tests as P1/P5/P6 introduce behavior worth exercising.

CI uses its own Mongo database, static directory and ports; it never runs migrations against developer data. Contract-generation drift becomes a mandatory CI check in P3. TypeScript/Next generated files remain reproducible outputs.

### Exit gate

Fresh installation and documented startup work twice without cached root dependencies; required patches are applied and verified; no node_modules is tracked; database authentication/topology agree; lint/typecheck/tests/build have recorded outcomes. If an environment-dependent build still fails, isolate and resolve the failure rather than recording it as a passing gate.

## 6. P3 — explicit API contracts

### Contract design

1. Introduce response DTOs for TrackListItem, TrackDetail, Comment, CursorPage, ListenResult, accepted deletion and error responses. Document nullable vs optional fields; serialize dates as UTC ISO strings and ObjectId as strings.
2. TrackDetail extends the playable/list data with lyrics and later nullable ownerId. It does not contain an unbounded comments array. During the transition the detail page fetches a bounded comment page through the existing comment service; P5 extracts its module and fixes storage.
3. Normalize list/search/create/detail output through explicit mappers. Stop allowing some endpoints to return comment ObjectIds where others return comment documents.
4. Make duration finite and non-negative, normalize legacy missing duration to null, and represent media absence explicitly as null.
5. Define a stable error envelope: `{ error: { code, message, fieldErrors?, requestId } }`. Map validation, missing resource, conflict, payload size, media type, authentication, permission, throttling and upstream-unavailable errors. Do not expose stack traces, filesystem paths or connection strings.
6. Update proxy-generated 502/504 errors to the same shape. Preserve Retry-After and request IDs. BFF routes accept/forward only declared input fields and headers; no general proxy to arbitrary upstream URLs.
7. Bound and trim text fields in write DTOs. Proposed limits: name/artist 200 characters, username 64, lyrics 100,000, comment text 5,000. Preserve the lyrics whitespace needed for formatting. Reject whitespace-only required fields.
8. Explicitly convert the multipart duration string when present; reject an empty/non-numeric/negative value. P4 makes the server probe authoritative and treats supplied duration as deprecated input.
9. Update search to the same list mapper and cursor envelope; keep escaped regex semantics and document its scaling limit. Bind a search cursor to normalized filters (version/filter hash) so changing filters cannot silently skip results. Do not introduce a full-text ranking change in this work package.

### Schema generation

1. Add deterministic OpenAPI emission from the Nest application definition without opening a port or connecting to Mongo. Extract app configuration/document construction from runtime startup as needed.
2. Commit the generated schema as a reviewable artifact, and generate the client TypeScript declarations from it with a pinned dev tool.
3. Replace handwritten transport interfaces with generated types/type aliases. Keep UI state and PlayableTrack projections handwritten only where they describe UI behavior.
4. CI regenerates schema and types into temporary paths and compares against tracked artifacts. A DTO change that leaves generated artifacts stale fails CI.
5. Test actual serialized responses against the schema; type generation alone does not validate runtime JSON. Keep focused browser boundary checks for critical payloads such as listen counts.
6. Remove schema-level public response transforms only after every endpoint has moved to mappers. Plain database records must no longer depend on accidental toJSON side effects for correct URLs.

### Ownership foundations

Define Track.ownerId and Comment.authorId as nullable ObjectId references. Existing values default to null; adding these fields does not establish identity or permit anonymous ownership. Keep Comment.username as a display snapshot. An explicit reviewed mapping may assign legacy records later; matching names alone is insufficient.

### Exit gate

Every documented read/mutation has one response shape, generated client types compile, runtime responses satisfy schema, and no Mongoose class leaks into client imports. Search/list/detail/create produce consistent public media URLs. Private/authenticated responses introduced later will never use the public feature cache.

## 7. P4 — file validation and recoverable lifecycle

Split this work into P4a validation/storage and P4b lifecycle/recovery, so media parsing and deletion state do not land as one large change.

### P4a: validation and storage boundary

1. Move uploads to a private staging root outside ServeStaticModule's public root. Enforce count, byte, multipart-field and concurrency limits while receiving; stop reading oversized input.
2. Keep an explicit format matrix. Audio: MP3, WAV, OGG, M4A, AAC, FLAC, with OGA treated as the documented OGG alias. Covers: JPEG, PNG, WebP, AVIF, GIF. Distinguish container recognition from browser codec support.
3. Validate extension, detected signature and an actual bounded parser/probe result together. Reject unknown, mismatched, truncated and malformed files. Never rename arbitrary bytes to .flac or .jpg as a fallback.
4. Use detected canonical extensions and UUID names; original filenames are metadata, never paths. Keep traversal/symlink protections on write, move and deletion operations.
5. Choose the parser/probe implementation after checking the locked runtime and fixtures. Run heavyweight probes with a hard time limit, bounded output and concurrency; invoke executables with argument arrays, never interpolated shell commands.
6. Derive audio duration from the probe. Proposed cover limits: 10 MiB and 40 megapixels; preserve the existing 50 MiB audio limit initially. Keep these policies centralized and reflected in client hints/schema.
7. Keep FileService focused on stage/validate/publish/remove operations. TrackService coordinates the track operation. Persisted references are storage keys, not public URLs.
8. Verify static responses for content type, content length and Range/206 playback. Staged files must never be accessible through /static.

### P4b: persistent workflow

Use the separate upload-intent design specified in execution/P4-files.md. Missing lifecycle on an old track is treated as active during backfill. Complete Track records use active -> deleting -> deleted; upload operations separately use uploading -> publishing -> completed or cleanup. Failed/expired uploads retain allocated keys for cleanup without inserting incomplete Track records.

1. Allocate the track ID, operation ID and intended media keys before publication. Persist the uploading intent and owner placeholder; keep partially constructed records outside normal read DTOs. If schema required fields need a separate upload-operation record, use that record rather than filling invalid placeholders into Track.
2. Stage and validate both files. Publish to the allocated final keys. Activate only after successful publication, using a compare-and-set on lifecycle and operation ownership.
3. On failure, record cleanup work durably. Compensation may run immediately, but a process crash must not erase the only record of the expected file keys.
4. DELETE first atomically marks an active/uploading track deleting and retains media references. Hide deleting/deleted tracks from catalogue/detail/search, reject listens and reject new comments for them.
5. Return 202 with operation/track identity once deletion is durably accepted. Repeated DELETE of a known deleting/deleted tombstone returns the same accepted operation; an unknown ID returns 404. Document that public media may remain reachable until asynchronous unlink completes.
6. A maintenance service in the same Nest application periodically claims pending operations through Mongo atomic leases. Provide a CLI using the same service for manual retries; no separate queue infrastructure.
7. Cleanup is repeatable: delete comments, remove files (ENOENT succeeds), mark deleted. Failures retain state, attempt count, sanitized last error and next retry time. Apply bounded backoff; do not permanently abandon silently after a fixed number of retries.
8. Expired leases are reclaimable. A process that lost its lease cannot activate a track or finalize an operation. Scan/reconcile late filesystem writes because disk moves and Mongo state are not one atomic transaction.
9. Keep tombstones and operation records through the recovery window. Do not attach TTL deletion to unfinished operations. Physical metadata purging is a separate explicitly invoked maintenance step.
10. Add dry-run reconciliation for stale staging files, public files with no valid reference, and active tracks with missing media. Use an age grace period, check references in pending intents and protect files shared by legacy records. Quarantine ambiguous files; never delete them based only on a filename listing.
11. After active backfill, evaluate `{ lifecycle: 1, _id: 1 }` for catalogue queries with explain on representative data. Create indexes with a migration; do not depend on automatic production index synchronization.
12. Cache coherence: invalidate track/list tags after acceptance of deletion or successful activation. If Nest operations can bypass Next, use a durable invalidation event retried to a fixed authenticated Next internal endpoint. Persist the pending invalidation alongside the lifecycle transition, atomically in the same document or Mongo transaction; never rely on a second best-effort write after deletion. Delivery is at least once, so event handling is idempotent. Public API writes must not leave Next serving deleted records until cache expiry. The receiver accepts only known event types/IDs and derives tags itself. Use hard expiration for deletion tags and test the installed Next API so stale-while-revalidate does not deliberately serve a deleted record; retries provide eventual delivery rather than claiming atomic consistency across processes.

### Lifecycle migration and verification

Audit existing audio/picture references before backfilling lifecycle. Preserve active legacy records with absent optional media, but flag genuinely missing referenced files. Backfill in resumable batches and retain before-images. Keep static filenames unchanged.

Inject failure before/after every persistence boundary: intent creation, first/second publication, activation, tombstone, comment cleanup and unlink. Restart the process; verify recovery converges without deleting active/shared files. Test two workers claiming the same operation and concurrent repeated deletes. No external filesystem mutation belongs inside a Mongo transaction retry callback.

### Exit gate

Rejected uploads leave no permanent public assets; accepted uploads expose only validated media; interrupted operations remain discoverable and repeatable; deletion survives restart; stale cache invalidation is retried; all normal queries exclude non-active tracks.

## 8. P5 — comment model, module and data migration

### Target model and API

Comment owns the only relationship: `track_id -> Track._id`. Keep the stored name track_id for now. Add nullable authorId and preserve username as a historical display snapshot. Add an index `{ track_id: 1, _id: 1 }`.

Canonical endpoints:

- `GET /tracks/:trackId/comments?count=20&cursor=...` returns CursorPage<Comment>.
- `POST /tracks/:trackId/comments` accepts text/rating and transitional username until P6 derives identity.
- `DELETE /comments/:commentId` returns a documented empty success response; permission enforcement is added in P6.

Comment cursors include version and track identity; a cursor from another track is rejected. Comments are ordered by _id; legacy records without timestamps return createdAt: null. Do not synthesize apparently exact historical dates from ObjectId.

### Expand, reconcile, switch, contract

1. **Read-only audit:** classify comments with valid parents, missing parents, broken/missing track_id, duplicate Track.comments references and conflicting parent references. Persist IDs and reasons in a restricted report.
2. **Recovery preparation:** back up both collections and restore a copy. Stop API writers, seeds and maintenance writers for the migration window; do not attempt an untested live dual-write rollout for a local pre-production dataset.
3. **Deterministic reconciliation:** a valid existing comment.track_id is authoritative; report contradictory array links. If track_id is missing/invalid and exactly one valid track array references the comment, repair from that link. Multiple candidate tracks or no valid parent are quarantined for review, with a full before-image.
4. Never delete orphan/conflicting comments automatically. Copy unresolved rows to a quarantine collection, verify counts/checksums and mark/exclude them from active reads until explicitly resolved.
5. Create the comment query index and backfill authorId: null only where absent. Preserve IDs, text, rating, username and existing timestamps.
6. Extract CommentModule. CommentService owns its model and reads a narrow exported Track access service for active-parent checks; TrackService must not import CommentModule back. Maintenance can access the comment model directly for cleanup. Keep the module graph acyclic.
7. Switch detail reading to a separate first comment page and add load-more/error states in `features/comments`. Show a loaded count/end state, not a fabricated total from the first page length.
8. Switch writes to track_id only. Remove Track.comments population and $push/$pull operations from runtime code. Remove the schema field before unsetting old data so a Mongoose default cannot recreate arrays.
9. Remove obsolete comment endpoints and all callers together after the new routes pass acceptance. Update OpenAPI/client types in the same work package.
10. Run a contract migration that unsets Track.comments in resumable batches. Store the old arrays in the migration journal until acceptance. Reopening writers is allowed only after no old writer code can recreate the field.

### Concurrent creation/deletion guarantee

A foreign key field alone cannot enforce parent existence. Use the replica set established in P2 and a transaction for comment creation: conditionally update an active parent with a dedicated comment-write revision, then insert the comment in the same session. Deletion's state transition writes the same parent document. This produces a write conflict/order boundary, rather than merely reading a parent snapshot and inserting an orphan later. Retry only transient transaction errors, with a bounded policy.

If comment creation commits before deleting, maintenance removes it. If deleting wins, creation fails without inserting a comment. A transaction must perform only Mongo work; no file operations, network cache invalidations or duplicated user notifications inside a retried callback.

### Migration tooling

Every script supports `--dry-run`, explicit database selection, migration version, bounded batch size, checkpoint/resume and a summary report. Write operations use expected-old-value predicates and record before-images. An apply run with unresolved ambiguities refuses the destructive contract step.

Verify idempotency by running audit/apply again: it must make no further changes after a completed successful migration. Simulate interruption mid-batch and resume. Never rely on a Mongo transaction covering the entire dataset.

### Exit gate

Every active comment has exactly one existing parent and one authoritative track_id; Track.comments is absent; the detail page paginates comments; no runtime code updates a reverse array; concurrent create/delete cannot leave active orphans. Test individual comment deletion, parent deletion, legacy timestamps and quarantined cases on the restored replica-set dataset.

### Rollback boundary

Before writers reopen, restore before-images or the isolated backup and roll code back together. After writers reopen, a raw snapshot restore would lose newer comments: use a reviewed forward repair, or rebuild reverse arrays from track_id under a new writer freeze before returning to old code. State this boundary in the migration runbook.

## 9. P6 — authentication and ownership

Authentication follows the data changes because the app is local; persistent account queue integration follows authentication. It remains a mandatory gate before access by outside users. The architecture below is the proposed default; an explicit product choice of external identity should replace the credential implementation while preserving the permission contracts.

### Identity and session design

1. Start with local username/password login and provisioned accounts; no public registration, email delivery or password-reset workflow is required for these seven tasks.
2. Nest AuthModule owns User, Session, password verification and permission services. Use the versioned asynchronous Node scrypt policy specified in execution/P6-authentication.md, including its concurrency and memory bounds; verify the pinned runtime against the linked primary documentation.
3. User: stable ID, normalized unique username, display name, password hash metadata, role (user/admin), disabled flag and timestamps. Build the unique username index before accepting account creation.
4. Session: user reference, hash of a cryptographically random opaque token, expiry and revocation state. Never store or log the raw session token. Mongo TTL helps cleanup; every authentication check independently validates expiry/revocation and current user status/role.
5. Login rotates session identity; logout revokes server-side and clears the browser cookie. Proposed defaults: 7-day absolute expiry, no sliding renewal in the initial implementation. Revocation and disabling a user take effect on the next request.
6. Nest auth endpoints are consumed by Next BFF. Next stores the opaque token in an HttpOnly, SameSite=Lax cookie, Secure in production, host-only and Path=/. Use a production __Host- cookie name with the required attributes and a separate explicit development name.
7. The BFF extracts only its session cookie and sends it to Nest as Bearer authorization. Never forward a browser-supplied Authorization header as a substitute or expose the token in browser JSON/localStorage.
8. Require an allowed browser Origin and a custom same-origin request header for unsafe BFF methods, including login/logout. Reject absent/untrusted Origin for browser mutation routes; privileged CLI clients use the explicit Nest Bearer interface. Define the multipart path consistently and test CSRF behavior.
9. Keep identity/session data out of shared Next caches. Public cached track DTOs do not contain per-user permissions; compute viewer controls using a separate uncached session read.

### Permissions

| Operation | Anonymous | User | Admin |
|---|---|---|---|
| Read active catalogue/detail/comments and public media | Yes | Yes | Yes |
| Record a listen | Yes, throttled | Yes, throttled | Yes, throttled |
| Upload track | No | Yes, ownerId from session | Yes |
| Create comment | No | Yes, authorId and display snapshot from session | Yes |
| Delete track | No | Own only | Any |
| Delete comment | No | Own only | Any |
| Delete legacy null-owner/null-author record | No | No | Yes |
| Read/change playback queue | Local browser queue only | Own account queue only | Own account queue only |

A track owner does not automatically moderate other users' comments. Choose that as a separate product rule if needed later. Supplying ownerId/authorId/role/username in a write body must not grant authority.

### Implementation

1. Add Nest login/logout/me endpoints, authentication guard and explicit permission methods. Use atomic owner/state predicates for mutations where possible; server enforcement applies even when Next is bypassed. Run authentication/permission guards before upload interceptors so rejected users cannot consume the full staging budget.
2. Rate-limit login by a trustworthy source/account key, return a generic invalid-credentials message and avoid credential/token logging. Fix proxy trust deliberately; do not trust arbitrary X-Forwarded-For. Single-instance counters are sufficient for current local scope; document multi-instance limits.
3. Add root-safe bootstrap CLI: idempotent explicit account provisioning, hidden/password-stdin input, no default admin password and no password in command-line arguments or Git. Record the legacy ownership policy rather than automatically claiming every record for the first account.
4. Build /login with pending/errors and an allowlisted local return URL. Add logout and session state. Session expiration leads to a login prompt without discarding submitted form text unnecessarily.
5. Update BFF authenticated transport to pass only the intended token/header set. Distinguish 401 (login required) and 403 (not allowed) in UI without weakening server checks.
6. Set ownership on all new track/comment writes. Optional explicit legacy ownership assignment uses a dry-run, reviewed ID mapping and audit log; null remains the safe default.
7. Update seeds and maintenance commands for their required access. Maintenance runs as a privileged internal process; browser routes never expose unrestricted maintenance actions.
8. End-to-end verification can use small upload/comment forms or fixture clients. The existing placeholder /upload and comment button must not appear to complete a submission; full authoring UX is a separate deliverable unless explicitly included.

### Acceptance and tests

Test anonymous/user A/user B/admin against every matrix row through both Nest and Next. Include forged owner fields, duplicate usernames, wrong credentials, expired/revoked sessions, disabled users, logout replay, CSRF attempts, missing Origin, unsafe return URLs and caching leakage between users. Confirm login does not expose secrets in rendered props/network JSON/logs. Test null-owned legacy records and concurrent delete permission checks.

### Recovery

Migrations only add user/session/owner fields and indexes. If login is disabled during debugging, keep write operations closed; never silently revert to public mutation endpoints. Legacy owner assignment has its own reversible journal. Existing public reads remain usable.

## 10. P7 — complete playback queue integration (maximum 100 entries)

### Product rules and invariants

The 100-entry cap is required. Persistence, duplicate handling and playback rules below are explicit proposed defaults, so implementation does not depend on unstated behavior.

1. One ordered playback queue per authenticated user; a guest has a separate local browser queue. The limit is **100 entries**, including the current entry and previously played entries still retained. Replaying an entry does not consume another slot. The catalogue can contain any number of tracks.
2. Repeated tracks are allowed deliberately. Each occurrence has a stable UUID entryId, separate from trackId. Reorder, selection, next/previous and removal operate on entryId, never on the first matching trackId.
3. An enqueue/bulk replacement that would exceed 100 is rejected atomically; no silent dropping, partial acceptance or implicit eviction. UI shows the capacity and how many entries must be removed. Removing entries and clearing remain possible at capacity.
4. Queue contents are persistent; playing/paused state, current time, selected entry and actual audio transport are device-local. Other devices may edit queue contents but cannot remotely start this device's audio.
5. Refresh restores order and a valid saved local selection, initially paused. Restore a finite saved seek position only after metadata loads and clamp to duration. Browser autoplay restrictions remain respected.
6. Loading more catalogue/search results does not enqueue them. P7 replaces P1's interim catalogue snapshot: plain Play selects an existing matching occurrence (prefer current, otherwise first playable occurrence); if absent, appends one entry and selects it. Pressing Play on the selected occurrence toggles pause/resume; selecting another occurrence starts it from the beginning. An append failure/full queue leaves playback unchanged. An explicit “Play these tracks” replaces the queue, warns when replacing a nonempty queue, and rejects more than 100 selections.
7. “Add to queue” appends; “Play next” inserts immediately after the selected entry, or at the start if none is selected. Each command that adds an occurrence allocates a new entryId. The same transport retry reuses that entryId; a second deliberate click creates a new occurrence.
8. Previous restarts the current playable track when currentTime > 3 seconds; otherwise selects the previous playable entry. Next and ended select the next playable entry. At the end, stop and retain the selected entry; no implicit wraparound. Repeat/shuffle are separate optional features, not prerequisites for a correct ordered queue.
9. Reordering/removing other entries preserves the current audio source, time and playing state. Removing the current entry selects the next playable entry at/after its old position, otherwise the preceding playable entry. Resume only if it was already playing; if no playable entries remain, stop and clear selection. Clearing stops playback and releases the audio source.
10. Deleted/non-active tracks or missing audio become visible unavailable entries, retain their place and count toward 100 until removed, and are skipped during traversal. Do not loop indefinitely across unavailable entries. Offer “Remove unavailable” as one bounded operation.

### Models and contracts

Persist a Queue document keyed by unique userId, with revision, entries, lastMutationId, lastMutationHash and timestamps. Entries store entryId, trackId and a server-derived display snapshot (name/artist) for rendering deleted tracks. Do not persist audio URLs as authority: resolve current public track data at read time. Bound embedded entries in the schema and all service paths.

```ts
type QueueWrite = {
  expectedRevision: number
  mutationId: string              // UUID per deliberate mutation; retained on retry
  entries: { entryId: string; trackId: string }[] // maxItems: 100
}

type QueueEntry = {
  entryId: string
  trackId: string
  display: { name: string; artist: string | null }
  track: PlayableTrack | null
  availability: 'playable' | 'unavailable'
  reason: 'deleted' | 'missing-audio' | null
}

type QueueSnapshot = {
  revision: number
  capacity: 100
  entries: QueueEntry[]
  updatedAt: string | null
}
```

Enforce unique entryId within a queue; trackId may repeat. Track status changes do not increment queue revision when merely projected as unavailable, because order/membership did not change. Existing unavailable entries can be retained or removed; newly inserted entries must reference active tracks with audio. A deletion after successful validation may still make an entry unavailable, and reads/player traversal must handle that race.

Expose generated OpenAPI types and error codes QUEUE_FULL, QUEUE_CONFLICT, QUEUE_ENTRY_INVALID and TRACK_UNAVAILABLE using P3's error envelope. Reject client-controlled userId, display snapshots and unknown write fields. A user/admin cannot read another user's private queue by supplying an identifier.

### Nest API and concurrency

| Method | Nest endpoint | Browser BFF endpoint | Result |
|---|---|---|---|
| GET | /queue | /api/queue | 200 QueueSnapshot; absent account queue is empty revision 0 |
| PUT | /queue | /api/queue | 200 complete QueueSnapshot after validated replacement |

The bounded full-snapshot PUT implements append, play-next insertion, reorder, removal, clear and replace without a separate endpoint for each UI operation. Browser queue commands compute the desired entries and submit one write. There is no unbounded track lookup or arbitrary-user queue route. Define the capacity once in Nest policy/schema and emit maxItems: 100 plus the literal response capacity; client UI consumes that contract rather than inventing a different limit.

1. QueueModule imports the auth/session boundary and a narrow Track read service; avoid importing queue into TrackModule. Register a unique userId index through a migration.
2. Validate payload byte size, safe non-negative revision, UUIDs, at most 100 entries, unique entryIds and strict ObjectId format before querying. Query at most 100 distinct track IDs in one projected lookup; do not perform per-entry populate queries.
3. Preserve stored snapshots for retained entryId/trackId pairs; derive snapshots for new entries from server data. Reusing an entryId for a different track is invalid.
4. Use a single-document compare-and-set on `{ userId, revision: expectedRevision }`, increment revision on acceptance. Concurrent writes from the same revision, including two additions to a 99-entry queue, cannot both succeed and exceed the capacity. Handle the first concurrent insert through the unique userId index; the loser receives conflict, never a duplicate queue.
5. If mutationId equals the last committed mutation and the normalized payload hash matches, return the current snapshot without incrementing revision. Reuse with different data is invalid. If intervening writes superseded it, return 409 and require reconciliation; do not claim unlimited idempotency from one stored mutation ID.
6. On revision conflict, return 409 QUEUE_CONFLICT and let the client refetch. No blind overwrite and no automatic reapplication of an arbitrary reorder to a newer queue. Reject excessive writes with 429/Retry-After without altering the queue.
7. GET/PUT use private no-store responses through Nest and Next. Queue state never enters public 'use cache', track cache tags or prerender output. Queue GET observes track lifecycle changes; later writes cannot reactivate a deleted track.
8. GET for an account without a Queue is a virtual empty snapshot and does not write. Existing accounts therefore need no mass backfill. New queue creation is authenticated and atomic.

### Client state and player integration

1. Create `features/queue` with a pure reducer/command layer, persistence adapters, generated API types and selectors. Own the ordered entries in one provider/store; eliminate the second mutable ITrack[] queue inside PlayerProvider. Pass player transport only selection changes and resolved PlayableTrack data.
2. Separate frequently updated audio progress from queue membership and commands. Rendering 100 queue rows must not happen on every timeupdate. Keep a single audio element across catalogue, detail, queue panel and navigation.
3. Serialize local queue mutations; keep one authenticated write in flight, with the same mutationId for transport retry. Disable conflicting edits until that write settles. Show pending/error state rather than announcing an unconfirmed reorder as saved.
4. Membership/order UI may show a pending preview, but playback-changing commands wait for write confirmation. A failed replacement/removal/clear must not leave player and persisted queue disagreeing. Next/previous of already confirmed entries remain local and do not rewrite the queue.
5. Refetch on 409, restore canonical order, retain selection if its entry still exists, and show a conflict message with a deliberate retry. A lost HTTP response followed by an ambiguous retry never blindly duplicates entries or reverts newer changes.
6. For same-track duplicate entries, selecting the next occurrence explicitly restarts the source position as a new playback selection even though trackId/audio URL are unchanged. Listen accounting follows selection/session identity, not just trackId; reorder/refetch/hydration does not count as a listen.
7. Persist the guest queue in a versioned local browser record with the same bound/validation, entry IDs, display snapshots and local revision. Hydrate after mount with no SSR mismatch; handle malformed data, unsupported versions, storage denial and quota failures with a visible in-memory fallback. Store no credential/session token there.
8. Validate guest track references through a bounded track-resolution API before playback and restore. Add `POST /tracks/resolve` and BFF `/api/tracks/resolve` with 1–100 unique IDs and a per-ID playable/unavailable result. This read-only POST is bounded/throttled, accepts only IDs, does not create listens or expose non-active track metadata, and avoids 100 individual requests. Reflect it in generated contracts.
9. Namespace saved playback position by guest/account identity. On login, load the account queue and ask whether to keep it, replace it with the guest queue, or merge (account entries first). Merge preserves distinct occurrences; if the combined result exceeds 100, require explicit selection/removal before saving. Do not truncate or silently upload the guest queue. Clear the pending import prompt/marker only after successful user-approved persistence; retain the separate guest queue for later logout.
10. On logout/account switch, stop playback, discard the private queue from memory/browser playback state, and hydrate the separate guest queue paused. Never copy an authenticated queue into guest storage automatically. Preserve a guest queue that existed before login.
11. Synchronize same-browser tabs through a notification channel/storage event and refetch on focus. Choose one browser tab as the playback owner using a browser coordination mechanism with a fallback; other tabs stay paused until explicit takeover. Queue edits notify peers but do not auto-start audio. Use revision conflict handling for simultaneous guest writes and serialize them with a browser lock when available. If reliable browser coordination is absent, keep shared storage read-only and use an explicitly unsaved per-tab in-memory fallback, as specified in the execution runbook; never assume localStorage compare-and-set is atomic.
12. Revalidate account queues on focus and before selecting an unresolved/unavailable entry; no WebSocket infrastructure is required. If a remote edit removes the current entry, apply the deterministic removal rule locally without granting remote auto-start on a paused device.

### Complete UI integration

- Add a queue toggle in PlayerBar with entry count and a responsive drawer/panel available on all main routes. Display `n / 100`, current/playing state, track/artist, unavailable reason and pending/sync errors.
- Provide Play/select, add, play-next, remove, clear, replace and remove-unavailable actions. Catalogue rows and the detail page expose add/play-next controls with accessible labels. Bulk selection supports add/replace with remaining capacity shown before submission.
- Support reorder with drag-and-drop plus keyboard “Move up/down” controls; expose position and disabled boundaries to assistive technology. Use entryId keys; repeated tracks must be independently selectable/removable.
- Keep focus after removal/reorder, announce capacity/conflict results, support Escape/focus trapping in the drawer and touch interactions. Disabled actions explain capacity rather than failing invisibly.
- Replace catalogue-source mirroring entirely: browsing, sorting or loading another page never overwrites a curated queue. Provide explicit empty, restored-paused, full, offline/unsaved, conflict and entirely-unavailable states.
- At 100 entries, Play still works for an existing occurrence; adding a new track is refused without disturbing audio. The user can explicitly replace/clear/remove to free slots.

### Acceptance and verification

1. Unit tests cover command invariants and reducer transitions at 0, 1, 99, 100 and rejected 101 entries; duplicates count independently and duplicate entryIds are rejected. Test all-unavailable and consecutive-unavailable traversal.
2. Mongo/API tests race two writes from the same revision (especially 99 + 1); exactly one wins, revision is monotonic and stored length never exceeds 100. Test concurrent initial creation, repeated mutation retry, conflicting ID reuse and account isolation.
3. Contract tests cover GET/PUT/resolve DTOs, validation errors, exact capacity and 409/429 propagation through Next. A malformed 101-entry request cannot bypass the cap via direct Nest calls or guest import.
4. Player tests verify one audio element, no restart on unrelated edits, restart for a different occurrence of the same track, deterministic removal, paused restore, clear, next/previous/ended and listen session boundaries.
5. Browser tests traverse multiple catalogue pages, build/reorder a 100-entry queue, reject the 101st, remove then append, refresh and resume manually. Include keyboard-only and narrow-screen drawer operation.
6. Test offline/errors during writes, lost responses, stale requests, two tabs, explicit playback takeover, two accounts, logout, oversized guest merge and corrupt/denied local storage. Never leak a private queue or auto-play after hydration/login.
7. Delete a queued track through the real P4 workflow: queue shows unavailable on revalidation, skips it, retains order and can remove it. Validate that account and guest resolution do not expose deleted metadata beyond their previously stored display snapshots.

### Exit and recovery gates

Queue management is usable through UI and API end to end, capped at 100 in every persistence path, account-private, reload-safe, conflict-aware and integrated with one audio engine. OpenAPI, generated client types, permission tests and browser flows include queue operations.

Introduce the queue collection/index additively. Keep browser storage versioned; back up incompatible local records instead of guessing a conversion. A rollback disables queue writes and retains account documents for forward repair; it never truncates queues to make older code accept them. Existing tracks/comments/media require no queue backfill. Record the one-document last-mutation retry limitation and device-local playback policy in user/developer documentation.

## 11. Integration and completion gates

P8 runs from a fresh checkout using only the committed manifests, lockfiles, patches and documented tools.

1. Install with npm ci in each application; generate contracts and prove no drift; run lint/typechecks/unit tests.
2. Start an isolated authenticated replica set and private media root. Run migrations twice, compare second-run no-op results, and exercise backup restoration.
3. Build Next with Nest unavailable. Start both applications and test real BFF -> Nest -> Mongo/static requests, including error/timeout/429 behavior.
4. Walk a 41-track catalogue; play through a page boundary; delete a track and verify catalogue/detail/counter behavior after invalidation. Verify successful Range playback and the transition of deleted media to 404 after cleanup.
5. Create enough comments for multiple pages; run concurrent create/delete and verify there are no active orphan comments. Do not count isolated mock tests as proof of transactional behavior.
6. Interrupt uploads and deletions at controlled boundaries, restart services and run recovery. Inspect remaining intents, staging files, tombstones and invalidation events.
7. Execute the authentication permission matrix, confirm no viewer-specific data enters shared caches, and confirm scripts cannot bypass authorization accidentally.
8. Exercise queue sizes 0, 1, 99, 100 and rejected 101; concurrent edits, guest/account transitions, unavailable tracks, reloads and complete browser queue controls. Confirm queue edits never create an additional audio element or listen event by themselves.
9. Record commands, fixture IDs, results and unresolved limitations in the review document. A failed required gate is reported as incomplete, never silently skipped.

Definition of complete: all seven work packages and integration gates pass; queue capacity, ownership, persistence and player synchronization are verified; migrations and operational runbooks are checked in; no tracked dependencies or manual dependency edits are required; no existing data is silently discarded; API schemas and client types agree; the agreed permission model is enforced on Nest.

## 12. Reviewable delivery units

| Unit | Scope | Must remain true after integration |
|---|---|---|
| 01 | Baseline, restore exercise and inventories | Existing work/data recoverable |
| 02 | Cursor DTO, list mapper and API page tests | Backend page semantics correct |
| 03 | Catalogue UI, queue update and build-time boundary | Whole catalogue usable end to end |
| 04 | Patch preservation, dependency/index cleanup | Fresh install matches behavior |
| 05 | Mongo/config/startup and CI | Transaction-ready local stack reproducible |
| 06 | Response mappers, errors and contract generation | Schema/runtime/client agree |
| 07 | Staging, media validation and limits | Invalid uploads cannot become active |
| 08 | Lifecycle, maintenance and cache invalidation | Interrupted operations recover |
| 09 | Comment audit/backfill and bounded read API | Migration rehearsed without data loss |
| 10 | Comment module/write switch/contract migration | Single relationship enforced |
| 11 | Auth/session backend and bootstrap tooling | Permissions enforced server-side |
| 12 | Login/BFF integration and permission verification | Browser identity flow correct |
| 13 | Queue contracts, persistence and revision-safe API | Private queues stay within 100 entries |
| 14 | Queue reducer/audio adapter and guest/account synchronization | State survives edits, reloads and conflicts |
| 15 | Queue panel, catalogue/detail controls and browser tests | Complete queue workflow usable |
| 16 | Clean-checkout integration and documentation | All completion gates recorded |

Units 02–03, 09–10, 11–12 and 13–15 may be developed as separate changes but must not be integrated into the shared runnable branch with incompatible client/server contracts. Do not combine Git dependency removal, data migration and application behavior changes in one unreviewable commit.

## 13. Explicit implementation-time decisions

The execution runbooks resolve implementation defaults for all phases. The following evidence-dependent selections remain bounded checks, not reasons to stop routine implementation:

- **P0/P2:** exact necessary dependency patches and Mongo image version depend on the current installation, data and restore test.
- **P2:** replica-set configuration must match whether Nest runs on the host or in Docker; document one primary local topology and test it.
- **P4:** default adapters are file-type, sharp and system ffprobe, with the exact limits and workflow in execution/P4-files.md. Verify compatible versions and fixtures before installation.
- **P5:** ambiguous legacy parent links require a human-approved mapping or quarantine; scripts must not guess.
- **P6:** use local provisioned accounts and the scrypt/session policy in execution/P6-authentication.md. External identity is outside the current implementation scope unless the user changes it.

The full upload/comment authoring interface, favourites/playlists, full-text search, private media, email recovery, social login, analytics-grade listen deduplication and multi-instance infrastructure are additional product work. Their absence does not change the seven completion gates above.
