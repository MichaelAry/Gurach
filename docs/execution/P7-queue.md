# P7 — complete queue, max 100 entries

Prerequisites: P1 catalogue, P3 generated contracts, P4 lifecycle and P6 identity. Master plan P7 is the behavioral source; all parts below are required.

## P7.1 Policy, DTOs and model

Create queue/queue-policy.ts (`QUEUE_CAPACITY=100`), dto/queue-write.dto.ts, dto/queue-response.dto.ts and schemas/queue.schema.ts. Queue document: unique userId, safe integer revision, entries, lastMutationId/hash, timestamps. Embedded entry: stable UUID entryId, ObjectId trackId, server-derived display snapshot. Track duplicates allowed; duplicate entry IDs forbidden. Public response adds resolved PlayableTrack|null and availability/reason.

OpenAPI expresses maxItems:100, literal capacity 100, strict IDs and required fields. Metadata-only hydration never increments queue revision. No playback time/paused/playing state in Mongo queue. Initial absent queue is virtual revision 0/entries[]/updatedAt:null.

Add migration `006-queue-indexes`. Existing users need no empty Queue backfill. Bound request body to 64 KiB; reject count 101 before DB work. Schema validation and service checks both enforce capacity; no alternate mutation path may bypass them.

Gate: 0/1/99/100 accepted, 101 rejected, track duplicates distinct, entryId collisions rejected and userId cannot be chosen in body.

## P7.2 Revision-safe service and API

Create QueueService/Controller/Module and TrackReadService export for bounded resolution; keep module graph acyclic. GET/PUT /queue use current actor only. GET hydrates <=100 distinct track IDs in one projected query, restoring entry order/duplicates from stored entries. Non-active tracks resolve unavailable; previously stored display text may remain.

PUT body: expectedRevision, mutationId UUID, entries[{entryId,trackId}]. Normalize/hash request; validate new entries' active/audio state, retain immutable entryId->trackId mapping and derive snapshots server-side. Existing unavailable entries may remain/remove. Compare-and-set userId+revision and increment once; never read-modify-save without predicate. Concurrent first insertion uses unique userId and turns duplicate-key loser into 409, not an unhandled 500.

Check matching lastMutationId+hash for transport retry, returning canonical current snapshot without extra revision. Same ID/different payload->400. Intervening writes mean 409+refetch; no automatic stale overwrite. Use QUEUE_FULL/QUEUE_CONFLICT/QUEUE_ENTRY_INVALID/TRACK_UNAVAILABLE codes. 409/429 preserves order/revision.

Gate: two writes from same revision, including at 99 entries, yield one winner; retries do not append twice; A cannot access B queue, even as admin supplying a forged userId.

## P7.3 Track resolver and Next boundary

Add bounded POST /tracks/resolve and /api/tracks/resolve: body {ids:[unique IDs]}, 1..100, projected per-ID playable/unavailable results without metadata of deleted tracks. Empty local queue skips resolver rather than sending an invalid empty request. Read-only POST never increments listens. Ensure static routes precede :id matching.

Create /api/queue route GET/PUT with private no-store, authenticated transport, CSRF Origin/custom header on PUT and preserved conflict/errors. Resolver guest POST follows same-origin header policy and rate limits but does not require login. Regenerate schema/types, contract tests and permissions matrix.

Gate: no 100-request fanout; no credentials in browser payload; deleted track resolution exposes no newly read private metadata.

## P7.4 Pure commands and store

Create features/queue/{types.ts,queueReducer.ts,commands.ts,QueueProvider.tsx,hooks.ts}. One canonical ordered queue; commands append/play-next/remove/reorder/clear/replace/removeUnavailable. They operate on entryId and return explicit capacity/selection outcomes. Never silently slice requested input to 100.

Use an adapter interface `load`, `save(expectedRevision,mutationId,entries)` and notifications for account/local persistence. Serialize account writes, disable conflicting edits while pending, and distinguish canonical vs pending preview. Playback-affecting membership changes apply only after save confirmation. On 409 fetch canonical queue and show deliberate retry; retain valid selection without reverting a newer revision.

