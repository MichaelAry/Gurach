# P0 — baseline and recovery

Prerequisite: none. Read ../implementation-plan.md section P0 and START-HERE.md.

## P0.1 Preserve and inventory

Create an ignored .local/execution/<run-id>/ directory, with a private backup/report subdirectory. Add only the narrow `.local/` ignore rule if missing. Capture git status, tracked/untracked path inventory and changed dependency patches before installing anything. Preserve untracked source files too; git diff alone does not capture them. Do not copy credentials to tracked artifacts. Record code baseline hash/dirty-state identity in progress.json.

Useful read-only commands: `git status --short`, `git diff --name-status`, `git ls-files node_modules`, `git ls-files --others --exclude-standard`. Store binary/source patches privately and record only locations/checksums in the ledger. Do not use a broad git add.

Deliverable: private recovery inventory sufficient to distinguish original changes from implementation changes; docs/execution/progress.json updated.

## P0.2 Runtime and dependency map

Read client/server manifests, lockfiles, tsconfigs, Nest/Next config, Compose/env templates and existing scripts. Record node/npm/docker availability and actual package resolution from client and server working directories. Use Node createRequire/require.resolve for packages and module metadata; avoid treating package exports restrictions as absence. Confirm server build entry point is dist/main.js.

Identify root node_modules patches and whether applications use those copies. Record package/version/path and patch purpose; do not reinstall/delete them yet. Record media root, DB topology and safe port reservations without printing secret-bearing URIs.

Deliverable: private environment report and a concise redacted summary in docs/execution/baseline.md (new).

## P0.3 Baseline checks

Run existing checks, recording failures separately from new regressions:

```bash
npm run lint --prefix server
npm run build --prefix server
npm run test --prefix server
npm run lint --prefix client
```

Client typecheck currently has no script: run its local node_modules/.bin/tsc with --noEmit --incremental false from client/. Run client build with an explicit valid API_URL and record whether a live Nest is required. Inspect previous Turbopack port/CSS failure if reproduced; do not delete loader configuration blindly.

If installed dependencies/tools are unusable, preserve P0.1 first, perform only necessary P2 repair, then resume. No remote deploy or uncontrolled dependency upgrade.

## P0.4 Data audit and recovery rehearsal

Create server/scripts/audit.ts and restore/inventory instructions, initially read-only. It must count actual tracks/comments, identify missing parents, reverse-reference disagreement, absent media and shared filenames; list only IDs/reasons in redacted summaries. Store full reports privately. Do not execute seed.sh against existing data.

Locate an existing mongod/Compose volume without exposing passwords. If accessible, dump to the private directory and restore into a fresh isolated database/volume; copy media into an isolated root and compare counts/checksums. If inaccessible, record the reason and create a reproducible fixture DB in P2. Implement the scripts now; do not label the real-data restore gate passed.

Use MONGODB_URI/private config rather than credentials in CLI arguments. Check availability of mongodump/mongorestore; document tool installation requirements if missing. Dumps are never tracked. No `docker compose down -v`.

## P0.5 Baseline gate

Verify original source changes and dependency patches are recoverable, no original files were removed, checks have explicit outcomes and data access limitations are recorded. Inventory callers of ITrack, getTracks, /tracks, comments, file methods and player hooks with rg. Update affected-path lists if current source differs.

P0 passes only with recovery evidence for any existing data that later apply operations will touch. Code work may continue against isolated fixtures when that real-data prerequisite is blocked; destructive real-data migration may not.
