import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface OpenApiSchema {
  type?: string;
  nullable?: boolean;
  maxLength?: number;
  maxItems?: number;
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  $ref?: string;
  required?: string[];
  enum?: string[];
}

interface OpenApiDocument {
  openapi: string;
  servers: { url: string; description?: string }[];
  paths: Record<string, Record<string, { parameters?: { name: string; schema?: OpenApiSchema }[]; responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }> }>>;
  components: { schemas: Record<string, OpenApiSchema> };
}

const document = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../openapi.json', import.meta.url)), 'utf8'),
) as OpenApiDocument;

describe('generated OpenAPI document', () => {
  it('documents every registered API route with stable local server metadata', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.servers).toEqual([{ url: 'http://localhost:5000', description: 'Local development placeholder' }]);
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining([
      '/health/live', '/health/ready', '/tracks', '/tracks/search',
      '/tracks/{trackId}/comments', '/comments/{commentId}', '/tracks/{id}', '/tracks/{id}/listen',
    ]));
    expect(JSON.stringify(document)).not.toMatch(/passwordHash|mongodb:\/\/|localhost:\d+.*secret/i);
  });

  it('describes bounded pages and nullable track fields without exposing list-only details', () => {
    const pageItems = document.components.schemas.TrackListPage.properties?.items;
    expect(pageItems).toMatchObject({ type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/TrackListItem' } });
    const item = document.components.schemas.TrackListItem.properties ?? {};
    expect(item).not.toHaveProperty('lyrics');
    expect(item).not.toHaveProperty('comments');
    expect(item.artist.nullable).toBe(true);
    expect(item.audio.nullable).toBe(true);
    const detail = document.components.schemas.TrackDetail.properties ?? {};
    expect(detail.lyrics.nullable).toBe(true);
    expect(detail.ownerId.nullable).toBe(true);
    expect(document.components.schemas.CommentPage.properties?.items.maxItems).toBe(100);
  });

  it('documents multipart upload limits, cursor/filter bounds and API error envelopes', () => {
    const create = document.paths['/tracks'].post.responses;
    expect(create?.['413']?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ApiErrorDto');
    const query = document.paths['/tracks/search'].get.parameters ?? [];
    expect(query.find((parameter) => parameter.name === 'query')?.schema?.maxLength).toBe(200);
    expect(query.find((parameter) => parameter.name === 'cursor')?.schema?.maxLength).toBe(512);
    expect(document.components.schemas.ApiErrorDto.properties?.error.$ref).toBe('#/components/schemas/ApiErrorBodyDto');
    expect(document.components.schemas.ApiErrorBodyDto.properties?.fieldErrors.type).toBe('object');
  });
});
