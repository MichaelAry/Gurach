# Commit series since 5aabc265

Prepared on 2026-11-10. Each numbered item is a separate commit in dependency order. Feature integration is completed by commit 30; intermediate commits are parts of this coordinated series.

## Validation

- Client: 90 unit tests, typecheck, lint and production build passed.
- Server: 117 unit tests, typecheck, lint and build passed.
- OpenAPI and generated client types match.
- P8 completion is recorded from the project owner confirmation; the above checks were rerun during handover.
- `server/static/` is excluded from the current Git tree and preserved on disk. Earlier history is unchanged.

## Commits

1. `chore(repo): stop tracking root dependencies`
   Remove installed root dependencies and obsolete root package manifests from version control; ignore generated and private local artifacts.

2. `chore(media): keep uploaded static files out of Git`
   Stop tracking the entire server/static directory and ignore future uploads. Preserve all media files on disk.

3. `chore(tooling): standardize runtime dependencies and package checks`
   Declare Node/npm engines, update Next.js to 16.4.5 and test dependencies, and add independent package checks and feature tooling commands.

4. `feat(config): validate environment and expose health checks`
   Validate runtime configuration, centralize API/static URL construction, provide environment templates and expose health checks.

5. `feat(dev): add isolated authenticated Mongo replica set`
   Provide a pinned local Mongo replica set with a separate app user, private credentials and isolated storage; parameterize the legacy Compose setup.

6. `test(infra): isolate integration databases and browser fixtures`
   Add disposable integration database safeguards and a browser API fixture, with isolated Next build and test output directories.

7. `feat(api): define response contracts and validate request DTOs`
   Replace implicit model JSON output with explicit response contracts and mappers, validate write DTOs and remove obsolete shared types and the empty album schema.

8. `feat(api): standardize errors and backend proxy transport`
   Introduce request IDs, bounded request/response parsing and consistent API errors; centralize backend transport, timeout and outage handling.

9. `feat(contracts): generate OpenAPI and detect contract drift`
   Generate the API document and browser types offline, and verify generated files against runtime contracts.

10. `feat(tracks): paginate catalogue and search with scoped cursors`
   Add strict cursor/count parsing and search-scoped cursors with pagination integration coverage.

11. `feat(catalogue): add incremental track loading and retry states`
   Load and append catalogue pages without duplicate IDs, retain data on errors and provide cancellable requests and accessible retry controls.

12. `feat(migrations): add audited migration runner`
   Provide audit, plan, apply, verify and rollback commands with a migration journal and test coverage.

13. `feat(auth): add registration authentication and server sessions`
   Implement registration, password hashing, login/logout, opaque server sessions, ownership permissions and role checks with authentication integration tests.

14. `feat(auth): add browser session boundary and login UI`
   Keep session tokens in HttpOnly cookies, enforce trusted browser mutations and add session context, login controls and safe return paths.

15. `feat(auth): add browser registration flow`
   Expose the registration BFF endpoint and public registration page using the shared authentication form.

16. `feat(auth): add account provisioning and ownership tools`
   Add explicit account/legacy-owner provisioning and make seeding require readable fixture paths, a private admin authorization file and bounded request rates.

17. `feat(media): validate and stage multipart uploads`
   Validate audio signatures and ffprobe metadata, decode covers with sharp, enforce upload limits and stage multipart files under admission control.

18. `feat(media): persist recoverable track lifecycle operations`
   Publish uploaded media with persistent operation leases and transactions; accept deletions through lifecycle transitions and recover interrupted work through maintenance and reconciliation.

19. `feat(cache): deliver durable track invalidation events`
   Deliver durable activation/deletion events to Next cache invalidation and preserve typed errors and request validation in track BFF handlers.

20. `feat(upload): add authenticated track upload form`
   Add a validated multipart upload form with authenticated submission, actionable API errors and browser coverage.

21. `refactor(comments): extract module and migrate parent references`
   Extract the comment module, migrate to a single parent reference, remove embedded track comment arrays and enforce transactional writes and owner permissions.

22. `feat(comments): add paginated comments and author controls`
   Add paginated comments, authenticated posting/deletion and retry handling through dedicated BFF endpoints.

23. `feat(queue): persist revision-safe account queues`
   Persist private queues with a 100-entry limit, optimistic revisions and mutation IDs; expose bounded random/resolve reads and queue BFF operations.

24. `feat(queue): add client store and guest synchronization`
   Implement queue commands, reducer/store and account adapters, guest persistence, conflict handling and explicit guest queue import.

25. `feat(player): integrate queue transport and guest audio ownership`
   Move the player into its feature module, connect playback to the queue store and coordinate guest audio ownership across browser tabs.

26. `feat(queue-ui): add queue panel and track actions`
   Add the queue panel, per-entry controls and track queue actions with browser journey coverage.

27. `feat(player): prefetch bounded audio ranges`
   Prefetch and serve audio ranges in bounded 256 KiB blocks with a 16 MiB shared cache and network fallback.

28. `feat(account): add history statistics and favorites API`
   Expose private uploads, listening history, statistics and favorites; record qualified playback with idempotent playback IDs and render the account dashboard with confirmed listen counts.

29. `feat(favorites): add saved tracks and player favorite actions`
   Add account-scoped favorite state, the favorites page and reusable favorite controls for tracks and the player.

30. `feat(app): integrate feature modules and refresh navigation`
   Wire backend feature modules and guarded track endpoints; compose viewer/favorites/listen/player providers and integrate comments, queue actions, ownership controls and refreshed navigation/player layouts.

31. `style(typography): use locally hosted Onest`
   Bundle the Onest variable font with its OFL license and apply consistent typography and form-control font inheritance.

32. `test(auth): verify production cookies over HTTPS`
   Run the production session-cookie journey through a dedicated HTTPS browser test setup.

33. `ci: check builds contracts integration and browser journeys`
   Check independent installs, static gates, unit tests, builds, contract drift, disposable Mongo integration and browser journeys in CI.

34. `docs: document setup architecture and completed P8 handover`
   Document reproducible setup, architecture and execution runbooks; record the project owner confirmation that P8 is complete without inventing additional test evidence.