Gate: pure property/boundary tests maintain <=100, unique entryId/order, no mutation of inputs; bulk over-capacity is all-or-nothing. Deliberate repeated add creates another UUID; transport retry does not.

## P7.5 Audio integration

Move/bridge player into features/player with separate queue-selection, stable transport commands and high-frequency progress contexts. Remove PlayerProvider's independent mutable ITrack[]; existing hooks/components consume adapters until imports updated together. Keep exactly one audio element under main shell.

Use selectedEntryId and selectionSessionId, not trackId, as playback identity. Next occurrence of same track must restart time/increment session even if src URL is identical. Reorder/metadata refresh must not reset src/time/session. Count listens on actual playback, never queue mutation/hydration alone.

Implement master rules exactly: previous >3s restarts else previous playable; next/ended skips unavailable bounded to queue length; terminal stop without wrap; removing current chooses next at old position else previous and only resumes if already playing; clearing confirmed queue stops/releases source. Local selection/time are namespaced to identity and restored paused after metadata validation/clamping.

Gate: real audio events (with browser fixture media) prove duplicate occurrence restart, no reorder restart, correct removal/clear and no unsolicited autoplay/listen.

Execution result (2026-11-08): verified. `features/player/PlayerProvider` now hosts the single `<audio>` element and consumes the canonical `QueueStore`; the old `components/player/PlayerProvider` remains a compatibility re-export. Transport/selection state and high-frequency progress are separate contexts. Catalogue Play adds/selects an occurrence without replacing queue membership. Occurrence identity drives source sessions, so duplicate tracks restart independently while reorder and metadata-only refresh retain the active audio session. Listen counts are sent only from an actual `play` event and are deduplicated per session. Previous (>3 seconds restart), bounded next/ended behavior, confirmed current removal, and confirmed clear/source release are implemented. The footer currently exposes move-up, remove-current, and clear controls; the complete queue panel remains P7.7. Guest state is intentionally in-memory pending P7.6 persistence.

Verification: 38 client unit tests passed; TypeScript, ESLint, OpenAPI contract check and production build passed. All 7 Playwright browser scenarios passed, including a real WAV fixture that covers duplicate selection, same-source session restart, listen count once per session, reorder without restarting, previous restart, current-occurrence removal and clear releasing the media source. Browser warning about the existing smooth-scroll setting is unrelated. No original database migrations were applied.

## P7.6 Guest persistence and account transition

Use versioned local browser storage of <=100 entries/revision/display snapshots, never tokens. Validate saved bytes/shape/UUIDs/size before hydration. Preserve invalid/version-unknown raw data privately in the browser if possible and offer reset; don't crash SSR or trust it for playback. Resolve IDs before playback/restore; storage denial/quota uses visible in-memory fallback.

Use Web Locks when available to serialize guest writes and elect the audio owner; notify via BroadcastChannel/storage and release on cleanup. Auth queue uses server CAS across devices regardless of browser support. If reliable browser coordination is unavailable, do not fake atomic localStorage CAS: use an explicitly unsaved per-tab in-memory fallback for guest edits/playback and document this limitation, retaining existing storage read-only. Secondary coordinated tabs stay paused until explicit takeover; queue notifications never auto-start audio.

Login: fetch account queue; user chooses keep account/replace from guest/merge account-first. Preserve duplicate occurrences. Capacity >100 requires explicit removal/selection; never truncate. Guest source remains separate; mark import prompt resolved only after successful chosen save. Logout/account switch stops audio, clears private in-memory queue/identity-specific playback state and restores guest queue paused.

Gate: corrupt data, storage denial, refresh, two tabs, account A/B, denied import, oversized merge and lost responses preserve identity/cap/order; no private queue leaks into guest storage.

Execution result (2026-11-08): P7.6 verified. Guest queues now use a versioned, bounded localStorage snapshot only when Web Locks and BroadcastChannel are available; writes serialize under an exclusive lock, compare revisions, persist mutation retry identity, and notify other tabs. Every guest load re-resolves track IDs before playback. Corrupt/unknown versions are quarantined without silently overwriting the source and the footer offers an explicit reset. If storage is unavailable or quota is exhausted, the current tab continues with an in-memory queue and shows that it is unsaved; if track resolution is offline, cached tracks are not treated as validated/playable, and an online event retries hydration.

