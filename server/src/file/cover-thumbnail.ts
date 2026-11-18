import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { FILE_POLICY } from './file-policy.js';

export const COVER_THUMBNAIL_SIZES = [48, 96, 144] as const;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  if (active < 2) { active++; return; }
  if (waiting.length >= 128) throw new Error('Thumbnail processing busy');
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

/** Small, first-frame previews; originals and the upload lifecycle stay intact. */
export async function coverThumbnail(root: string, name: string, size: number): Promise<Buffer> {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === '.' || name === '..'
    || !COVER_THUMBNAIL_SIZES.some((value) => value === size)) throw new Error('Invalid thumbnail');
  await acquire();
  try {
    const file = await fs.open(path.join(root, 'picture', name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size <= 0 || stat.size > FILE_POLICY.maxCoverBytes) throw new Error('Invalid cover');
      const input = await file.readFile();
      return await sharp(input, { limitInputPixels: FILE_POLICY.maxCoverPixels, sequentialRead: true })
        .rotate().resize(size, size, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    } finally { await file.close(); }
  } finally { release(); }
}
