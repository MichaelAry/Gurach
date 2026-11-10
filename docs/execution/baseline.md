# P0 baseline — 2026-11-08

Run on branch `main` at starting revision `5aabc265ff52ca049383624b110071f81b0aa4ac`. Source tree was already dirty before P0. The pre-execution tracked patch and file inventories are privately preserved under `.local/execution/p0/`; the refreshed restart inventory and Mongo/media recovery artifacts are under `.local/execution/p0/restart/`. `.local/` is ignored. These private archives are not source-controlled.

## Runtime and dependency map

- Node v24.21.0, npm 11.19.0, Docker server 28.5.1, Compose 2.40.3.
- Client and server each have package.json, package-lock.json and package-local node_modules. Client resolves its local Next 16.4.0 and TypeScript. Server has local TypeScript but no local Next.
- Existing changed package files: deleted root package.json and package-lock.json; changed server/package.json and server/package-lock.json; four modified tracked files in root node_modules. The latter contain VSCodium Console Ninja build hooks/checksums and generated hook comments, not project dependency patches. P2 must remove these environment-specific hooks from a fresh reproducible installation, preserving the before-image in the private P0 patch. Do not package them as application patches.
- Tracked node_modules files: 16,275. This includes source/generated dependency artifacts; P2 must remove them from Git's index after preserving the reviewed changes.
- Existing Mongo container: `my-app-mongodb`, image `mongo:latest`, port 27017. Its persistent data volume is `gurach_mongodb_data`; the second mounted volume is `/data/configdb`. It was already running when P0 began. Source Mongo is standalone, not a replica set.
- Server HTTP API at localhost:5000 did not respond during this baseline. No `mongodump`, `mongorestore`, `mongosh`, `mongod` or `ffprobe` is installed on the host; Mongo tools are available inside the container.
- Existing `server/static` contains 202 files across audio/picture, about 178 MiB.

## P2.1 dependency patch classification

The four pre-existing root `node_modules` edits were inspected against their surrounding source and package metadata:

| File | Classification | Evidence |
|---|---|---|
| `node_modules/@nestjs/core/index.js` | Accidental local instrumentation | The only diff is a VSCodium Console Ninja `buildHook` checksum. Root package is Nest Core 12.1.0; server resolves its installed copy from `server/node_modules/@nestjs/core/index.js`. |
| `node_modules/next/dist/compiled/webpack/bundle5.js` | Accidental local instrumentation | The only diff is a VSCodium Console Ninja `buildHook` checksum. Root Next is 16.4.1; client resolves its own version from `client/node_modules/next/package.json` (16.4.5 after the P1 startup repair). |
| `node_modules/next/dist/server/lib/start-server.js` | Accidental local instrumentation | The only diff is a VSCodium Console Ninja `buildHook` checksum. It is in the unused root Next copy, not the client-resolved package. |
| `node_modules/next/dist/build/webpack/loaders/next-swc-loader.js` | Accidental local instrumentation | The only diff adds generated hook comments around a line; the root copy is unused by the client. |

None is required application behavior, and none is a package-manager patch. The server and client package-local resolution paths were confirmed with `require.resolve`; the four root copies are not reached by either app. No files were copied into `patches/`. Keep the original instrumented working files intact until P2.2 removes the explicitly inventoried root dependency tree from the Git index; do not patch npm installs to recreate IDE instrumentation.

## P2.3 local Mongo topology and runtime configuration

Added a dedicated local topology via `node scripts/dev-db.mjs up` and `docker-compose.dev.yml`, isolated under Compose project `gurach-devdb` to prevent collision with the legacy `docker-compose.yml` service/container. It pins the exact Mongo image digest inspected in P0, publishes only `127.0.0.1:27028`, uses a persisted named data volume, single-node `rs0`, keyfile authentication, a bootstrap root, and an app user restricted to `gurach`. Private credentials/keyfile/restore config are generated under ignored `.local/mongo/` with restrictive permissions; existing or incomplete files are not overwritten. Restore uses a private config file and a container-internal URI, never a password argument. The P0 archive restored 106 tracks and 0 comments into this new volume. A down/up restart preserved 106/0 and the app user's committed transaction probe succeeded.

The original `my-app-mongodb` remains on the exact original `gurach_mongodb_data` volume and pinned image ID; it was not converted or used as the dev replica set. Readiness endpoints are `/health/live` and `/health/ready`; ready checks `hello.isWritablePrimary` and emits a generic 503 response. Nest enables shutdown hooks. Server numeric/HTTP/Mongo URI configuration is validated without echoing rejected values, client API URLs are normalized and restricted to HTTP(S), and startup exception text is passed through secret redaction. Templates no longer imply the Mongo bootstrap root credentials belong in server config.

P2.3 checks (2026-11-08): server 30 unit tests, typecheck, config tool, lint and build passed; client 8 unit tests, typecheck and lint passed; isolated API/Mongo suite passed 9 tests including both health endpoints; `PORT=0` config probe exited nonzero; restart probe found 106 tracks/0 comments; `git diff --check` and cached diff check passed. Both the legacy source container and new loopback-only dev container are running on separate ports/volumes.

## P2.5 clean-install reproduction

