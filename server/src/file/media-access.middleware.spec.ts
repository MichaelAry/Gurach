import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import supertest from 'supertest';
import type { Request, Response } from 'express';
import type { Connection } from 'mongoose';
import { beforeEach, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({ staticDir: '/covers' }));
vi.mock('../common/env.js', () => ({ env: media }));
vi.mock('./cover-thumbnail.js', () => ({ COVER_THUMBNAIL_SIZES: [48, 96, 144], coverThumbnail: vi.fn() }));
import { coverThumbnail } from './cover-thumbnail.js';
import { MediaAccessMiddleware } from './media-access.middleware.js';

beforeEach(() => { vi.clearAllMocks(); });
async function request(method = 'GET', size: unknown = '96', removed = false, active = true) {
  const findOne = vi.fn().mockResolvedValueOnce(removed ? { _id: 'id' } : null).mockResolvedValueOnce(active ? { _id: 'id' } : null);
  const connection = { collection: () => ({ findOne }) } as unknown as Connection;
  const req = { originalUrl: '/static/picture/cover.png', method, query: size === null ? {} : { size } } as unknown as Request;
  const response = { setHeader: vi.fn(), sendStatus: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  await new MediaAccessMiddleware(connection).use(req, response as unknown as Response, next);
  return { response, next, findOne };
}

it('checks visibility before transforming, including on HEAD', async () => {
  for (const method of ['GET', 'HEAD']) {
    const removed = await request(method, '96', true);
    expect(removed.response.sendStatus).toHaveBeenCalledWith(404);
    const inactive = await request(method, '96', false, false);
    expect(inactive.response.sendStatus).toHaveBeenCalledWith(404);
  }
  expect(coverThumbnail).not.toHaveBeenCalled();
});

it('serves WebP with no shared cache and returns only headers for HEAD', async () => {
  const data = Buffer.from('webp');
  vi.mocked(coverThumbnail).mockResolvedValue(data);
  for (const method of ['GET', 'HEAD']) {
    const { response, next } = await request(method);
    expect(coverThumbnail).toHaveBeenCalledWith('/covers', 'cover.png', 96);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', data.length);
    expect(response.end).toHaveBeenCalledWith(method === 'HEAD' ? undefined : data);
    expect(next).not.toHaveBeenCalled();
  }
});

it('rejects arbitrary or repeated sizes without transforming', async () => {
  for (const size of ['10000', ['48', '96'], '096', '']) {
    expect((await request('GET', size)).response.sendStatus).toHaveBeenCalledWith(400);
  }
  expect(coverThumbnail).not.toHaveBeenCalled();
});

it('preserves original file delivery and contains processing errors', async () => {
  const original = await request('GET', null);
  expect(original.next).toHaveBeenCalled();
  vi.mocked(coverThumbnail).mockRejectedValue(new Error('decode failed'));
  expect((await request()).response.sendStatus).toHaveBeenCalledWith(503);
});

it('sets a Unicode attachment name only for the requested active audio track', async () => {
  const id = '000000000000000000000001';
  const req = {
    originalUrl: '/static/audio/audio.flac', method: 'GET', query: { download: id },
  } as unknown as Request;
  const findOne = vi.fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ _id: id })
    .mockResolvedValueOnce({ name: 'Море/небо', artist: 'Автор' });
  const connection = { collection: () => ({ findOne }) } as unknown as Connection;
  const response = { setHeader: vi.fn(), removeHeader: vi.fn(), sendStatus: vi.fn(), download: vi.fn() };
  const next = vi.fn();
  const middleware = new MediaAccessMiddleware(connection);
  await middleware.use(req, response as unknown as Response, next);
  expect(findOne.mock.calls[2][0]).toMatchObject({ audio: 'audio.flac', lifecycle: 'active' });
  expect(String(findOne.mock.calls[2][0]._id)).toBe(id);
  expect(response.download).toHaveBeenCalledWith(
    'audio.flac', 'Море_небо - Автор.flac', expect.objectContaining({ root: '/covers/audio' }), expect.any(Function),
  );
  response.download.mock.calls[0][3]({ status: 404 });
  expect(response.removeHeader).toHaveBeenCalledWith('Content-Disposition');
  expect(response.sendStatus).toHaveBeenCalledWith(404);
  expect(next).not.toHaveBeenCalled();

  response.download.mockClear();
  findOne.mockResolvedValueOnce({ _id: id });
  await middleware.use(req, response as unknown as Response, next);
  expect(response.download).not.toHaveBeenCalled();
  expect(response.sendStatus).toHaveBeenLastCalledWith(404);
});


it('streams the original audio bytes with a UTF-8 download name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gurach-download-'));
  media.staticDir = root;
  try {
    const content = Buffer.from([0, 12, 255, 32]);
    await mkdir(join(root, 'audio'));
    await writeFile(join(root, 'audio', 'sample.mp3'), content);
    const findOne = vi.fn().mockImplementation((query) => query.moderationRemovedAt ? null : { name: 'Море', artist: 'Автор' });
    const connection = { collection: () => ({ findOne }) } as unknown as Connection;
    const middleware = new MediaAccessMiddleware(connection);
    const express = createRequire(import.meta.url)('express') as typeof import('express');
    const app = express();
    app.use(middleware.use.bind(middleware));
    const url = '/static/audio/sample.mp3?download=000000000000000000000001';
    const response = await supertest(app).get(url).expect(200);
    const disposition = String(response.headers['content-disposition']);
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).toContain("filename*=UTF-8''" + encodeURIComponent('Море - Автор.mp3'));
    expect(response.body).toEqual(content);
    await supertest(app).get(url.replace('sample.mp3', 'missing.mp3')).expect(404);
  } finally {
    media.staticDir = '/covers';
    await rm(root, { recursive: true, force: true });
  }
});
