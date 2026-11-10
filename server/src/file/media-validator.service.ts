import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import {
  allowedExtension,
  assertMediaSize,
  FILE_POLICY,
  normalizeMediaExtension,
  type MediaKind,
} from './file-policy.js';

export interface AudioMetadata {
  durationSeconds: number;
  codec: string;
  container: string;
}

export interface CoverMetadata {
  width: number;
  height: number;
  format: string;
  pages: number;
}

export const FFPROBE_EXECUTABLE = Symbol('FFPROBE_EXECUTABLE');

interface ProbeResult {
  streams?: { codec_type?: unknown; codec_name?: unknown; duration?: unknown }[];
  format?: { format_name?: unknown; duration?: unknown };
}

@Injectable()
export class MediaValidatorService {
  private activeProbes = 0;
  private readonly probeWaiters: (() => void)[] = [];

  constructor(@Inject(FFPROBE_EXECUTABLE) private readonly ffprobePath: string) {}

  async validateAudio(filePath: string, originalName: string): Promise<AudioMetadata> {
    await this.validateRegularFile(filePath, 'audio');
    this.assertExtensionMatches('audio', originalName, await fileTypeFromFile(filePath));
    const result = await this.withProbeSlot(() => this.runProbe(filePath));
    const streams = result.streams ?? [];
    const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
    if (audioStreams.length === 0 || audioStreams.length !== streams.length) {
      throw new BadRequestException('Audio upload must contain audio streams only');
    }
    const durationSeconds = audioStreams
      .map((stream) => Number(stream.duration))
      .find((duration) => Number.isFinite(duration) && duration > 0)
      ?? Number(result.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new BadRequestException('Audio duration could not be validated');
    }
    const container = this.stringValue(result.format?.format_name);
    const codec = this.stringValue(audioStreams[0]?.codec_name);
    if (!container || !codec || !this.isAllowedContainer(originalName, container)) {
      throw new BadRequestException('Audio container or codec is unsupported');
    }
    return { durationSeconds, codec, container };
  }

  async validateCover(filePath: string, originalName: string): Promise<CoverMetadata> {
    await this.validateRegularFile(filePath, 'picture');
    const detected = await fileTypeFromFile(filePath);
    this.assertExtensionMatches('picture', originalName, detected);
    try {
      const image = sharp(filePath, {
        animated: true,
        pages: -1,
        limitInputPixels: FILE_POLICY.maxCoverPixels,
        sequentialRead: true,
      });
      const metadata = await image.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.pageHeight ?? metadata.height ?? 0;
      const pages = metadata.pages ?? 1;
      if (!metadata.format || width < 1 || height < 1 || pages < 1 || pages > FILE_POLICY.maxAnimatedCoverPages) {
        throw new BadRequestException('Cover image dimensions or frame count are invalid');
      }
      if (width * height * pages > FILE_POLICY.maxCoverPixels) {
        throw new BadRequestException('Cover image exceeds the decoded pixel limit');
      }
      // Decode all frames in bounded grayscale memory to reject truncated and malformed payloads.
      await image.clone().greyscale().raw().toBuffer();
      return { width, height, format: metadata.format, pages };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && /pixel|dimension/i.test(error.message)) {
        throw new BadRequestException('Cover image exceeds the decoded pixel limit');
      }
      throw new BadRequestException('Cover image is malformed or truncated');
    }
  }

  private async validateRegularFile(filePath: string, kind: MediaKind): Promise<void> {
    try {
      const stats = await lstat(filePath);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new BadRequestException('Uploaded media must be a regular file');
      try {
        assertMediaSize(kind, stats.size);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Uploaded media size is invalid');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Uploaded media file is unavailable');
    }
  }

  private assertExtensionMatches(
    kind: MediaKind,
    originalName: string,
    detected: { ext: string; mime: string } | undefined,
  ): void {
    const declared = path.extname(originalName).slice(1).toLowerCase();
    if (!allowedExtension(kind, declared) || !detected) {
      throw new BadRequestException('File extension or signature is unsupported');
    }
    const normalizedDetected = normalizeMediaExtension(detected.ext);
    const compatible = kind === 'audio' && declared === 'm4a' && normalizedDetected === 'mp4';
    if (normalizedDetected !== normalizeMediaExtension(declared) && !compatible) {
      throw new BadRequestException('File extension does not match its content signature');
    }
  }

  private async withProbeSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeProbes >= FILE_POLICY.maxConcurrentProbes) {
      await new Promise<void>((resolve) => this.probeWaiters.push(resolve));
    }
    this.activeProbes += 1;
    try {
      return await operation();
    } finally {
      this.activeProbes -= 1;
      this.probeWaiters.shift()?.();
    }
  }

  private runProbe(filePath: string): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffprobePath, [
        '-v', 'error',
        '-protocol_whitelist', 'file',
        '-analyzeduration', '10000000',
        '-probesize', '1048576',
        '-show_error',
        '-show_streams',
        '-show_format',
        '-of', 'json',
        filePath,
      ], { shell: false, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      const chunks: Buffer[] = [];
      let outputBytes = 0;
      let failure: Error | undefined;
      const timeout = setTimeout(() => {
        failure = new Error('Media probe timed out');
        child.kill('SIGKILL');
      }, FILE_POLICY.probeTimeoutMs);
      timeout.unref();

      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > FILE_POLICY.maxProbeOutputBytes) {
          failure = new Error('Media probe output exceeded its limit');
          child.kill('SIGKILL');
          return;
        }
        chunks.push(chunk);
      });
      child.once('error', () => {
        clearTimeout(timeout);
        reject(new ServiceUnavailableException('Audio validation tool is unavailable; configure FFPROBE_PATH'));
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (failure) {
          reject(new BadRequestException(failure.message));
          return;
        }
        if (code !== 0) {
          reject(new BadRequestException('Audio file is invalid or truncated'));
          return;
        }
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks, outputBytes).toString('utf8'));
          if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid probe result');
          resolve(parsed as ProbeResult);
        } catch {
          reject(new BadRequestException('Audio validation tool returned invalid metadata'));
        }
      });
    });
  }

  private isAllowedContainer(originalName: string, container: string): boolean {
    const extension = normalizeMediaExtension(path.extname(originalName));
    const containers = container.split(',').map((item) => item.trim().toLowerCase());
    const expected: Readonly<Record<string, readonly string[]>> = {
      mp3: ['mp3'], wav: ['wav'], ogg: ['ogg'], m4a: ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'],
      aac: ['aac'], flac: ['flac'],
    };
    return (expected[extension] ?? []).some((candidate) => containers.includes(candidate));
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
