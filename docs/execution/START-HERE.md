# Gurach execution entry point

Audience: the implementation agent, including GPT-6 Luna. This is an instruction runbook to implement the approved plan. It is not a record of completed application changes.

## Start or resume

1. Read the repository's applicable AGENTS.md, [architecture plan](../implementation-plan.md), this file and [progress.json](progress.json).
2. Inspect the actual working tree before any edit. Earlier changes are already present, many uncommitted. Preserve them. Read the files named in the current step instead of assuming their contents match this document.
3. Select the first unverified step whose prerequisites are met. Read its phase file, implement the whole bounded step, run its specified checks, inspect the diff and record evidence in progress.json. Continue to the next step without requesting routine approval.
4. After each bounded step update progress before moving on. On restart inspect both code and evidence: do not blindly redo a migration or assume a previously recorded passing check remains valid after relevant edits.
5. Complete P0–P8, subject to real tool permissions and resource availability. User intent is implementation, not another architecture proposal. Do not stop after creating scaffolds, interfaces, tests or a partial UI.

## Scope and authority

- The existing application remains Next + Nest + MongoDB. The seven feature/infrastructure tasks are in ../implementation-plan.md; P0 prepares them and P8 verifies them.
- The phase files below resolve implementation details left open in the architecture plan. Use their defaults without asking about routine choices. If current source/API constraints make a default invalid, document the reason and use the smallest compatible alternative that preserves required behavior.
- Before changing Next code, read the relevant installed guides under client/node_modules/next/dist/docs/, as required by client/AGENTS.md. If dependencies are unavailable, restore them through P2's prerequisite repair, not a guessed Next API.
- Verify compatible package versions/engines/peer dependencies before adding a dependency. Pin resolved versions in lockfiles. No blanket upgrade, downgrade or framework replacement. Consult primary documentation for unfamiliar APIs.
- All shell commands below assume repository root unless a working directory is explicitly stated. Existing script commands work now; commands marked **new** are deliverables to create before invoking them.
- Work within the current checkout, preserve unrelated modifications and use narrowly scoped edits. Do not stash/reset/clean the tree, rewrite history, delete Mongo volumes, remove source assets or replace developer env files. Make no commits unless the user separately requests commits; use the ledger for checkpoints.
- Do not send messages, publish, deploy or expose dev services externally. Keep local/test services on loopback. Starting local project/test processes and installing required dependencies are part of implementation, subject to actual tool permissions.

## Execution map

| Phase | Read | Step IDs | Gate |
|---|---|---|---|
| P0 | [Baseline](P0-baseline.md) | P0.1–P0.5 | Preserved changes, known baseline and recovery evidence |
| P1 | [Pagination](P1-pagination.md) | P1.1–P1.6 | Reach all catalogue tracks; playback queue never exceeds 100 |
| P2 | [Reproducibility](P2-reproducibility.md) | P2.1–P2.7 | Fresh install/start/build and isolated transaction-capable DB |
| P3 | [Contracts](P3-contracts.md) | P3.1–P3.6 | Runtime/schema/generated types agree |
| P4 | [Files](P4-files.md) | P4.1–P4.8 | Validated media and recoverable operations/cache updates |
| P5 | [Comments](P5-comments.md) | P5.1–P5.7 | Single parent relationship and safe migration |
| P6 | [Authentication](P6-authentication.md) | P6.1–P6.7 | Permissions enforced through direct Nest and Next |
| P7 | [Queue](P7-queue.md) | P7.1–P7.9 | Complete persisted/API/UI queue integration, max 100 |
| P8 | [Acceptance](P8-acceptance.md) | P8.1–P8.6 | Clean-checkout end-to-end proof and handover |

P2 startup repair can run before P1 only when needed to get a runnable baseline; record that dependency exception. P3 creates the migration utility reused by P4–P7. P6 is local provisioned-account authentication, not an external identity integration. P7 replaces the temporary P1 queue snapshot behavior.

## Evidence and progress

progress.json is initially all pending. Each step has status pending, in_progress, verified or blocked, plus changedFiles, checks, artifacts and notes. A check records its exact command, working directory, outcome, timestamp and relevant artifact path. Keep evidence concise and redact secrets. Large logs, patches, dumps and private migration reports belong in ignored .local/ or an explicitly identified private artifact directory; do not commit sensitive source diffs or user data.

Use verified only after implementation and its required checks pass. If code is written but a real database/browser/tool is unavailable, keep the step blocked with notes distinguishing completed code from unverified behavior. Continue independent implementation/checks where useful; do not call dependent data migrations or overall completion verified.

Never infer a passing check from exit code 0 of a script that skipped its core work. Tests must assert behavior, have nonzero test counts and fail if required fixtures/services are absent. Avoid arbitrary coverage targets and broad retries to make flaky tests look green.

## Data changes

- Read-only audit and restore exercises can proceed independently. Never overwrite the developer database to test a migration.
- Migration apply defaults to an isolated clone/fixture database. Real developer-data apply requires a verified backup, explicit target DB, writer freeze and a non-ambiguous dry run. Implement and rehearse fully even if an unresolved data mapping prevents real apply.
- Ambiguous references go to reversible quarantine with before-images. Never invent ownership or silently discard records. An ambiguity may block the destructive contract step without blocking independent implementation.
- Secrets must never be in argv, shell history, generated OpenAPI, test reports or the progress ledger. Use process environment/private files/stdin as appropriate.
- Stop only processes launched by this run, by recorded PID/container identity. Never kill all node/docker processes.

## Shared conventions

- Public IDs remain _id and URLs remain audio/picture. Cursor pages use items/nextCursor. A queue holds entries, each with entryId and trackId; duplicate track occurrences are allowed.
- Required tests cover boundaries, races, retries and failures. Prefer unit tests for pure helpers, API integration tests for Mongo semantics and Playwright for real user workflows. Do not mirror every line with a mock test.
- Pass the current phase gate before advancing its dependent integration. Do not leave incompatible server/client contracts in a runnable checkpoint.
- If a required command fails due to environment, capture the actual error, diagnose it, use the tool's permitted approval flow if applicable, and record any remaining blocker. Do not weaken validation, remove tests or fabricate success.

## Completion response

Report implemented phases, actual check results, migration application target, changed behavior and any real remaining blockers. Link progress.json and the acceptance report. Do not describe code that only exists in this plan as implemented. There is no reliable promise that the entire project fits in one model turn: save resumable state whenever context or tool access interrupts execution.
