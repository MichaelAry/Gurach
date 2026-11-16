# Track metadata editing

`PATCH /tracks/:id` accepts only the editable DTO fields `name`, `artist`, and
`text`. Omitted fields stay unchanged; empty strings clear artist or lyrics.
Names and artists use the same trim rules and comparison normalizer as upload.
Only an owner or administrator can edit an active track. Display fields and
identity keys commit together with a `track.updated` cache event. Unique-index
races return the same `TRACK_DUPLICATE` / 409 envelope as upload. Media,
fingerprints, uploader, IDs, and counters are never included in the update.

## Cache invalidation convention (including task 17)

`client/lib/server/track-cache.ts` is the shared invalidation entry point for
successful browser writes and authenticated durable cache-event callbacks.
It immediately expires `tracks` and `track:<lowercase-id>`. Deletion additionally
expires `track-comments:<id>`. Updates use a unique `<UUID-v4>:updated` event ID,
so every committed edit can retry delivery independently after a lost response.

The home endpoints currently use `no-store` and have no public cache tags.
When task 17 introduces public home caches, add their tags to this helper;
upload, metadata edits, deletion events and retries must use the same helper.
Keep personal home/account data outside shared caches. The account editor
updates the saved row locally and refreshes the Next router after success.

## Validation

- Server unit tests: 117/117; client unit tests: 136/136.
- Both typechecks, server lint/build, lint of changed client sources and generated
  contract consistency checks pass. Existing account Playwright smoke: 2/2.
- Mongo integration: 56/58, with the same two failures reproduced on the starting
  `origin/main`: queue initialization expects an empty queue despite automatic
  entries, and the revoked-session test receives 429 instead of 401.
- Full client lint still fails on the existing synchronous effect in
  `TracksCatalogue.tsx`. Production prerendering fails because root layout reads
  locale cookies outside Suspense; reproduced on the starting `origin/main`.
- Media checks use the existing local FFmpeg/Chromaprint binaries. No tests added.