Playback resume state is separately versioned and namespaced by `guest` or account user ID. It restores selection/time only after the queue resolves, clamps time to media duration, and stays paused. Guest audio uses a Web Lock lease: a second tab can see synchronized queue membership but cannot start audio while another tab owns playback. Account import prompts are per user and offer keep-account, replace-selected, or merge-selected choices; duplicates remain distinct, overflow is resolved by explicit selection, unavailable guest tracks cannot be silently imported, and the guest snapshot stays separate. Logout/account identity changes stop and clear the active in-memory source.

Verification: 40 client unit tests and 12 Playwright browser tests passed, including reload/paused restore, explicit import, logout, two-tab queue sync/audio ownership, corrupt data quarantine/reset, storage quota fallback, and account A/B isolation. TypeScript, ESLint, API contract check and production build passed. Existing smooth-scroll and aborted-prefetch browser notices are non-failing. No original database migrations were applied.

## P7.7 Complete UI

Create features/queue/components/{QueuePanel,QueueRow,QueueControls,QueueImportDialog}. Add PlayerBar toggle/count and responsive MUI drawer; show n/100, current/playing/paused, unavailable reasons, pending/retry/conflict/offline state. Actions: select/play, add, play-next, remove, clear, replace, remove unavailable.

Integrate catalogue rows/detail buttons and multi-select bulk add/replace; show remaining slots and confirmation before replacing a curated nonempty queue. Plain Play follows master selected/first occurrence/appending rule. Full queue still plays existing entries; new add refuses without audio changes. Loading catalogue/search pages never edits queue.

Reorder via keyboard move-up/down and drag-and-drop; use native controls/events or compatible direct dependency only if needed. Touch fallback must work. Focus remains sensible after row removal; announce position/errors through aria-live, handle Escape/focus trap and label repeated occurrences distinctly.

Gate: all queue commands work through UI and persisted API, not just reducer tests. Narrow screen/keyboard tests exercise drawer/reorder/overflow.

Execution result (2026-11-08): P7.7 verified. PlayerBar now exposes queue count/toggle and opens a responsive MUI drawer with occurrence rows, current/playing state, availability reasons, pending preview, retry, conflict refresh and clear confirmation. Rows support play/pause, remove, keyboard up/down controls and native drag reorder. The catalogue now separates plain Play from explicit append/play-next actions; audio-capable rows support multi-select append and confirmed replacement with remaining-capacity feedback. Track detail pages expose the same explicit queue actions. Queue overflow disables new additions without changing playback.

Queue reads now provide a fixed SSR snapshot for the initial hydration render, then subscribe to the current store state; this prevents catalogue action buttons from hydrating with mismatched disabled/tabIndex attributes. The full drawer remains keyboard operable and has a narrow mobile bottom-sheet layout; move controls provide the touch fallback.

Verification: TypeScript, ESLint, API contract check, 40 client unit tests and production build passed. All 15 Playwright browser scenarios passed, including queue reorder/play/remove/confirmed clear, multi-select add/replace, responsive keyboard reorder, persisted guest/account queues and real audio playback integration. Existing Next smooth-scroll console notice is non-failing. No original database migrations were applied.

## P7.8 Synchronization and lifecycle edge cases

Refetch account queue on focus, after conflicts and same-browser edit notifications. Re-resolve before selecting an unresolved entry; stale remote current-removal applies deterministic local removal without starting a paused device. No WebSockets or remote playback control.

On track deletion P4 invalidates public track data; queue hydrate/resolve returns unavailable without changing stored membership/revision. Offer removal; skip unavailable entries and handle all-unavailable queues. Offline account edits are not silently considered saved; retain canonical state and explicit retry. Request cancellation cannot overwrite newer snapshots.

Gate: concurrent edits/tabs/deletion, 401 expiry/429, pending logout and stale responses cannot cross account boundaries or create duplicate sessions/audio elements.

