import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { env } from '../common/env.js';
import { allowedExtension, canonicalMimeType, normalizeMediaExtension } from './file-policy.js';

export enum FileType {
  AUDIO = 'audio',
  PICTURE = 'picture',
}

export interface FileTypeConfig {
  dir: string;
  mimeTypes: Readonly<Record<string, string>>;
}

export interface StoredFile {
  name: string;
  dir: string;
  ext: string;
  size: number;
  mimeType: string;
}

export type AllocatedFile = Omit<StoredFile, 'size'>;

const FILE_TYPE_CONFIG: Record<FileType, FileTypeConfig> = {
  [FileType.AUDIO]: {
    dir: 'audio',
    mimeTypes: {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.oga': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
    },
  },
  [FileType.PICTURE]: {
    dir: 'picture',
    mimeTypes: {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.gif': 'image/gif',
    },
  },
};

const UUID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  private readonly staticDir = env.staticDir;

  allocateFile(type: FileType, originalName: string): AllocatedFile {
    const { ext, mimeType } = this.getMediaType(type, originalName);
    const config = this.getConfig(type);
    const name = `${randomUUID()}${ext}`;
    this.resolveStoredPath(name, type);
    return { name, dir: config.dir, ext, mimeType };
  }

  async publishStagedFile(
    type: FileType,
    stagedPath: string,
    originalName: string,
    allocatedName: string,
  ): Promise<StoredFile> {
    const allocated = this.validateAllocatedFile(type, originalName, allocatedName);

    try {
      const sourceStats = await fs.lstat(stagedPath);
      if (!sourceStats.isFile() || sourceStats.isSymbolicLink() || sourceStats.size <= 0) {
        throw new BadRequestException('Staged media is not a regular non-empty file');
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException('Staged media is unavailable');
    }

    const targetPath = this.resolveStoredPath(allocated.name, type);
    const directory = path.dirname(targetPath);
    try {
      await fs.mkdir(directory, { recursive: true });
      const temporaryPath = path.join(directory, `.pending-${randomUUID()}.upload`);
      let temporaryHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
      let sourceHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
      let linked = false;
      let temporaryCreated = false;
      try {
        temporaryHandle = await fs.open(
          temporaryPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        temporaryCreated = true;
        sourceHandle = await fs.open(stagedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        await pipeline(
          sourceHandle.createReadStream({ autoClose: true }),
          temporaryHandle.createWriteStream({ autoClose: true }),
        );
        sourceHandle = undefined;
        temporaryHandle = undefined;
        temporaryHandle = await fs.open(temporaryPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        await temporaryHandle.sync();
        await temporaryHandle.close();
        temporaryHandle = undefined;
        await fs.link(temporaryPath, targetPath);
        linked = true;
        await fs.unlink(temporaryPath);
        const directoryHandle = await fs.open(directory, constants.O_RDONLY);
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
        return { ...allocated, size: (await fs.stat(targetPath)).size };
      } catch (error) {
        if (linked) await fs.unlink(targetPath).catch(() => undefined);
        throw error;
      } finally {
        await sourceHandle?.close().catch(() => undefined);
        await temporaryHandle?.close().catch(() => undefined);
        if (temporaryCreated) await fs.unlink(temporaryPath).catch(() => undefined);
      }
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async removeFile(name: string, type: FileType): Promise<void> {
    try {
      await fs.unlink(this.resolveStoredPath(name, type));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.rethrow(error);
      }
    }
  }

  resolveStoredPath(name: string, type: FileType): string {
    const config = this.getConfig(type);
    const ext = path.extname(name).toLowerCase();

    const storedNameRe = new RegExp(`^${UUID_SOURCE}${escapeRegex(ext)}$`);

    if (
      path.basename(name) !== name ||
      !config.mimeTypes[ext] ||
      !storedNameRe.test(name)
    ) {
      throw new BadRequestException(`Invalid file name: "${name}"`);
    }

    return path.join(this.staticDir, config.dir, name);
  }

  private getConfig(type: FileType): FileTypeConfig {
    const config = FILE_TYPE_CONFIG[type];

    if (!config) {
      throw new BadRequestException(`Unsupported file type: "${type}"`);
    }

    return config;
  }

  private getMediaType(type: FileType, originalName: string): Pick<AllocatedFile, 'ext' | 'mimeType'> {
    const kind = type === FileType.AUDIO ? 'audio' : 'picture';
    const declaredExtension = path.extname(originalName).slice(1).toLowerCase();
    if (!allowedExtension(kind, declaredExtension)) {
      throw new BadRequestException('Unsupported media extension');
    }
    const ext = `.${normalizeMediaExtension(declaredExtension)}`;
    const mimeType = canonicalMimeType(kind, declaredExtension);
    if (!mimeType) throw new BadRequestException('Unsupported media type');
    return { ext, mimeType };
  }

  private validateAllocatedFile(type: FileType, originalName: string, name: string): AllocatedFile {
    const { ext, mimeType } = this.getMediaType(type, originalName);
    if (path.extname(name).toLowerCase() !== ext) {
      throw new BadRequestException('Allocated media key does not match the validated extension');
    }
    const storedPath = this.resolveStoredPath(name, type);
    return { name: path.basename(storedPath), dir: this.getConfig(type).dir, ext, mimeType };
  }

  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;

    this.logger.error(error);
    throw new HttpException(
      'Internal server error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
