import { mkdtemp, mkdir, rm, symlink, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import { coverThumbnail } from './cover-thumbnail.js';

let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  root = await mkdtemp(path.join(os.tmpdir(), 'gurach-thumbnail-'));
  await mkdir(path.join(root, 'picture'));
  const source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#986f53' } }).png().toBuffer();
  await writeFile(path.join(root, 'picture', 'cover.png'), source);
  return source;
}

it('creates bounded square WebP previews without modifying the original', async () => {
  const original = await fixture();
  for (const size of [48, 96, 144]) {
    const result = await coverThumbnail(root, 'cover.png', size);
    expect(await sharp(result).metadata()).toMatchObject({ format: 'webp', width: size, height: size });
    expect(result.length).toBeLessThan(original.length);
  }
  expect(await readFile(path.join(root, 'picture', 'cover.png'))).toEqual(original);
});

it('does not enlarge small images', async () => {
  await fixture();
  await sharp({ create: { width: 16, height: 16, channels: 3, background: '#fff' } }).png().toFile(path.join(root, 'picture', 'small.png'));
  expect(await sharp(await coverThumbnail(root, 'small.png', 96)).metadata()).toMatchObject({ width: 16, height: 16 });
});

it('queues a batch of covers instead of failing normal concurrent image loads', async () => {
  await fixture();
  const results = await Promise.all(Array.from({ length: 12 }, () => coverThumbnail(root, 'cover.png', 48)));
  for (const result of results) {
    expect(await sharp(result).metadata()).toMatchObject({ width: 48, height: 48 });
  }
});

it('rejects unsupported sizes, traversal, symlinks, missing and malformed files', async () => {
  await fixture();
  await symlink(path.join(root, 'picture', 'cover.png'), path.join(root, 'picture', 'link.png'));
  await writeFile(path.join(root, 'picture', 'bad.png'), 'bad image');
  for (const [name, size] of [['cover.png', 10000], ['../cover.png', 48], ['..', 48], ['link.png', 48], ['missing.png', 48], ['bad.png', 48]] as const) {
    await expect(coverThumbnail(root, name, size)).rejects.toThrow();
  }
});
