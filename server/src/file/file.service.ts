import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export enum FileType {
  AUDIO = 'audio',
  PICTURE = 'picture',
}

export interface FileTypeConfig {
  dir: string;
  defaultExt: string;
  mimeTypes: Readonly<Record<string, string>>;
}

export interface StoredFile {
  name: string;
  dir: string;
  ext: string;
  size: number;
  mimeType: string;
}

const FILE_TYPE_CONFIG: Record<FileType, FileTypeConfig> = {
  [FileType.AUDIO]: {
    dir: 'audio',
    defaultExt: '.flac',
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
    defaultExt: '.jpg',
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

const MAX_NAME_ATTEMPTS = 5;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  private readonly staticDir = path.resolve(
    process.env.STATIC_DIR ?? path.join(process.cwd(), 'static'),
  );

  async createFile(
    type: FileType,
    file: Express.Multer.File | Buffer,
  ): Promise<StoredFile> {
    const config = this.getConfig(type);
    const data = Buffer.isBuffer(file) ? file : file.buffer;

    if (!Buffer.isBuffer(data)) {
      throw new BadRequestException('File buffer is missing');
    }

    const dir = path.join(this.staticDir, config.dir);
    await fs.mkdir(dir, { recursive: true });

    const ext = this.resolveExt(config, file);
    const mimeType = config.mimeTypes[ext] ?? 'application/octet-stream';

    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
      const name = `${randomUUID()}${ext}`;
      const filePath = path.join(dir, name);

      try {
        await fs.writeFile(filePath, data, { flag: 'wx' });

        return {
          name,
          dir: config.dir,
          ext,
          size: data.length,
          mimeType,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          this.rethrow(error);
        }
      }
    }

    throw new HttpException(
      'Failed to allocate a unique file name',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
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

  private resolveExt(
    config: FileTypeConfig,
    file: Express.Multer.File | Buffer,
  ): string {
    const originalName = Buffer.isBuffer(file) ? undefined : file.originalname;
    const ext = path.extname(originalName ?? '').toLowerCase();

    return config.mimeTypes[ext] ? ext : config.defaultExt;
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
