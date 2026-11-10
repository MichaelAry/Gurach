# P2 — reproducible installation, local infrastructure and CI

Prerequisite: P0 patch/source preservation. Normally integrate after P1; early repair is allowed only for a recorded startup blocker.

## P2.1 Preserve dependency behavior

Review each changed file under tracked root node_modules and compare to the exact package release. Record required/accidental/superseded classification and resolution paths. For required changes, keep minimal patch files under patches/ and a documented deterministic apply command; apply to the physical dependency copy used by the app, not a guessed root copy. A failed patch/version mismatch must fail installation, not be ignored.

Use existing framework configuration to eliminate a patch only after reproducing equivalent behavior/checks. Security/startup changes in patched dependencies warrant a specific explanation. Do not copy the entire installed node_modules to Git as a backup; private P0 artifacts already preserve it.

Gate: every original patch is either reproducibly retained or has evidence supporting removal.

## P2.2 Package layout and scripts

Keep client/server independent npm packages/lockfiles. If a root orchestrator is useful, use scripts without root framework dependencies; do not restore obsolete root dependencies merely because a deleted manifest is tracked. Pin the tested Node version using .node-version and engines after checking actual dependency engines. Record npm version in docs.

Add scripts where missing:

| Package | New script | Meaning |
|---|---|---|
| server | typecheck | tsc --noEmit with app/test config |
| server | tools:build | tsc -p tsconfig.tools.json |
| server | test:integration | API/Mongo tests with explicit isolated URI |
| client | typecheck | tsc --noEmit --incremental false |
| client | test | focused Vitest pure state/helper tests |
| client | test:e2e | Playwright browser suite |

Create server/tsconfig.tools.json: NodeNext, decorator metadata enabled, rootDir '.', outDir '.tools', includes src/scripts, excludes spec/test/generated output. Execute tools from compiled .tools/scripts/*.js; avoid assuming a TS runner supports Nest decorator metadata. Ignore .tools/. Put script wrappers in package.json only after they exist.

Remove node_modules/generated directories from the Git index using an explicit inspected path list; keep installed files on disk. Do not git reset or broad-delete anything. Ignore all nested generated outputs. No history rewrite.

Gate: git ls-files has no dependency/generated build directories, and preserved patches apply on npm ci.

## P2.3 Local replica set and env

Primary local topology: Nest/Next on host, single Mongo container on loopback. Define one pinned compatible Mongo image, a single-node rs0, persisted database and runtime keyfile, authenticated root bootstrap and an app user scoped to the application DB. Choose exact image from P0 evidence and a restore test; never downgrade an existing volume.

Create scripts/dev-db.mjs and docker/mongo/ bootstrap resources. They generate private keyfile/env material if absent, never overwrite developer values, initiate rs0 idempotently and wait for primary/auth readiness. Host URI uses localhost plus replicaSet=rs0 and directConnection=true; tests use their explicit mapped port/DB. Verify actual host/container connections rather than assuming Docker-only advertised hostnames work.

Rehearse using a NEW volume restored from backup. Preserve the original volume as rollback. Root variables and server .env template must agree; clearly distinguish bootstrap root vs application credentials. Configure env privately; no actual passwords in script arguments or logs.

Add validated positive/safe numeric fields, URL protocols and secret-redacted errors in common/env.ts and client/config/env.ts. Validate STATIC_DIR/staging separation later in P4. Add shutdown hooks and minimal health/readiness endpoints (readiness checks DB/primary access without exposing credentials).

Gate: host-run Nest authenticates, simple transaction commits, restart preserves data, invalid env fails fast and no template promises unauthenticated defaults against an authenticated Compose DB.

## P2.4 Isolation and recovery tooling

Create test-db/staging roots with an explicit gurach_test_ prefix. Test helpers refuse a non-test database and refuse filesystem cleanup outside their allocated temp roots. Use before/after lifecycle to close connections/processes even on failure. Never drop the default nest database in test teardown.

Document backup/restore with env/private config input and test it against the new replica-set topology. Update seed.sh to accept explicit media/count/API settings and honor throttling; retain no dependency on personal home filenames. Fixture provisioning uses an isolated DB helper rather than seed.sh against developer data.

Gate: normal app and test suite can run concurrently on separate DBs/ports and tests cannot erase app records.

## P2.5 Fresh-install proof

Create two fresh source snapshots outside the working installation, including intended untracked source changes, while excluding secrets, dependencies and build artifacts. A git archive of HEAD alone is insufficient in the currently dirty checkout. Enumerate intended files explicitly and record a manifest.

Run npm ci for client/server in both snapshots. Do not let Node resolve modules from the original project's parents. Check patch application, lint, typechecks, server build/tests and offline-Nest client build. Fix actual failures, including Next CSS tooling only when evidence identifies it. Do not remove tests to obtain green output.

Gate: both snapshots reproduce behavior from manifests/locks/patches and documented system tools alone.

## P2.6 CI

Add .github/workflows/ci.yml with installation caching by lockfiles, static checks, unit tests, an isolated authenticated replica-set integration job, client build without Nest and browser smoke job against the test stack. All services have health waits and per-job teardown. Upload sanitized failure artifacts; secrets/dumps are excluded.

P3 adds contract drift; P4 adds media fixtures/probe installation; P5–P7 extend the existing jobs. Local npm commands must reproduce CI checks. Do not pin an invented action version/digest: resolve a trusted released revision and record it.

Gate: workflow commands run locally; remote CI availability is recorded separately and is not fabricated.

## P2.7 Checkpoint

Run installation/static/build/test checks after the final config edit. Update README with exact bootstrap/start/test commands, Node/npm requirements, host vs container URLs, database migration cautions and patch maintenance. Record any tools that still require user/environment access. Existing volume and original env content remain intact.