Execution result (2026-11-08): P7.8 verified. Authenticated queue adapters now revalidate on window focus, visible-tab transition and network recovery; BroadcastChannel forwards same-origin account writes to other tabs, while the server revision CAS remains authoritative. QueueStore ignores stale responses by generation/revision and clears selection if a refreshed occurrence is no longer playable, so remote deletion cannot autoplay a replacement on a paused tab. Existing pending mutations retain stable IDs for retry; 409 refreshes canonical state and requires deliberate action; 401 clears private queue state. Guest adapter already uses Web Locks/BroadcastChannel and online revalidation from P7.6.

Verification: a new store unit test confirms an unavailable refresh clears selection without changing membership. Browser coverage verifies account queue updates reach another tab without changing identity. Full client typecheck, ESLint, 41 unit tests, API contract check, production build and all 16 Playwright scenarios passed. No server/database migration was needed or applied.

## P7.9 Verification and checkpoint

Unit tests: reducer/helpers/browser-record parser/cap and idempotent command inputs. API integration: atomic CAS/index creation/auth/private caching/resolution and serialization. Browser: 100 entries across >100 catalogue tracks, reject 101, reorder/remove/add, duplicate track occurrences, refresh paused/manual resume, identity switch, two tabs, deletion and keyboard/mobile drawer.

Profile progress updates with 100 rows; queue membership components must not rerender for each audio timeupdate. Record measured evidence instead of adding a state library speculatively. Run full schema generation/drift/static/build/test checks. Update queue policy/session/retry/storage/rollback docs; additive collection/index migration leaves records available for forward repair.

Execution result (2026-11-08): P7.9 checkpoint completed. Client typecheck, ESLint, 41 unit tests, generated API contract check and `git diff --check` passed on the checkpoint. The production build and all 16 Playwright scenarios had passed in the P7.8 verification run. API/schema/integration coverage already exercises capacity boundaries through 100/101, CAS conflicts, authorization, resolution and serialization. The browser suite verifies cross-tab account synchronization, but does not yet exercise the complete 100-entry journey, deletion lifecycle, or every keyboard/mobile-drawer acceptance case. Those end-to-end cases remain explicit P8.4 work and are not claimed as passed here. Queue persistence/session/retry/guest-storage/rollback behavior and the unapplied migration status are recorded above; no migration was run against the original database. No progress-render profiling evidence was added, so P8 acceptance must collect it if the performance gate remains applicable.

P7 checkpoint: implementation and available phase gates are verified; deferred full user-journey and operational acceptance is tracked in P8.1–P8.8.

## P7.1 execution record

Added shared server queue policy, write/response DTOs and the embedded Mongoose Queue schema. Capacity is 100 including repeated occurrences; track duplication is intentional, entry UUID collisions (including case variants) are invalid. Revisions must be nonnegative safe integers. Stored entries have trackId plus a bounded server display snapshot; no URLs or playback state are persisted. Response entries add resolved PlayableTrack/null and availability/reason; absent queues use a virtual revision 0, empty entries and null updatedAt. userId is absent from write DTOs and will be derived solely from the actor in P7.2.

OpenAPI now includes queue models with maxItems=100, UUID/ObjectId patterns, required fields and capacity enum [100]. The metadata-only emitter registers these models before QueueController exists. Production bootstrap installs a 64 KiB JSON parser on /queue before Nest's default body parser. DTO and schema validation reject overflow before future service persistence; P7.2 must also call assertQueueWrite and use validated writes.

Migration 006 installs queue_user_unique with no empty queue backfill; 005 remains intentionally unused because legacy assignment was optional and no mapping was supplied. Migration/index tests on a disposable DB verify idempotent installation, no backfill and duplicate-owner rejection. No original database application occurred.

Verification: six policy/DTO/schema tests passed for 0/1/99/100/101 entries, distinct occurrences, colliding UUIDs, unsafe revisions and virtual empty state. All 41 replica-set integration tests passed. Typecheck, lint, build, OpenAPI/client generation and drift checks passed. Queue API/CAS and actual runtime hydration are P7.2; player/UI behavior remains on the existing implementation until P7.4–P7.7.

## P7.2 execution record

Added authenticated GET/PUT /queue with private/no-store responses. userId comes only from CurrentActor, including admin requests. QueueService validates/normalizes the bounded payload, hashes expectedRevision/mutationId/ordered entries, preserves existing entryId-to-trackId mappings and derives new display snapshots from projected active tracks. New unavailable tracks are rejected; existing unavailable entries may be retained or removed. No stored playback state or metadata-only revision changes are introduced.

