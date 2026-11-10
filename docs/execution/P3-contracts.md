# P3 — transport contracts, runtime errors and generated client types

Prerequisites: P1 page API and P2 tools/build/DB. This phase also supplies migration tools used by P4–P7.

## P3.1 Response DTOs and write validation

Add concrete response classes under server/src/contracts/ and track/dto/. Define PlayableTrack, TrackListItem, TrackDetail, CommentResponse, concrete cursor page classes, ListenResult and DeletionAccepted. OpenAPI generic pages require concrete schemas; do not assume a TypeScript generic emits runtime metadata.

TrackDetail: list fields plus lyrics:string|null and ownerId:string|null. Comments move to a bounded separate call. CommentResponse: _id, trackId, authorId:string|null, username, text, rating:number|null, createdAt:string|null. Map track_id internally to public trackId. Dates are ISO UTC. Legacy missing media/duration/timestamps normalize to null without hidden mutation.

Add ownerId/authorId nullable schema fields. Do not assign a user before P6. Validate trimmed name/artist <=200, username <=64, comment <=5000; lyrics <=100000 while preserving its line/leading formatting. Required fields reject whitespace-only values. Multipart duration converts only a finite non-negative decimal string; no global implicit conversion.

Gate: endpoint tests assert normalized nulls, IDs, media URLs and boundary validation on real serialized JSON.

## P3.2 Mappers and query consistency

Expand P1 mapper for every track return path: list/search/create/detail. Remove toJSON public transforms only when no endpoint still relies on them. API must work with lean/plain records and hydrated records through explicit mappers.

Move search to bounded cursor pages with normalized filters embedded via a stable hash in a scoped cursor. Preserve escaped regex matching and default ordering. Reject a cursor reused with another filter. Cap query/filter string sizes; no raw Mongo operators.

Introduce bounded legacy comment reads now (existing module/service) so detail no longer populates all comments. P5 later changes storage and canonical routes. Client must never display the first-page length as a total.

Gate: no endpoint returns comment ObjectIds instead of comment DTOs; list excludes comments/lyrics; detail independently renders its first comment page.

## P3.3 Error boundary and request IDs

Create common/api-error.filter.ts, contracts/api-error.dto.ts and request-ID middleware. Accept only a bounded sanitized request ID or generate UUID. Translate Nest/class-validator/Multer/Mongoose failures into the master plan envelope; normal unexpected failures use a generic message. Log structured private diagnostics, not secrets.

Required codes/statuses: VALIDATION_ERROR/400, NOT_FOUND/404, CONFLICT/409, PAYLOAD_TOO_LARGE/413, UNSUPPORTED_MEDIA_TYPE/415, UNAUTHORIZED/401, FORBIDDEN/403, RATE_LIMITED/429, INTERNAL_ERROR/500; BFF adds BACKEND_UNAVAILABLE/502 and BACKEND_TIMEOUT/504. Preserve Retry-After.

Update backend.ts and all client readers/error UI to decode/handle this shape. Forward only approved headers. Propagate a caller abort signal and bounded timeout without turning unknown errors into false 404/empty success.

Gate: actual HTTP tests exercise statuses, validation field errors, request IDs and no stack/credential disclosure. Upstream 4xx remain 4xx through Next.

## P3.4 Offline schema emission

Add direct compatible @nestjs/swagger dependency and a pinned openapi-typescript client dev dependency after checking peer compatibility. Create server/scripts/openapi.ts and contracts/document.module.ts.

The document-only module registers the REAL controller classes and response DTOs with inert application-service/provider substitutes; it imports no Mongoose connection, maintenance timer or filesystem startup module. Substitute dependencies/guards needed to instantiate metadata only. Never import the production AppModule and wait for Mongo during generation. Put shared controller registry/decorators where both runtime/docs builds use them, so a newly added controller cannot be forgotten silently.

Use SwaggerModule.createDocument and write a stable sorted OpenAPI JSON. Apply required runtime prefix/version settings before emission. No timestamps/host secrets in output. The emitter establishes a document-only environment before dynamically importing controllers/config (static imports run too early); it never changes the environment of the real server process. Use fixed non-secret placeholder URLs in generated examples. Extract application HTTP configuration from main.ts if needed; document-only defaults do not weaken production env validation.

Create script `openapi:generate` using tools:build and compiled emitter. Offline means no listening socket and no DB/network calls; tests enforce it. Validate the generated document independently, including required/nullability/array limits.

Gate: production startup still uses real services; emitter succeeds with Mongo unavailable and no secrets.

## P3.5 Generation, runtime schema verification and drift

Commit server/openapi.json and client/lib/api/schema.d.ts. New client script `api:generate` reads ../server/openapi.json, emits deterministic declarations. Application aliases may live in features/*/types.ts; remove handwritten duplicate transport definitions in client/types/track.ts after updating every import. Keep UI state types separate.

Create `contracts:check` (server or root wrapper) that generates into a temporary directory and compares byte-normalized output, not git diff alone (generated files may still be untracked during implementation). Validate representative HTTP responses against OpenAPI-derived schemas with the pinned test validator. Do not claim compile-time types validate fetch JSON.

Extend CI to fail schema/type drift. No browser runtime import of Nest/Mongoose/node-only modules.

Gate: modifying a DTO without regeneration fails drift check; regeneration restores it. Real responses match the document.

## P3.6 Migration framework and checkpoint

Create scripts/lib/migration-context.ts, migration-journal.ts and scripts/migrate.ts. New commands: `db:audit`, `db:migrate:plan`, `db:migrate:apply`, `db:migrate:verify`, all via compiled tools. Arguments include --migration, --database, --batch-size, --checkpoint, --report and --dry-run where applicable. Connection/credentials come from private env. Require an explicit apply flag and target; defaults are read-only/test-safe.

Journal stores migration version, target identity, row ID, expected old values, before-image, outcome and checkpoint. Resume uses compare-and-set and verifies already-applied records. No unbounded all-dataset transaction. Apply rejects mismatched target/checkpoint. Reports with user data are private; tracked reports contain only counts/checksums.

Run P3 static/schema/runtime checks and migration-framework dry-run/resume/idempotency tests. Later phases add named migration implementations rather than ad hoc scripts.

Primary API documentation for schema generation: [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction). Recheck the installed package version before coding; the requirement to isolate infrastructure is a project design choice.
