# P6 — local accounts, sessions, permissions and login

Prerequisites: P2 reproducible runtime, P3 ownership DTOs and P4/P5 mutation paths. Default is provisioned local accounts, no public signup/external identity decision required.

## P6.1 Users and password service

Create auth/schemas/user.schema.ts, auth/password.service.ts and provisioning CLI. Username policy: lowercase ASCII [a-z0-9_], 3..32 characters; normalized username unique index. Display name is trimmed 1..64 characters. Role user/admin, disabled flag, timestamps. No user-controlled role updates.

For a portable baseline use Node's asynchronous built-in scrypt rather than a native add-on. Policy: N=131072, r=8, p=1, maxmem=256 MiB, random salt >=16 bytes, derived key 64 bytes; store algorithm/version/parameters/salt/hash. Verify with timingSafeEqual after checking equal buffer lengths. Bound concurrent hashes initially to 2 and reject overload; never silently lower the work factor. Password input 15..128 Unicode code points and <=512 UTF-8 bytes; do not trim/normalize it. Benchmark actual latency/memory in P6.7. Dummy verification for unknown accounts uses the same cost.

These scrypt settings use an OWASP-listed configuration; Node requires maxmem to account for memory cost. See [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt) and [Node crypto.scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Recheck the pinned runtime behavior before implementation. Argon2id may be a later reviewed change; do not switch algorithms halfway through this phase without versioned hash handling.

Gate: two equal passwords have different salts, correct verifies, wrong/corrupt/unsupported hashes fail safely, async load is bounded, passwords never appear in logs or process arguments.

## P6.2 Session model and service

Add Session with userId, tokenHash (unique), expiresAt, revokedAt and timestamps. Generate 32 random token bytes, base64url to caller; store only SHA-256 token hash. TTL expiresAt index is cleanup only; every request checks expiry/revocation plus current user.disabled/role. Session lifetime 7 days, no sliding refresh initially.

login verifies credentials and returns raw token only to the calling Next server/explicit CLI client, with user DTO and expiry. Responses are private no-store. me returns public user/session data, never token/hash. logout revokes the current session; credential/session failures use generic consistent errors. Repeated logout clears browser cookie even when session already expired.

Create additive indexes through migration `004-auth-indexes`. No account is automatically created with a default password and no legacy ownership is automatically claimed.

Gate: revoked/expired tokens fail before Mongo TTL cleanup; disabling user takes effect next request; token material absent from stored sessions and user DTOs.

## P6.3 Nest routes, guard and permissions

Add auth.controller.ts with POST /auth/login, POST /auth/logout, GET /auth/me. Register a global session guard with explicit public-read/listen/login metadata; all existing mutation routes require identity by default. Bootstrap/provision commands run internally, not as public bypass endpoints.

Add CurrentActor parameter helper and permission service. Apply the master plan matrix to upload/comment creation/deletion, including null-owned legacy records being admin-only. Ignore/reject forged ownerId/authorId/username/role input; derive creation identity from actor and store username display snapshot for comments.

Permission guards run before multipart interception. Mutation query/transaction includes owner/state predicate so a prior UI/guard check is not the only enforcement. User cannot delete another user's comment just by owning its track. Missing actor ->401; authenticated insufficient rights ->403 according to the documented resource-disclosure policy.

Rate-limit login by account and trustworthy network source; do not trust browser-supplied forwarded headers. For local BFF identity use a fixed authenticated internal proxy trust boundary, or apply account limit in Nest plus source limit at BFF until deployment ingress is configured. Never solve shared-BFF-IP limits by unconditionally trusting X-Forwarded-For.

Gate: direct Nest requests cannot bypass permissions; all read routes/public media remain intentionally public; untrusted actor headers grant no rights.

## P6.4 Next session boundary

Create lib/server/session.ts and csrf.ts; app/api/auth/{login,logout,me}/route.ts. Browser cookie: gurach_session in dev; __Host-gurach_session in prod, HttpOnly, SameSite=Lax, Path=/, host-only, Secure in prod, expiry <=server expiry.

Browser mutation requests require Origin equal to configured APP_ORIGIN and X-Gurach-Request: 1. Check before reading multipart bodies. Include login/logout and queue/resolve POST in this policy; no reflected Origin/CORS wildcard. Next forwards only its cookie's token as Bearer to Nest, never browser Authorization/cookies wholesale. Login only sets cookie after successful Nest response; never send raw token back in JSON.

Server-only readers that need identity use uncached session lookup. No session/permission object inside shared track cache. Reject missing/untrusted browser Origin; documented CLI clients use direct Nest Bearer endpoints. Update backend transport to bound response reads/timeouts and preserve error envelopes/headers.

Gate: same-origin flow works; cross-origin/missing-header attempts fail; expired logout still clears cookie; browser JSON/React props contain no token.

## P6.5 Login UI and ownership controls

Implement actual /login form with username/password, pending/error state and sanitized local return URL (no //, external scheme or redirect through encoded variants). Add logout/session view in a stable main UI location. Use Russian visible strings matching existing UI. Handle 401/403 distinctly; retain unsent form content when sensible.

Hide/disable mutations according to uncached viewer identity, while Nest remains authoritative. If authentication routing changes mounts, define stopping/resuming player consistently; P7 handles identity switches and paused restoration. Do not introduce a second audio element to survive login.

Gate: login/logout/expired-session workflow works through browser BFF, valid return path works and malicious return path is refused.

## P6.6 Provisioning and legacy owner tools

Create compiled `auth:provision` CLI with explicit username/displayName/role and password via hidden input or stdin/private file; no argv password or default credentials. Existing account reports conflict unless explicit update operation is requested. Script should not print token/hash/password.

Optional `005-legacy-ownership` accepts a reviewed explicit mapping file, dry-runs IDs and verifies target users, journals before-images and applies only expected-null references. No username-to-author guessing. Seed tooling accepts explicit privileged identity/private input after P6; maintenance runs internally without a public admin endpoint.

Gate: idempotent bootstrap behavior, unique username race handling and null-owned legacy records remain readable/admin-manageable without false assignment.

## P6.7 Verification and checkpoint

API tests cover anonymous/A/B/admin matrix for every write/read path, forged fields, invalid credentials, expired/revoked sessions, disabled account, duplicate usernames and concurrent permission/state changes. Browser tests cover cookies, CSRF, return URLs, identity switch and no cached user leakage. Test production cookie attributes separately over HTTPS-capable fixture handling.

Benchmark hashing under configured concurrency and document memory/latency; do not use fast test parameters in runtime. Tests may inject a faster password service for unrelated permission tests, but at least one real-policy verification is required. Run schema/client regeneration, lint/typechecks/build/tests and update login/provision/role docs. If debugging disables login, writes stay closed, not publicly allowed.


## P6.1 execution record

Added User schema with normalized unique username, display name, user/admin role, disabled flag, timestamps and a passwordHash excluded from default queries. PasswordService uses asynchronous Node scrypt with N=131072/r=8/p=1, 256 MiB maxmem, random 16-byte salts and 64-byte keys. Stored parameters are versioned and checked before verification; concurrency is capped at two without a waiting queue. Unknown-account verification has the same derivation cost. Passwords are counted by Unicode code points and never trimmed or normalized.

Provision with `npm run auth:provision -- <username> <display-name> <user|admin> <database>` and password bytes from a private stdin source. Stdin is exact UTF-8: a final newline is part of the password. Do not type a literal password into a shell command. Duplicate accounts fail; this command does not update existing users. The CLI installs the unique index explicitly; migration 004 will centralize additive authentication indexes. No real account has been provisioned.

Verification: pinned Node 24.21.0, real-policy password test passed; typecheck, lint and tools compilation passed. Full hashing benchmarks remain P6.7.

## P6.2 execution record

Added AuthModule and SessionService with seven-day fixed sessions. Login returns a 32-byte random base64url token only from the internal service boundary; stored sessions contain SHA-256 token hashes. Public user/session projections are constructed explicitly and omit credentials, hashes and tokens. Every authentication reads expiry/revocation and the current user disabled flag and role; logout is idempotent. Unknown usernames use real-cost dummy verification. No HTTP auth endpoints exist yet: P6.3 adds private/no-store response headers and guards.

Migration 004 installs unique username/token-hash indexes and TTL expiry cleanup. It verifies index keys, uniqueness and TTL settings, and creates no account or ownership mappings. It remains unapplied to the original database. Integration verification uses only the disposable test target and covers login failures, token-at-rest protection, expiry before TTL cleanup, revocation, current role changes and disabling accounts.

## P6.3 implementation and disclosure policy

The global SessionGuard requires Bearer identity unless a handler explicitly declares public access. Catalogue/detail/comments, health and throttled listens remain public. Upload permission is checked before staging interception. Track ownership and comment authorship are derived from the session; forged body/header identity has no authority. Owners may delete their own records; admins may delete any record including null-owned legacy rows. Owning a track does not grant deletion rights over another author's comments. Missing resources return 404; existing resources owned by others return 403. Delete transactions include owner and lifecycle predicates.

Auth login/logout/me responses use private/no-store headers, including guard failures. Login is limited to five attempts per normalized account per minute with a bounded process-local map (10,000 keys) and five requests per observed network source per minute using Nest throttling. Forwarded headers are not trusted. These limits are local-process limits; multi-instance deployment requires a shared limiter. P6.4 adds the browser/BFF source boundary and credential transport.

Integration fixtures now create isolated admin sessions rather than bypassing the real guard. A dedicated direct-Nest suite covers anonymous upload/comment rejection, forged actor headers/fields, trusted comment display snapshots, author-vs-track-owner separation, foreign/legacy deletion rejection, admin and own-track deletion. Session expiry/revocation/disabled-account checks remain covered by P6.2. The broader browser and full cross-identity matrix are also checkpoint requirements in P6.7.

## P6.4 execution record

Next now owns the browser session boundary through server-only session helpers and login/logout/me BFF routes. Cookie names are gurach_session in development and __Host-gurach_session in production; options are HttpOnly, SameSite=Lax, Path=/, Secure in production, with no Domain. Expiry is capped by both the backend expiry and seven days. Login projects public user fields explicitly and never returns the raw token in browser JSON. Logout clears the cookie even when Nest rejects an expired session. Viewer session lookup is uncached.

Configure APP_ORIGIN to the exact browser origin without a trailing slash (required in production; development default http://localhost:3000). Browser mutations require that exact Origin plus X-Gurach-Request: 1, checked before reading bodies. This covers login/logout, comment writes/deletes, track deletes and public listen POST; the player now supplies the header. Future upload/queue BFF mutations must use the same check. Internal cache callbacks retain their separate secret-authenticated boundary. Direct CLI clients use Nest Bearer routes.

Authenticated proxy calls read only the server cookie token; browser Authorization and Cookie headers are discarded. Backend proxy response reads are capped at 1 MiB, with the existing ten-second fetch abort signal covering streaming response reads. Identity remains outside shared track caches. Login limits remain in Nest; its observed-source limiter is conservative for requests sharing a BFF source address and never trusts forwarded headers.

Verification: 26 client tests passed, including CSRF rejection, production cookie options, token omission, cookie-only forwarding, expired logout and oversized backend responses. Production build, typecheck/lint/API contract checks and three Docker browser regression scenarios passed. End-to-end login UI and HTTPS cookie browser verification remain P6.5/P6.7; current cookie policy is unit-verified.

## P6.5 execution record

The login form submits to the real BFF, shows pending and Russian status-specific errors, retains input after rejection and clears the password after success. Return destinations are restricted to local catalogue/detail/upload/root routes; external, protocol-relative, encoded, backslash/control-character and auth/API destinations fall back to /tracks. SessionControls displays the current viewer and logout in the main layout. Viewer data is fetched without caching on mount and focus, independently of public track caches. Anonymous users see a login link for uploads; the unfinished upload form is gated and its submit remains explicitly disabled. Comment authoring also remains disabled.

Player policy: navigating to the separate auth layout unmounts the main player and stops audio. Successful login starts a fresh main layout. Logout uses full navigation to /tracks, clearing in-memory viewer/player state; it does not auto-resume playback. There is one audio element. P7 owns persistent restoration and identity-switch queue policy.

Verification: 27 client unit tests, typecheck/lint and production build passed. Three existing Docker browser scenarios passed; the new login journey passed after correcting required-field and Next route-announcer selectors. It covers invalid credentials with retained username, successful cookie-backed login and local return, displayed identity, logout and cookie removal. HTTPS/expired-session browser coverage remains P6.7; production cookie attributes already have P6.4 unit coverage.

## P6.6 execution record and operator commands

Provisioning accepts the existing four positional fields: username, display name, user/admin role and explicit database. The optional final `--update` selects an update rather than creation. Password bytes come only from stdin; no password argument or default password exists. Redirect a private password file into `npm run auth:provision -- <username> <display-name> <role> <database> [--update]`. Stdin is exact UTF-8, including a final newline. Avoid literal secrets in shell history. Creation of an existing normalized username reports conflict without modifying it; concurrent creation is resolved by the unique index. Update requires an existing account, preserves disabled state and atomically revokes sessions while updating the password/display name/role. The command prints only a fixed outcome or sanitized error.

Seed requires AUTH_HEADER_FILE pointing to a readable owner-owned file with no group/other access. Its contents are an Authorization Bearer header for an explicitly provisioned admin session. curl reads the header file directly; the token value is never an argv argument. The script validates /auth/me role before uploads. Maintain this file privately, and never commit it. Maintenance remains an internal process, with no public administration endpoint.

The optional migration 005 is deliberately not registered: no reviewed legacy ownership mapping was provided. No username matching or first-admin assignment occurs. Null-owned tracks/comments remain public-readable and admin-manageable. If assignment is later requested, require an explicit reviewed ID-to-user mapping, dry-run validation, journaled before-images and expected-null updates; do not edit ownership ad hoc.

Verification includes real-policy concurrent provisioning (exactly one account), duplicate conflict, explicit update, preservation of disabled state and transactional session revocation on a disposable replica set. Typecheck/lint/tools build and shell syntax checks passed. No account or ownership change was applied to the original database, and no seed uploads were sent to a developer service.

## P6.7 checkpoint (in progress)

Fixed an observed credential race: login now conditionally writes the User with the exact verified passwordHash and disabled=false and creates its Session in the same transaction. The user write conflicts with provisioning updates/session revocation, preventing login using credentials replaced while hashing. A real replica-set test injects a password change during verification and confirms no session is created.

Measured on Node 24.21.0 in the current host environment: two concurrent real-policy scrypt hashes completed in 399 ms total. Process RSS sampled every 5 ms rose from 73 MiB baseline to 330 MiB peak. This is one paired sample, not a latency distribution or deployment capacity guarantee. Runtime policy and concurrency remain unchanged.

Current evidence: 36 isolated integration tests passed; five Docker browser scenarios passed, including CSRF rejection, unsafe return destination fallback, invalid-session UI and cookie clearing. The Docker server unit run passed 103 tests and exposed one outdated OpenAPI assertion that forbade the LoginDto password field; the assertion now forbids passwordHash and its three contract tests pass. Server typecheck/lint/build/contracts passed. Production-cookie attributes remain unit-verified only; HTTPS browser verification, broader identity-switch isolation and the exhaustive operation/actor matrix remain required before P6.7 is marked verified. Original database/index migration targets remain unapplied.

## P6.7 completed verification (2026-11-08)

The remaining checkpoint items are now verified. Direct-Nest parameterized checks cover public catalogue/search/detail/comments/listen and comment create/delete for anonymous, user A, user B and admin, including null-author comments. Existing tests cover own/foreign/null-owner track deletion, authenticated uploads, forged identity, disabled/revoked/expired sessions, provisioning races and credential replacement during login.

Browser verification passed six development-mode scenarios, including switching A→logout→B with no previous identity rendered, CSRF rejection, invalid-session cleanup and safe return destinations. A separate production Next build behind a local HTTPS reverse proxy passed the production-cookie browser test: __Host-gurach_session is host-only, Secure, HttpOnly, SameSite=Lax, Path=/, invisible to document.cookie and removed on logout. The fixture creates a one-day self-signed certificate in a temporary directory; no machine trust settings are changed. Run `npm run test:e2e:https` in the Playwright image (requires openssl). Normal E2E runs exclude this production-only spec.

Final results: 104 server unit tests passed with FFmpeg in Docker; 40 isolated replica-set integration tests passed; 27 client unit tests passed; 6 standard browser tests plus 1 production HTTPS browser test passed. Typechecks, lint, production builds and generated API drift checks passed. A flaky create/delete test was isolated from the fictitious external cache-callback domain with a local callback response; the integration suite now completes without that network dependency.

The paired scrypt sample remains 399 ms / 330 MiB peak RSS at concurrency two on Node 24.21.0 (single sample, 5 ms RSS sampling). No default accounts exist. No original database migration or legacy ownership assignment was performed; auth indexes 004 remain unapplied there. Local-process login limiters require shared storage before multi-instance deployment. Upload authoring UI is still explicitly unavailable; direct authenticated API upload is tested. Runtime writes remain guarded by default.
