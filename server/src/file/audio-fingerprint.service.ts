import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { env } from '../common/env.js';
import { assertMediaSize } from './file-policy.js';

export const AUDIO_FINGERPRINT_VERSION = 'pcm-f64le-native-v1';
export const CHROMAPRINT_VERSION = 'chromaprint-2-11025-per-channel-v1';
const MAX_SECONDS = 3600;
const MAX_CHANNELS = 8;
const MAX_PCM_BYTES = MAX_SECONDS * 192000 * MAX_CHANNELS * 8;
const MAX_JSON_BYTES = 4 * 1024 * 1024;

export interface AudioFingerprint {
  version: string;
  chromaprintVersion: string;
  duration: number;
  sampleRate: number;
  channels: number;
  layout: string;
  chromaprints: number[][];
}
export interface AudioFingerprints {
  fileSha256: string;
  pcmSha256: string;
  audioFingerprint: AudioFingerprint;
}

/** Whole-recording comparison, deliberately conservative. No short excerpt matches.
 * Chromaprint has ~8 frames/second. Allow only ~2 seconds of codec delay, require
 * >=30 seconds and >=95% coverage of BOTH recordings, and compare every channel.
 */
export function similarAudio(a: AudioFingerprint, b: AudioFingerprint): boolean {
  if (a.chromaprintVersion !== CHROMAPRINT_VERSION || b.chromaprintVersion !== a.chromaprintVersion
    || a.channels !== b.channels || a.layout !== b.layout
    || Math.min(a.duration, b.duration) < 30
    || Math.abs(a.duration - b.duration) > Math.min(2, Math.max(a.duration, b.duration) * 0.01)
    || a.chromaprints.length !== a.channels || b.chromaprints.length !== b.channels) return false;
  // One common alignment across channels preserves their order and timing.
  for (let offset = -16; offset <= 16; offset += 1) {
    const matches = a.chromaprints.every((left, channel) => {
      const right = b.chromaprints[channel];
      const startA = Math.max(0, offset);
      const startB = Math.max(0, -offset);
      const count = Math.min(left.length - startA, right.length - startB);
      if (count < 200 || count / Math.max(left.length, right.length) < 0.95
        || new Set(left).size < 16 || new Set(right).size < 16) return false;
      let bits = 0;
      let good = 0;
      for (let i = 0; i < count; i += 1) {
        let value = (left[startA + i] ^ right[startB + i]) >>> 0;
        value -= (value >>> 1) & 0x55555555;
        value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
        const distance = (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
        bits += distance;
        if (distance <= 6) good += 1;
      }
      return bits / (32 * count) <= 0.12 && good / count >= 0.9;
    });
    if (matches) return true;
  }
  return false;
}

@Injectable()
export class AudioFingerprintService {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  async compute(filePath: string): Promise<AudioFingerprints> {
    if (!path.isAbsolute(filePath)) throw new BadRequestException('Audio fingerprint input must be a local absolute path');
    if (this.active >= 2) {
      if (this.waiters.length >= 8) throw new ServiceUnavailableException('Audio fingerprint workers are busy');
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else this.active += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    timer.unref();
    try {
      return await this.computeLocal(filePath, controller.signal);
    } finally {
      clearTimeout(timer);
      const next = this.waiters.shift();
      if (next) next(); else this.active -= 1;
    }
  }

  private async computeLocal(filePath: string, signal: AbortSignal): Promise<AudioFingerprints> {
    // An inherited, already-open regular file prevents path/URL interpretation and
    // symlink replacement. fpcalc sees ONLY raw PCM on stdin, never an input URL.
    const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) throw new BadRequestException('Audio fingerprint input must be a regular file');
      try { assertMediaSize('audio', stats.size); }
      catch { throw new BadRequestException('Audio fingerprint input exceeds the file size limit'); }
      const fileHash = createHash('sha256');
      for await (const chunk of handle.createReadStream({ start: 0, autoClose: false, signal })) fileHash.update(chunk);
      const input = ['-protocol_whitelist', 'file', '-format_whitelist', 'mp3,wav,ogg,mov,aac,flac',
        '-probesize', '1048576', '-analyzeduration', '10000000'];
      const probe = await this.jsonTool(env.ffprobePath, [
        '-v', 'error', ...input, '-show_entries', 'stream=codec_type,sample_rate,channels,channel_layout',
        '-of', 'json', '/proc/self/fd/3',
      ], handle.fd, signal);
      const streams = probe.streams as { codec_type?: string; sample_rate?: string; channels?: number; channel_layout?: string }[] | undefined;
      if (!Array.isArray(streams) || streams.length !== 1 || streams[0].codec_type !== 'audio') {
        throw new BadRequestException('Fingerprinting requires exactly one audio stream');
      }
      const sampleRate = Number(streams[0].sample_rate);
      const channels = Number(streams[0].channels);
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000
        || !Number.isInteger(channels) || channels < 1 || channels > MAX_CHANNELS) {
        throw new BadRequestException('Audio must have 1–8 channels and a sample rate of 8000–192000 Hz');
      }
      const layout = streams[0].channel_layout || (channels === 1 ? 'mono' : channels === 2 ? 'stereo' : `unspecified-${channels}`);
      const decode = ['-v', 'error', '-nostdin', '-xerror', '-max_alloc', '67108864', '-threads', '1',
        ...input, '-i', '/proc/self/fd/3', '-map', '0:a:0', '-vn', '-sn', '-dn',
        '-map_metadata', '-1', '-threads', '1', '-filter_threads', '1'];
      const pcmHash = createHash('sha256').update(`${AUDIO_FINGERPRINT_VERSION}\0${JSON.stringify([sampleRate, channels, layout])}\0`);
      let pcmBytes = 0;
      await this.consume(env.ffmpegPath, [...decode, '-c:a', 'pcm_f64le', '-f', 'f64le', 'pipe:1'], handle.fd, signal, (chunk) => {
        pcmBytes += chunk.length;
        if (pcmBytes > Math.min(MAX_PCM_BYTES, MAX_SECONDS * sampleRate * channels * 8)) {
          throw new BadRequestException('Decoded audio exceeds the one-hour limit');
        }
        pcmHash.update(chunk);
      });
      const duration = pcmBytes / (sampleRate * channels * 8);
      if (duration <= 0 || !Number.isInteger(pcmBytes / (channels * 8))) throw new BadRequestException('Audio decoded to invalid PCM');
      const chromaprints: number[][] = [];
      for (let channel = 0; channel < channels; channel += 1) {
        // Short clips still get both exact hashes. They cannot establish a
        // whole-recording approximate match and may be too short for fpcalc.
        if (duration < 30) { chromaprints.push([]); continue; }
        const decoder = this.start(env.ffmpegPath, [...decode,
          '-af', `pan=mono|c0=c${channel}`, '-ar', '11025', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1',
        ], handle.fd, signal);
        const calculator = this.start(env.fpcalcPath, [
          '-format', 's16le', '-rate', '11025', '-channels', '1', '-algorithm', '2',
          '-length', String(MAX_SECONDS + 1), '-raw', '-json', '-',
        ], handle.fd, signal);
        const chunks: Buffer[] = [];
        let bytes = 0;
        const output = async () => {
          for await (const chunk of calculator.child.stdout!) {
            bytes += (chunk as Buffer).length;
            if (bytes > MAX_JSON_BYTES) throw new BadRequestException('Chromaprint output exceeded its limit');
            chunks.push(chunk as Buffer);
          }
        };
        try {
          await Promise.all([decoder.done, calculator.done, output(), pipeline(decoder.child.stdout!, calculator.child.stdin!, { signal })]);
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { fingerprint?: unknown };
          if (!Array.isArray(result.fingerprint) || result.fingerprint.length > 30000
            || !result.fingerprint.every((value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) {
            throw new BadRequestException('Invalid Chromaprint output');
          }
          chromaprints.push(result.fingerprint as number[]);
        } finally {
          decoder.child.kill('SIGKILL'); calculator.child.kill('SIGKILL');
          await Promise.allSettled([decoder.done, calculator.done]);
        }
      }
      return {
        fileSha256: fileHash.digest('hex'),
        pcmSha256: `${AUDIO_FINGERPRINT_VERSION}:${pcmHash.digest('hex')}`,
        audioFingerprint: { version: AUDIO_FINGERPRINT_VERSION, chromaprintVersion: CHROMAPRINT_VERSION, duration, sampleRate, channels, layout, chromaprints },
      };
    } finally { await handle.close(); }
  }

  private start(executable: string, args: string[], fd: number, signal: AbortSignal) {
    if (signal.aborted) throw new BadRequestException('Audio fingerprinting timed out');
    // Linux util-linux prlimit enforces TOTAL process address space, unlike
    // FFmpeg -max_alloc (which only limits an individual allocation).
    const child = spawn(env.mediaPrlimitPath, ['--as=1073741824', '--cpu=60', '--core=0', '--', executable, ...args], {
      shell: false, stdio: ['pipe', 'pipe', 'ignore', fd], windowsHide: true,
      env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
    });
    const abort = () => child.kill('SIGKILL');
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 60_000);
    timer.unref();
    const done = new Promise<void>((resolve, reject) => {
      child.once('error', () => reject(new ServiceUnavailableException('Audio fingerprint tools are unavailable; configure FFPROBE_PATH, FFMPEG_PATH, FPCALC_PATH and MEDIA_PRLIMIT_PATH')));
      child.once('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (code === 126 || code === 127) reject(new ServiceUnavailableException('Audio fingerprint executable is unavailable'));
        else if (code !== 0 || signal.aborted) reject(new BadRequestException('Audio fingerprint decoding failed or exceeded its resource limits'));
        else resolve();
      });
    });
    // Attach immediately: stdout consumption may fail before the process exits.
    void done.catch(() => undefined);
    return { child, done };
  }

  private async consume(executable: string, args: string[], fd: number, signal: AbortSignal, consume: (chunk: Buffer) => void) {
    const process = this.start(executable, args, fd, signal);
    process.child.stdin!.end();
    try {
      await Promise.all([process.done, (async () => {
        for await (const chunk of process.child.stdout!) consume(chunk as Buffer);
      })()]);
    } finally { process.child.kill('SIGKILL'); await process.done.catch(() => undefined); }
  }

  private async jsonTool(executable: string, args: string[], fd: number, signal: AbortSignal): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    await this.consume(executable, args, fd, signal, (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_JSON_BYTES) throw new BadRequestException('Audio metadata exceeded its limit');
      chunks.push(chunk);
    });
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
    catch { throw new BadRequestException('Audio metadata is invalid'); }
  }
}
