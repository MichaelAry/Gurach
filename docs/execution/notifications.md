# Private notifications (task 18)

Notifications are independent of `/home/activity`. They never read another user's
listening history or favorites. Only a friend request, its acceptance, or a new
comment on an owned track creates an inbox record. Legacy tracks without an owner
have no recipient; an actor never receives their own event.

## Persistence and visibility

Every record is upserted in the source MongoDB transaction, including acceptance
(which now uses a transaction). Failure rolls back both writes. Event keys are
`friend.requested:<request UUID>`, `friend.accepted:<request UUID>`, and
`track.commented:<comment ObjectId>`. The comment ID survives transaction retries.
A unique index makes repeating an event idempotent, preserving its original read
state. This requires the same replica set deployment as comments and friends.

Pages, unread counts and read mutations resolve current users, blocks, tracks and
comments. A block in either direction or a disabled/deleted actor hides the event.
Comment notifications require the original author, active playable track, current
track ownership and an existing non-quarantined comment. Incoming request events
are visible only while that particular request is pending. Acceptance events
remain historical after unfriending but respect current blocks. Hidden records
remain private in storage and do not contribute to unread counts. Unblocking can
make an otherwise valid event visible again.

## API and UI

- `GET /notifications?count=20&cursor=…`: at most 50 items, newest ID first;
  cursor is scoped to the authenticated recipient's inbox. Visibility is applied
  before the page limit.
- `GET /notifications/unread-count`: `{ count }` for currently visible unread items.
- `PUT /notifications/:id/read`: idempotent 204; another recipient's, hidden or
  missing notification returns 404. The initial read timestamp is retained.

All routes require the existing session and return `Cache-Control: private,
no-store`. Recipient identity always comes from authentication. Next routes under
`/api/notifications` use the session BFF and existing CSRF protection for PUT.
`/notifications` requires sign-in. The indicator beside SessionControls refreshes
on session confirmation, every 60 seconds and after marking an item read; errors
show an unknown count. The inbox supports refresh, pagination and retry. Discussion
links reuse `/tracks/:trackId#comment-:commentId`, including off-page comments.
There is no push or WebSocket transport.

## Migration and verification

Migration `010-notification-indexes` provisions the event uniqueness, recipient
pagination and unread indexes. Use the existing `db:migrate:plan`,
`db:migrate:apply`, and `db:migrate:verify` workflow. Startup also ensures these
indexes, following the account module's approach with global autoIndex disabled.
OpenAPI and generated client types include the three endpoints.

Existing type checks, builds, contract checks and affected lint checks were run.
An isolated MongoDB smoke run exercised all three transaction producers,
rollback on notification failure, duplicate event recording, recipient isolation,
pagination, read idempotency and visibility after blocking/deletion. No new test
files were added.