Captured the current working source (including tracked edits and intended untracked files) into a NUL-delimited 332-file manifest, excluding the five intentionally deleted paths, ignored/private `.local`, dependency trees and build output. Created two independent snapshots under `/tmp/gurach-p2-final.DH0FNV/{a,b}` outside this checkout; SHA-256 comparisons confirmed every manifest source file matches. `npm ci` succeeded for both client and server in both snapshots. Client and Nest/Express/Mongoose/Vitest module resolution was checked and points only inside the snapshot's own package-local `node_modules`, not to this project. Each snapshot passed client unit tests/typecheck/lint/production Next build and server unit tests/typecheck/tools config check/lint/Nest build. The isolated integration suite was separately run against a disposable Mongo container in the working checkout and passed 9 tests.

The fresh-install audit surfaced vulnerable runtime transitive packages. `npm audit fix` applied only semver-compatible server dependency updates; Vitest was updated to 4.1.12. The server production dependency audit now reports zero advisories. The remaining full server audit issues are dev-only: 2 high plus 2 low and 1 moderate through the non-runtime deployment tooling `@nestjs/mau` (fix requires a major downgrade); client has 8 moderate findings in the ESLint/type-aware lint toolchain, with npm proposing a major change. No force audit fixes were applied. Fresh `npm ci` reported these dev-only findings as well as an unapproved native resolver install-script warning; all builds still passed without invoking that script.

## P2.6 CI

Added `.github/workflows/ci.yml` with three least-privilege Ubuntu jobs: independent package install/static/unit/build gates, authenticated single-node `rs0` API/Mongo integration through the ephemeral runner, and Playwright Chromium browser smoke against a deterministic fixture API. Browser failure context is limited to the generated `client/test-results/` directory with seven-day artifact retention. The workflow does not upload env files, dumps, or local database artifacts. It uses immutable action commit pins verified against signed upstream releases: checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`, upload-artifact v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`.

P2.6 local checks (2026-11-08): authenticated replica-set `npm run test:isolated` passed 9 tests and removed its generated container/temp root; Chromium browser smoke passed 1 test in the official `mcr.microsoft.com/playwright:v1.65.0-noble` container. Client unit/typecheck/lint/build and server unit/typecheck/config tool/lint/build passed; workflow YAML parsed into the expected three jobs. GitHub-hosted execution has not been triggered from this local checkout and is not claimed. Local host Playwright initially lacked `libnspr4`; the browser run used the official Playwright container with the matching pinned 1.65.0 browser runtime.

Action release records: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2). The browser config launches the fixture API and Next together using Playwright's documented multiple-web-server support ([Playwright web server docs](https://playwright.dev/docs/test-webserver)).

## P2.7 checkpoint

README now documents exact Node/npm versions, authenticated Mongo bootstrap, host ports, app-user configuration, health checks, restart and backup boundaries, isolated tests, explicit seed settings, local checks and CI scope. It distinguishes the legacy source volume from the new dev topology, and states that remote GitHub workflow status is unverified until a push/PR runs it. No `.local` secrets or backups were added to source control. Final local config gates passed after these edits; both original and dev Mongo containers/volumes remain intact and separate.

## Source baseline checks

| Command | Result |
|---|---|
| `npm run lint --prefix server` | Pass |
| `npm run build --prefix server` | Pass |
| `npm run test --prefix server` | Pass: 1 file, 11 tests |
| `npm run lint --prefix client` | Pass |
| `./node_modules/.bin/tsc --noEmit --incremental false` from `client/` | Pass |
| `API_URL=http://127.0.0.1:59999 npm run build` from `client/` | Blocked: Turbopack CSS loader cannot open a local port (`Operation not permitted`). It reproduces the earlier environment failure. No Nest service was running at the test address. |

The Next build also reported that Next 16.4.0 has known security advisories. The official 14 Oct 2026 Next.js update lists critical affected App Router/Cache Components and SVG image-optimization issues and gives 16.4.1 as the patched October release. Next's advisories page also lists seven additional moderate advisories published 3 Nov 2026. Therefore do not treat 16.4.1 as verified current-safe: P2 must inspect the exact current official advisory/fixed release at implementation time, choose the compatible fixed 16.4 line, update the lockfile and direct/patched copies together, then rerun the client checks. This is pre-production, but the dependency issue is a P2 implementation item. Sources: [Next.js security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026), [Next.js security advisories](https://github.com/vercel/next.js/security/advisories).

## Database and media audit

A `mongodump` archive was made from the existing source container into `.local/execution/p0/restart/mongodb.archive`; static media was archived separately. `sha256sum -c` passed for both files. The archive was restored with `mongorestore --nsInclude='nest.*'` into a newly created disposable Mongo container bound only to 127.0.0.1:27028. The isolated restore reproduced 106 tracks and 0 comments, with 0 restore failures. The original data volume/container was not changed by the audit or restore.

Read-only aggregation of the source `nest` database found 106 tracks, 0 comments and only `tracks`/`comments` collections. All 106 tracks have no `duration` field; 5 lack optional audio and 5 lack optional picture. The documents have no reverse comment references, expected with zero comments. Of 212 possible media fields, 202 names are present and valid. All 202 files exist under the matching static folders; no unreferenced audio/picture files were found. Full path/reference inventory stays private in `media-references.json`; aggregate results are in `database-audit.json` and `media-audit.json`.

No migration applies to this dataset during P0. Source DB is standalone; P2's replica-set conversion needs a separately restored-volume rehearsal and must not modify this original volume. Real data is now backed up and restore-tested.

## P0 exit decision

P0 passes. The source/build failures are recorded with their reproducible evidence; P2 owns the client build/environment repair and current security update. Database backup/restore and media audit passed. Next implementation step: P1.1. P0 artifacts contain actual backups and must stay ignored/private; do not delete them before verifying later migration and restore gates.
