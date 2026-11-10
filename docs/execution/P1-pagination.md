# P1 — cursor pagination and bounded playback snapshot

Prerequisite: P0 source baseline, runnable local dependencies; use isolated DB tests. Behavioral specification: ../implementation-plan.md P1.

## P1.1 DTO and cursor helpers

Create server/src/common/cursor.ts and server/src/track/dto/list-tracks-query.dto.ts. count: absent -> 20; otherwise decimal digits only, safe integer 1..100. cursor: absent -> first page; otherwise at most 512 ASCII characters before decoding. Reject repeated/array query values, empty values and supplied offset.

Cursor JSON is `{v:1,after:<24 lowercase hex>}` encoded base64url. Strictly validate shape/version/ObjectId; no arbitrary JSON query objects. Export pure encode/decode helpers and focused tests. Define generic cursor query validation so P3 search/P5 comments can add scope information without copying permissive code.

Gate: valid round trip; malformed/oversized/fractional/zero/101/repeated inputs fail with 400 before Mongo access.

## P1.2 Backend page and mapper

Modify track.controller.ts GET /tracks to consume DTO; modify track.service.ts to return a page. Use projected fields, sort _id ascending, _id > decoded boundary, limit count+1. No populate/comments/lyrics in list reads. Create track/mappers/track.mapper.ts for IDs, null defaults and static URLs (use current env/static URL utilities).

Add PlayableTrack/ListItem/Page TypeScript shapes provisionally; P3 adds OpenAPI. Update existing track.service.spec.ts for cursor semantics; retain listen tests. Preserve GET detail until P3. Update every actual /tracks caller to the new envelope in this phase.

Gate: API integration fixtures 0/1/20/21/40/41 return every static ID exactly once. Deleting the boundary track does not break traversal. Schema toJSON/lean differences cannot corrupt URLs.

## P1.3 Client reads and proxy

Replace getTracks with getTracksPage({cursor,count}); retain a temporary forwarding export only if an actual caller needs it during the same change, then remove it. Update client/app/api/tracks/route.ts to forward only count/cursor and preserve errors. Create client/features/tracks/types.ts for provisional aliases; move player props from ITrack to PlayableTrack without inventing missing comments fields.

Read installed Next cache/connection/Suspense guides. In the catalogue page, put an async component below Suspense; it awaits connection before calling the cached page read. No connection calls inside a use-cache function. Cache by function arguments and tag tracks. Build must not require Nest availability.

Gate: actual first-page response displays rows and upstream failure reaches the error UI.

## P1.4 Catalogue UI

Create TracksCatalogue.tsx and useTrackPages.ts in features/tracks. Own loaded pages, next cursor, one in-flight request and inline errors; deduplicate appended IDs without disturbing order. Add Load more, pending, retry and terminal states with Russian user-facing text matching the app. Keep abort/stale-request guards on unmount/reset. Empty success and error are different states.

Gate: repeated clicks cannot duplicate requests/results; page error preserves rows/cursor; keyboard can operate retry/load-more; navigating away cannot update a new catalogue instance.

## P1.5 Temporary player compatibility

Update PlayerProvider, PlayButton and PlayTrackButton. A catalogue play selection creates at most 100 loaded entries starting at that track; detail play creates one. The current track always belongs to the snapshot. Additional catalogue pages do not mutate that snapshot. Provide a visible queue-size/context hint; do not claim the entire catalogue is queued.

Do not build persistent queue management here: P7 replaces this behavior. Ensure changing queue/selection does not cause a second audio element or duplicate listen. If types change, update PlayerBar/TrackRow together.

Gate: browse >100 catalogue records and select a late track; snapshot <=100 and contains the selection; loading another page does not restart its audio.

## P1.6 Verification and checkpoint

Run server unit/API tests, client lint/typecheck and a build with unreachable API_URL (port reserved for this test). Add a browser test for 41-track pagination and playback not restarting during Load more. Fixture media is generated tiny test data, not copied private music.

New browser harness files: client/playwright.config.ts and client/tests/e2e/catalogue.spec.ts. Add the minimal necessary test dependency/scripts here if unavailable; P2 makes installation/CI reproducible. Use test IDs/roles, not brittle MUI classnames. Assert nonzero tests and real page responses.

Record exact commands/results, changed files and failure artifacts. Gate: the P1 acceptance cases in the architecture plan pass. There is no database migration and response rollback always pairs client/server.
