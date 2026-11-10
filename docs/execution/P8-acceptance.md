# P8 — integrated acceptance and handover

Prerequisites: P1–P7 implementation complete and phase-specific required gates passing. P0 original-data recovery/apply status must be explicit. Use the isolated stack; do not turn acceptance into a destructive test of developer data.

## P8.1 Fresh-source installation and static gates

Create a fresh acceptance snapshot outside the original project's dependency ancestors using an explicit source manifest. Include intended untracked source/artifacts, generated contracts, scripts/patches and CI config; exclude private env/data, node_modules and build outputs. Record manifest hash and exact Node/npm/system tool versions.

Run from that snapshot:

```bash
npm ci --prefix server
npm ci --prefix client
npm run lint --prefix server
npm run typecheck --prefix server
npm run build --prefix server
npm run test --prefix server
npm run lint --prefix client
npm run typecheck --prefix client
npm run test --prefix client
npm run contracts:check --prefix server
npm run openapi:generate --prefix server
npm run api:generate --prefix client
```

`typecheck`, `tools`, generation and check scripts above are introduced in earlier phases. contracts:check must compare temp-regenerated outputs, not silently rewrite stale artifacts and then claim they were already current. Record an artifact drift check BEFORE any regenerating command that could hide it.

Gate: no ancestor dependency/global CLI required; no tracked node_modules/generated build files; required patches install deterministically.

Execution result (2026-11-08): P8.1 verified from `/home/michael/projects/Gurach-acceptance/p81`, outside the source tree. The explicit SHA-256 source manifest contains 379 files / 3,711,845 bytes and excludes generated/private state, ignored build outputs, and `server/static/audio` media data. Node v24.21.0, npm 11.19.0, Ubuntu 24.04.5 LTS (WSL2 kernel 6.6.87.2), Docker 28.5.1 and Compose 2.40.3 were recorded. Both `npm ci` commands passed. Server lint/typecheck/build passed; server unit tests passed 110/110 with FFmpeg/FFprobe 6.1.1-3ubuntu5 extracted under `/tmp` (no host package install). Client lint/typecheck passed and Vitest passed 41/41. Pre-generation `contracts:check` and `api:check` passed; OpenAPI and client API type generation completed; post-generation checks passed. Snapshot manifest hashes verified unchanged. npm emitted audit notices (server: 6 total including 3 high; client: 8 moderate) and install-script allowlist notices; these did not fail deterministic installs and are retained for security review. No database migration or original-data operation occurred. Evidence: `tool-versions.txt`, `source-manifest.json`, `source-manifest.sha256`, and `p81-result.json` beside the snapshot.

## P8.2 Database and migration evidence

Start an isolated authenticated replica set using P2 tooling. Restore a sanitized representative clone or fixture dataset with legacy reference cases and shared/missing media. Run migrations 001–006 through plan/apply/verify, interrupt selected batch runs and resume; rerun completed migrations as no-ops. Stop writers for contract migrations.

Prove backup restoration into another isolated DB and compare IDs/counts/checksums across active+quarantine/journal. Confirm preserved null ownership, lifecycle/index state and no runtime reverse arrays. Record target DB fingerprints/redacted names; never label original developer data migrated when only fixtures were processed.

Gate: all migration scripts have idempotency/recovery evidence. Any unapplied original-data migration is an explicitly listed remaining deployment/local-data step; it cannot be hidden under overall complete.

## P8.3 Offline build and running topology

With valid API_URL pointing to a deliberately unused loopback port, run the real production client build. Confirm the port has no Nest listener, and schema generation is independently offline. Start Nest and Next production processes on reserved test ports, record owned PIDs, wait for health/readiness and stop only those processes on completion.

Run `npm run test:integration --prefix server` against the isolated DB and `npm run test:e2e --prefix client` against this real Next/Nest stack. Verify 400/401/403/404/409/413/415/429/502/504 as applicable. For forced upstream failures restart only owned test process/proxy; do not tamper with developer servers. Validate request IDs and Retry-After propagation.

Gate: a production build is independent of live API, while runtime requests genuinely exercise BFF->Nest->Mongo/static instead of only mocked fetches.

## P8.4 User and queue journeys

Provide deterministic fixture identities A/B/admin and >100 tracks, with one valid playable format and cases for unavailable media. Generate credentials privately per run; do not commit real users/passwords. Browser flows must assert observable state/network/DB outcomes rather than only screenshots.

Required journeys:

1. Traverse 41 tracks in pages and a >100-track catalogue, retry a failed page, navigate to detail and independent comment pages, preserve playback while browsing.
2. Complete direct/BFF identity matrix, login/logout/expiry, safe redirects/CSRF and legacy admin-only deletions; no cached identity leakage.
3. Build a queue of 100 including repeated track occurrences, reject the 101st atomically, remove then append, reorder via keyboard and drag, play-next, clear/replace and refresh paused/manual resume.
4. Load another catalogue page without altering curated queue. Select next occurrence of the same track and observe restart; unrelated reorder must not restart or increment listens.
5. Exercise guest import/oversized merge, guest corruption/storage denial, two tabs with explicit playback takeover, two accounts and concurrent revisions. Pending logout/stale responses never restore another account's queue.
6. Delete a queued track and observe unavailable/skip/removal behavior; delete comments while paging and verify no fabricated total/duplicate rows. Verify zero/all-unavailable/terminal queue behavior.
7. Use keyboard and a narrow viewport for the drawer/focus/live announcements. Confirm one audio element across main pages and no hydration/login autoplay.

Gate: every journey has passing browser/API assertions and nonzero test counts; no fixture client bypasses the browser path when that path is under test.

## P8.5 Failure recovery and operation races

Inject failures around staged-file writes, publication, activation transaction, tombstone, individual unlink and cache-event delivery. Restart owned processes/workers, replay operations and verify convergence. Race comment creation vs parent deletion and two queue writes from one revision. Include worker lease expiry/stale ownership and repeated deletion/retry.

Assert: no partial active track; active/shared files protected; unfinished operations survive; deleted public metadata evicted after delivered event; no active orphan comment; stored queue<=100; idempotent retry semantics honest; no plaintext token/password in DB/logs/artifacts. Keep expected sanitized failures distinguishable from unexpected test errors.

Gate: assertions reflect real persisted state after recovery, not only mocked service call order. No skipped fault test may be described as passed.

## P8.6 Completion report and final review

Create docs/execution/acceptance-report.md using concise tables for phase/step result, command, environment, artifact and any limitation. Include migration apply target, rollback boundary, required system tools, queue policies, known live-data actions and measured playback/hash performance notes. Link private artifacts by safe path only; do not commit their contents.

Inspect final diff against P0 inventory, check unintended generated/secret files, run git diff --check and ensure all new application files are included in the intended source manifest. Do not stage/commit unless separately requested. Update README with actual verified commands and docs links, then update progress.json statuses/evidence.

Completion requires every applicable acceptance gate; blocked checks remain blocked with a precise next action. Respond with implemented behavior and actual validation, not a promise of future completion. If everything passes, state all P0–P8 done; if original-data apply remains outstanding, state exactly that and distinguish isolated proof from real-data migration.

## Completion status

The project owner confirmed all P8 steps complete on 2026-11-10. The execution tracker reflects that confirmation. This handover update does not add new test evidence for P8.2–P8.6.