Writes use a userId+revision compare-and-set, incrementing exactly once. First insertion relies on migration 006's unique userId index: duplicate-key losers become conflicts. A matching lastMutationId+hash returns canonical current data; reused IDs with changed payload fail. Intervening writes return QUEUE_CONFLICT rather than overwriting. Error envelopes include QUEUE_FULL, QUEUE_CONFLICT, QUEUE_ENTRY_INVALID and TRACK_UNAVAILABLE. General queue DTO validation failures map to queue-specific invalid/full codes; the shared error filter also recognizes bounded JSON parser overflow as 413.

TrackModule exports TrackReadService, which resolves at most 100 distinct IDs in one projected query. Queue hydration restores saved order/occurrences and returns no freshly read metadata for non-active tracks. Display snapshots remain available for deleted entries. The feature module graph has no reverse QueueModule import in TrackModule. Next queue transport and guest resolver remain P7.3.

Integration coverage includes concurrent first insert, concurrent writes from revision 1 at 99 entries, one winner/one conflict, idempotent retry, changed-payload retry rejection, overflow, unavailable new tracks, distinct duplicate occurrences, actor isolation with forged userId, retained unavailable entries and unchanged revision on hydration. Migration 006 must be applied before deploying queue writers to a real database; it remains unapplied to the original developer database.

## P7.3 execution record

Added public throttled POST /tracks/resolve with 1..100 distinct ObjectIds and ordered per-ID playable/unavailable results. It uses the existing single projected query, excludes non-active metadata and never increments listens. The static route is declared before dynamic track routes. Resolver JSON parsing is capped at 64 KiB in production bootstrap.

Next exposes POST /api/tracks/resolve and GET/PUT /api/queue. Queue routes use cookie-only authenticated transport, private/no-store responses, CSRF checks on PUT and a streaming 64 KiB request limit. Only expectedRevision/mutationId/entryId/trackId are forwarded; owner and snapshots cannot be supplied by the browser. Conflict/status/request-id propagation uses the shared proxy. Guest resolution requires the same Origin/custom header policy but sends no identity. The client resolver helper returns an empty result without HTTP for empty queues and deduplicates repeated occurrences into one bounded batch.

Verification: all 43 isolated integration tests passed, including resolver bounds/duplicates/deleted privacy/no-listen behavior. All 31 client tests passed, including BFF CSRF/overflow/forged-owner stripping/conflict preservation and empty-batch skipping. Server/client typecheck, lint, builds and OpenAPI/generated-client drift checks passed. Queue commands/store and UI integration follow P7.4 onward. No original database writes occurred.

## P7.4 execution record

Added occurrence-based pure queue commands/reducer, typed adapter contract, account API adapter, QueueStore, QueueProvider and hooks. Reducer operations cover append, play-next, replace, remove, reorder, clear and removeUnavailable, with explicit capacity/invalid-identity outcomes. Bulk overflow is rejected atomically. Occurrence IDs are allocated on deliberate creation, independently of track IDs. Removal selects the next playable entry at the old position, then the previous playable entry; reorder retains selection.

QueueStore exposes confirmed canonical data separately from a pending preview. It allows one save at a time and commits membership/selection only after confirmation. Network/429 retries reuse the original mutation ID, revision and occurrence list. A 409 discards the pending preview, refetches canonical state and requires explicit refresh/retry instead of overwriting it. Older revisions and completions after disposal are ignored. Authentication failure clears private canonical state. Adapter notifications are supported; persistent guest adapters and full focus/tab synchronization follow P7.6/P7.8.

Verification: all 38 client tests passed; boundary/sequence tests cover all commands, input immutability, duplicates, 100-entry cap, replacement overflow and selection. Deferred adapter tests prove no premature canonical commit, rejection of concurrent edits, stable retry IDs, conflict refetch and disposal isolation. Typecheck/lint/API contract checks and production build passed. This provider is intentionally not mounted into the current audio shell until P7.5 replaces the existing player queue in one change; the current UI still uses the interim player implementation.
