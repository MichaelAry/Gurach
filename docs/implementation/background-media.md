# Durable audio processing (task 22)

The browser opts into background processing with `X-Gurach-Upload-Mode:
background` on `POST /api/tracks`. The BFF streams the bounded multipart body to
`POST /tracks/uploads`, which returns **202** with `operationId`, `trackId` and
`status: queued` after fsync of the private inputs and durable Mongo intent.
`GET /api/tracks/uploads/:operationId` proxies the authenticated, owner-only
`GET /tracks/uploads/:operationId`. Status is `queued`, `processing`, `published`
or `failed`, with a safe `errorCode` on failure. A track ID in a 202 is reserved;
it is playable only after `published`. No partial Track enters catalogue reads.
The form polls status without resending multipart and remembers the operation
in sessionStorage so a reload in the same tab resumes polling. Closing the tab
or aborting a browser request after acceptance does not cancel processing.

Compatibility is explicit: unmodified callers of `POST /tracks` and the BFF
without the mode header retain the synchronous **201 TrackDetail** contract.
The synchronous route also publishes compatible MP3, never the uploaded original;
its private request staging is discarded after completion. Existing published
track keys and URLs are unchanged. The new form uses the background
mode; older clients can migrate separately. OpenAPI describes both server
routes and the status response. No external broker or queue dependency is added.

## Worker and recovery

MaintenanceService's existing Mongo claim/lease/heartbeat and `maintenance:once`
handle `queued -> processing -> done` and failure `-> cleanup -> done`.
The result remains `published` or `failed` after cleanup. Each claim has a new
token, a 30-second lease and a 10-second heartbeat. Expired leases resume after
restart. At most three processing claims execute; retries use the existing
5-second exponential backoff. Invalid media and duplicate conflicts go directly
to cleanup. Cleanup keeps retrying with capped backoff on I/O outages so files
and quota holds are not silently abandoned. A one-hour quota expiry fences
activation and schedules cleanup. The API validates account availability again
when committing the reservation.

One worker processes one operation at a time per application process. FFmpeg
runs locally with one encoder/filter thread, a 120-second wall timeout and
prlimit bounds of 60 CPU seconds, 1 GiB address space and 50 MiB output.
`FFMPEG_PATH`, `FFPROBE_PATH`, `FPCALC_PATH` and `MEDIA_PRLIMIT_PATH` use the existing
system dependencies; missing dependencies fail closed. Output is MP3, 192 kb/s,
44.1 kHz stereo; originals are limited to one hour. Output is validated again,
and duration mismatch rejects size-limited/truncated output. Long/high-complexity
inputs can fail these limits; success is never reported for truncated audio.

Original audio and cover stay in the owner-only operation directory below
`MEDIA_STAGING_DIR`, outside `STATIC_DIR`. Only the compatible MP3 and public
cover are published. Static access still requires an active track reference;
originals have no public URL or download route. Deletion removes private inputs
as well as public files. Attempt-local encoded copies are removed before the
activation transaction, on normal failure, before retries and by recovery
housekeeping. Pre-publication identity, byte/PCM and whole-recording fingerprints
reuse tasks 02/13. Both source and encoded audio are checked against the active
catalogue; the existing unique indexes fence concurrent exact/identity conflicts.

Publication reuses preallocated keys. An existing target is accepted only if its
SHA-256 matches the attempted publication. Activation, quota commit, operation
completion and the single activation outbox event commit in one Mongo
transaction fenced by the current unexpired token. A retry after a partial copy
therefore does not insert a second track or event. Late filesystem writes from
a stale process remain subject to the existing media reconciliation procedure;
Mongo fencing and active-reference checks prevent their public activation.

Admission reserves a conservative **170 MiB**: original + encoded temporary +
public compatible audio (3 x 50 MiB), plus private and public covers (2 x 10 MiB).
Commit charges actual retained original audio, compatible audio and both cover
copies. Each accepted job occupies one track quota slot until publication or
cleanup. Failed cleanup releases reserved quota; deletion releases committed
quota after media removal. The existing 012 quota verification/backfill also
counts retained private inputs for published background jobs. No new database
index or migration application is required for the job states.

## Release and verification

Follow [task 20's runbook](../execution/migrations.md): freeze writers and workers,
drain operations, snapshot Mongo **and both media directories**, record checksums
and application SHA. `MEDIA_STAGING_DIR` now contains retained originals, not
just disposable temporary files; include it in encrypted backup and restore.
Restore all three together in an isolated target before starting maintenance.
Never restart the previous application version with new pending job states;
drain jobs first or restore the matching pre-release snapshots. Reconciliation
continues to protect all non-done operation keys and never sweeps staging by age.

On an actual deployment, verify the public `PUBLIC_URL` through its configured
reverse proxy: full GET/HEAD Content-Type `audio/mpeg`, ranged GET **206** with
correct `Content-Range`/length, browser playback and a seek into the middle of the
track. Also check an old URL and that private input paths return 404. Do not
configure the proxy to serve `MEDIA_STAGING_DIR` or bypass active-media checks.
Local verification uses an actual streaming HTTP proxy in front of Nest and
Chromium playback/seek; deployment-specific proxy configuration still requires
the same smoke check at release time.

Verified locally for this change: server/client typechecks and production builds;
server lint and lint of the changed client files; OpenAPI/client contract drift;
117 server and 136 client unit checks; seven existing upload/queue/audio-cache
browser checks (the existing upload fixture/assertion now follows 202 + polling).
The disposable authenticated replica-set suite passes 57/58 checks, including
all upload/recovery and migration checks. Its queue assertion at
`auth-permissions.e2e-spec.ts:80` also fails on an untouched `origin/main` archive.
Full client lint has a pre-existing `set-state-in-effect` error in
`TracksCatalogue.tsx` and an unused-variable warning in `BackButton.tsx`.

An isolated manual Nest + streaming HTTP proxy + Chromium check passed private
input retention/access denial, owner-only status, abandoned lease recovery,
retry after audio-only publication, stable keys, single activation event,
retained-byte quota, duplicate cleanup/quota release, three failed encoding
claims, original/public deletion, old WAV URL ranges, MP3 MIME/206/Content-Range
and seek/playback. No new test cases were added to the repository.
