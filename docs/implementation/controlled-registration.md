# Controlled public registration (task 21)

Registration stays disabled in Nest and the Next BFF by default. No live
configuration or database is changed by this commit. Provisioned accounts and
operator password/session recovery remain supported.

Before any future opt-in, rehearse the release procedure in
[the migration runbook](../execution/migrations.md) on a restored isolated Mongo
and media copy. Apply `012-controlled-registration` after 011 using the existing
preflight / fingerprint / writer-freeze / private-report / apply / verify workflow.
Readiness requires its completed version and all recovery, report, quota-expiry and media-access indexes. Drain
and reconcile unfinished uploads first. Keep API, seeds and workers stopped
through backfill and verification. Backfill journals each user's previous quota
fields and counts actual regular media files for active/deleting owned tracks;
missing or unsafe media blocks migration for operator reconciliation. Shared
media counts against every owning account. Ownerless legacy tracks remain
admin-managed. Restore Mongo and matching media together following task 20's
recovery procedure. The narrow quota rollback refuses changed quota fields;
it is not a release-wide rollback after reopening writers.

Configure `RECOVERY_DELIVERY_URL` and `RECOVERY_DELIVERY_SECRET` together. The URL
must use HTTPS; redirects are refused. The fixed trusted delivery adapter accepts
an authenticated POST with `{ email, purpose: "verify" | "reset", token,
expiresInSeconds }`. It must deliver to that email, redact request bodies and
Authorization from logs, and present the token in a form that POSTs through the
BFF (avoid query strings, analytics and referrers). No adapter URL or destination
comes from the recovery requester. A failed delivery invalidates that token;
the user can retry after one minute. Do not enable registration until actual
verification and reset delivery have been rehearsed. Configuration alone cannot
prove external delivery works.

Authenticated `POST /auth/recovery/channel` requires email and the current
password; it sends a verification challenge without changing the confirmed
channel. `POST /auth/recovery/verify` consumes `{ token }`, confirms the channel
and revokes sessions. The user logs in again. `POST /auth/recovery/request`
accepts `{ username }` and always returns the same 200 message for unknown,
disabled, unconfirmed, delivery-failed and eligible accounts. Only a previously
confirmed stored address receives reset instructions. `POST /auth/recovery/reset`
accepts `{ token, password }`. Tokens contain 256 random bits, expire after
15 minutes, and only SHA-256 hashes are stored. Consumption, password/channel
change, invalidation of remaining challenges and session revocation share one
transaction. Password provisioning also invalidates outstanding challenges.
Recovery email and quota fields are excluded from ordinary user projections.
Next exposes the same actions under `/api/auth/recovery/{action}` with origin/CSRF
checks and bounded JSON bodies. The existing registration form/API fields remain
username, displayName and password; users enroll a recovery channel after login.

Future enabling requires an explicit `PUBLIC_REGISTRATION_ENABLED=true` on both
Nest and Next. Nest refuses startup if recovery delivery is unconfigured.
Keep both values false on the real server during this task.

Uploads reserve the maximum audio plus cover size (60 MiB) and one track slot
before multipart staging. Defaults are 1 GiB and 1000 tracks per account, adjusted
with `ACCOUNT_QUOTA_MB` / `ACCOUNT_QUOTA_TRACKS`. Atomic account updates serialize
admission across processes. Publication converts the hold to actual bytes in the
same Mongo transaction as track activation. Parser, validation and publication
failures release uncommitted holds. The cleanup worker reclaims abandoned holds
after one hour, fences late publication and schedules unfinished media for the
existing cleanup workflow. Deleted tracks release committed usage only after
cleanup finalizes. Quota and deduplication checks both remain required.

Nest keeps Express trust proxy disabled. Rate limiting uses authenticated account
IDs; anonymous callers use the socket peer unless a fresh HMAC boundary proof is
valid. To distinguish anonymous users behind Next, configure the same random
`BFF_PROXY_SECRET` in Nest and Next, plus an independent `EDGE_PROXY_SECRET` in
Next and the trusted ingress. The ingress must overwrite `X-Real-IP` from its
verified transport peer and overwrite `X-Gurach-Edge-Secret`; block direct public
access to Next. Next verifies the ingress secret before signing IP and timestamp.
Nest accepts the proof for 30 seconds. Use private transport or TLS between these
services. Browser `X-Forwarded-For`, unsigned `X-Real-IP` and arbitrary authorization
values cannot select a limiter identity. Without this setup anonymous requests
share the conservative proxy-peer limit. Throttler counters remain process-local;
multiple API replicas need a shared throttler store or ingress aggregate limits.
Account quota reservations remain durable regardless of replica count.

Authenticated users may `POST /tracks/:id/reports` with `{ reason }`; the unique
track/reporter index makes repeats idempotent. Existing `admin` accounts serve as
moderators. `GET /tracks/reports` returns at most 100 open reports, newest first;
`POST /tracks/:id/unpublish` requires an admin and a reason. It records moderation
metadata, resolves open reports, moves the track out of active reads and enqueues
the existing durable deletion/cache invalidation workflow. Next provides matching
`/api/tracks` routes. Direct `/static/audio/*` and `/static/picture/*` GET, HEAD
and Range requests check publication before serving bytes and return no-store;
moderated keys are denied even before unlink, including shared keys. Do not serve
STATIC_DIR directly from nginx/CDN: all requests must pass this Nest boundary,
and invalidate any old CDN/browser caches when deploying. The audio worker clears
its old cache and checks online HEAD authorization before using cached bytes.
Offline playback of already downloaded windows remains available; previously downloaded bytes cannot be recalled. Friends and playlist privacy and
sharing tokens are unchanged.

## Validation in this task

Existing server unit tests: 117/117; client unit tests: 136/136. Server lint,
both TypeScript checks, both builds, configuration validation, OpenAPI/client
contract checks and lint of changed client files passed. Existing Playwright
login, upload and persistent/offline audio checks passed 9/9, using the locally
available browser libraries. No new test files were added.

The existing isolated Mongo suite passed 57/58. Its queue test expects an empty
revision-0 queue, while the existing QueueService initializes revision 1 with
random tracks. The same failure was reproduced from an archive of clean
`847d3360` (that baseline also has an account test hitting the old shared-IP
429 limit). No queue behavior was changed in this task. Whole-client lint still
fails on the pre-existing `react-hooks/set-state-in-effect` error in
`features/tracks/components/TracksCatalogue.tsx`, with an existing unused-variable
warning in `BackButton.tsx`; both files are unchanged.

A manual smoke run used the production Nest factory on another disposable,
authenticated Mongo replica set. It checked migration plan/apply/verify/no-op,
the disabled registration gate, confirmed-channel token hashing, expiry,
one-time use and old-session revocation, identical known/unknown recovery HTTP
responses, concurrent quota admission, reservation conversion/release, report
and moderator permissions, denial of direct GET/HEAD/Range after removal, and
signed-IP versus arbitrary forwarded-IP handling. Delivery used an in-memory
adapter substitute; actual external email delivery remains an operator rehearsal
before enabling registration. No live migration or registration enablement ran.
