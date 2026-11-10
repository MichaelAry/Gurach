import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaValidatorService } from './media-validator.service.js';

const execFile = promisify(execFileCallback);
const tempDirectories: string[] = [];
const validator = new MediaValidatorService('ffprobe');

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gurach-media-'));
  tempDirectories.push(directory);
  return directory;
}

async function generateAudio(directory: string, extension: string, codec: string, format?: string): Promise<string> {
  const output = path.join(directory, `fixture.${extension}`);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25',
    '-vn', '-c:a', codec, '-t', '0.25',
  ];
  if (format) args.push('-f', format);
  args.push(output);
  await execFile('ffmpeg', args, { timeout: 15_000, maxBuffer: 1024 * 1024 });
  return output;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('MediaValidatorService', () => {
  it('reports a missing ffprobe as a server dependency failure rather than an invalid file', async () => {
    const directory = await makeTempDirectory();
    const audioPath = path.join(directory, 'signature.mp3');
    await writeFile(audioPath, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    await expect(new MediaValidatorService(path.join(directory, 'missing-ffprobe')).validateAudio(audioPath, 'signature.mp3'))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining('FFPROBE_PATH') });
  });
  it.each([
    ['mp3', 'libmp3lame', undefined],
    ['wav', 'pcm_s16le', undefined],
    ['ogg', 'libvorbis', undefined],
    ['oga', 'libvorbis', undefined],
    ['m4a', 'aac', 'ipod'],
    ['aac', 'aac', 'adts'],
    ['flac', 'flac', undefined],
  ])('accepts valid %s audio based on signature and ffprobe metadata', async (extension, codec, format) => {
    const directory = await makeTempDirectory();
    const filePath = await generateAudio(directory, extension, codec, format);
    const result = await validator.validateAudio(filePath, `track.${extension}`);
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.codec).toBeTruthy();
    expect(result.container).toBeTruthy();
  });

  it('rejects extension/signature mismatch, malformed audio and truncation', async () => {
    const directory = await makeTempDirectory();
    const wavPath = await generateAudio(directory, 'actual.wav', 'pcm_s16le');
    await expect(validator.validateAudio(wavPath, 'renamed.mp3')).rejects.toThrow(/match/);
    const truncatedPath = path.join(directory, 'truncated.wav');
    const wav = await readFile(wavPath);
    await writeFile(truncatedPath, wav.subarray(0, 64));
    await expect(validator.validateAudio(truncatedPath, 'truncated.wav')).rejects.toThrow();
    const playlistPath = path.join(directory, 'external.m3u');
    await writeFile(playlistPath, '#EXTM3U\nhttps://example.invalid/stream.mp3\n');
    await expect(validator.validateAudio(playlistPath, 'external.m3u')).rejects.toThrow();
  });

  it('uses a fixed no-shell ffprobe argument list and rejects excessive child output', async () => {
    const directory = await makeTempDirectory();
    const audioPath = path.join(directory, 'signature.mp3');
    await writeFile(audioPath, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    const argumentPath = path.join(directory, 'args.json');
    const probePath = path.join(directory, 'fake-ffprobe');
    await writeFile(probePath, [
      '#!/usr/bin/env node',
      "import { writeFileSync } from 'node:fs';",
      'writeFileSync(process.env.FFPROBE_TEST_ARGS, JSON.stringify(process.argv.slice(2)));',
      "process.stdout.write(JSON.stringify({streams:[{codec_type:'audio',codec_name:'mp3',duration:'1.25'}],format:{format_name:'mp3',duration:'1.25'}}));",
    ].join('\n'));
    await chmod(probePath, 0o700);
    process.env.FFPROBE_TEST_ARGS = argumentPath;
    try {
      const result = await new MediaValidatorService(probePath).validateAudio(audioPath, 'signature.mp3');
      expect(result.durationSeconds).toBe(1.25);
      const args = JSON.parse(await readFile(argumentPath, 'utf8')) as string[];
      expect(args).toContain('-protocol_whitelist');
      expect(args).toContain('file');
      expect(args.at(-1)).toBe(audioPath);
      expect(args).not.toContain('https');
    } finally {
      delete process.env.FFPROBE_TEST_ARGS;
    }

    const noisyProbe = path.join(directory, 'noisy-ffprobe');
    await writeFile(noisyProbe, '#!/usr/bin/env node\nprocess.stdout.write("x".repeat(1_100_000));\n');
    await chmod(noisyProbe, 0o700);
    await expect(new MediaValidatorService(noisyProbe).validateAudio(audioPath, 'signature.mp3'))
      .rejects.toThrow(/output exceeded/);
  });

  it.each(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'])('decodes synthetic %s covers', async (extension) => {
    const directory = await makeTempDirectory();
    const filePath = path.join(directory, `cover.${extension}`);
    const image = sharp({ create: { width: 8, height: 6, channels: 3, background: '#31a7d5' } });
    if (extension === 'jpg' || extension === 'jpeg') await image.jpeg().toFile(filePath);
    else if (extension === 'png') await image.png().toFile(filePath);
    else if (extension === 'webp') await image.webp().toFile(filePath);
    else if (extension === 'avif') await image.avif().toFile(filePath);
    else await image.gif().toFile(filePath);
    const result = await validator.validateCover(filePath, `cover.${extension}`);
    expect(result).toMatchObject({ width: 8, height: 6, pages: 1 });
  });

  it('rejects malformed covers and enforces the decoded pixel ceiling', async () => {
    const directory = await makeTempDirectory();
    const malformedPath = path.join(directory, 'bad.png');
    await writeFile(malformedPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await expect(validator.validateCover(malformedPath, 'bad.png')).rejects.toThrow();

    const largePath = path.join(directory, 'large.png');
    await sharp({ create: { width: 6500, height: 6500, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 }).toFile(largePath);
    await expect(validator.validateCover(largePath, 'large.png')).rejects.toThrow(/pixel/);
  });
});
