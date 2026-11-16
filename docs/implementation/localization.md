# English and Russian localization

English (`en`) is the default; Russian (`ru`) has the same translation coverage.
The browser's `Accept-Language` does not override the application preference.

## Preference resolution

- Guests use `NEXT_LOCALE`, a host-scoped, SameSite=Lax cookie with Path=/ and
  a one-year lifetime. HTTPS adds Secure. Invalid or absent values default to en.
- On sign-in, an existing account preference takes priority over the browser.
  Otherwise, the current selection initializes the account preference atomically.
- Signed-in changes update the UI and cookie and PUT the account preference.
  A failed write leaves the browser selection in place and offers an explicit retry.
- Sign-out keeps the current browser language. Account changes invalidate stale
  synchronization results. Writes from one tab are serialized and superseded
  queued writes are skipped.
- BroadcastChannel propagates changes between open tabs in the same browser.
  Account settings are checked on window focus, so other devices pick up changes
  when returning to the application; this is not a push subscription.
- When the browser preference is absent but a session exists, request-scoped
  server rendering reads the account preference. No private session lookup is
  stored in a shared cache.

`User.preferredLocale` is optional and accepts en or ru. Existing documents need
no backfill, collection or index migration. An absent field means unset, not en.
The optional `initialize: true` write matches only an absent field, so a competing
initializer cannot replace an explicit preference. No deployment-time bulk write
is required.

## API

Authenticated, private, no-store endpoints:

- GET /account/preferences → `{ "preferredLocale": "en" | "ru" | null }`
- PUT /account/preferences with `{ "preferredLocale": "en" | "ru", "initialize"?: boolean }`
  → the preference that is currently stored.

Login and /auth/me expose the optional preferredLocale alongside existing public
identity fields. The Next /api/account/preferences boundary uses the current
session and the existing Origin and X-Gurach-Request checks. A client cannot
supply the account ID. OpenAPI and generated client types include the additions.

## Text and formatting

Messages live in client/messages/en.json and ru.json. Existing navigation, home
and notification namespaces are retained; the ui namespace contains the remaining
shared and feature messages with descriptive keys.

- useTranslations(namespace) and useText() use typed dictionary keys.
- getText() provides the same translation rules for Server Components and metadata.
- message(key, parameters) produces a deferred descriptor for errors and progress
  held in string-based asynchronous stores. useMessage() resolves it at display
  time, so an existing error changes language without repeating the request.
  Descriptors are internal UI values, not API responses or persistent user data.
- Error codes determine behavior and public translations. Upstream diagnostic
  text is not used as a public translation; request IDs remain available.
- Listen counts use Intl.NumberFormat and Intl.PluralRules. Dates use the selected
  locale and retain their original timezone semantics.
- MUI theme variants use enUS and ruRU. The root document language and metadata
  follow the selected locale. Native form validation has application translations.
- Track names, artists, usernames, display names, comments, lyrics, playlist names,
  filenames and other user content stay in their original language.

Language changes use React transitions and router.refresh rather than a full
page reload. Player, queue and form providers are not keyed by locale. Localized
layout shells wait for a request and declare instant=false; this avoids hydrating
prerendered default-English suspense content against a Russian client context.
Track/catalogue data caches remain language-independent.

## Checks

- npm run i18n:check --prefix client checks dictionary parity, nonempty values,
  parameter parity, static UI keys and inline Russian UI literals. It is part of
  npm test and therefore the existing CI client checks.
- client/i18n/messages.test.ts covers fallback selection, deferred/nested errors,
  public error handling, unchanged user content and English/Russian plural forms.
- The preference BFF tests cover CSRF, validation, session forwarding and no-store.
- server/test/account.e2e-spec.ts covers isolated preferences, legacy accounts,
  concurrent initialization and the session response against real MongoDB.
- client/tests/e2e/localization.spec.ts covers default English, cookie persistence,
  server text and metadata, form/error retention, tab synchronization, audio/queue
  retention, account restoration in another browser and failed-write retry.
- Existing browser smoke scenarios explicitly use a Russian locale cookie;
  localization scenarios clear it to verify the actual English default.

For local validation, run the usual typecheck, lint, tests, contract checks and
production builds from the root README. Browser tests require Chromium runtime
libraries; media tests require FFmpeg/ffprobe. Database tests use an isolated
replica set, never the development or production database.
