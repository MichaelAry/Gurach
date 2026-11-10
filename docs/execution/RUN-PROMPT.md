# Implementation prompt

Select GPT-6 Luna in your interface and paste the text below. The repository files hold the implementation details; this prompt does not depend on the earlier conversation.

```text
Implement the Gurach project plan, not another analysis or planning pass.

Start by reading docs/execution/START-HERE.md, docs/implementation-plan.md,
docs/execution/progress.json and applicable AGENTS.md instructions.

Execute P0 through P8 in the documented order, using the phase runbooks.
Preserve existing uncommitted work and developer data. Use the specified
architecture/defaults without asking about routine implementation choices.
Complete the API, persistence, UI, migrations, scripts and verification for
each step. The playback queue must be fully integrated and capped at 100
entries in the API, database and UI, including guests/account transitions.

After each bounded step record changed files, exact check results,
artifacts and the next action in docs/execution/progress.json. Continue
with the next dependency-ready step; do not stop at scaffolding or a plan.
If a real tool/data/permission blocker prevents a required operation,
record it honestly and continue independent work without claiming the
blocked gate passed. Do not apply destructive migrations to developer data
without the documented backup/dry-run prerequisites.

On context restart resume from the ledger, inspect current code/evidence,
and avoid redoing completed migrations. Finish with the actual acceptance
report, implemented phases, check results and any remaining blockers.
```

To resume after an interrupted session:

```text
Resume implementing Gurach from docs/execution/START-HERE.md and
progress.json. Reconcile the ledger with current code, then continue the
first unfinished dependency-ready step through P8. Preserve existing work
and report only checks actually performed.
```
