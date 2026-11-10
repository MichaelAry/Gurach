import { Inject, Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import type { MediaKind } from './file-policy.js';

const OPERATION_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const STAGE_NAME: Readonly<Record<MediaKind, string>> = { audio: 'audio.upload', picture: 'picture.upload' };
export const MEDIA_STAGING_ROOT = Symbol('MEDIA_STAGING_ROOT');
export const MEDIA_PUBLIC_ROOT = Symbol('MEDIA_PUBLIC_ROOT');

export interface StagedFileHandle {
  readonly path: string;
  readonly handle: Awaited<ReturnType<typeof open>>;
}

@Injectable()
export class StagingService {
  constructor(
    @Inject(MEDIA_STAGING_ROOT) private readonly stagingRoot: string,
    @Inject(MEDIA_PUBLIC_ROOT) private readonly publicRoot: string,
  ) {}

  async createOperation(operationId: string): Promise<string> {
    this.validateOperationId(operationId);
    await this.ensurePrivateRoot();
    const operationPath = this.operationPath(operationId);
    await mkdir(operationPath, { mode: 0o700 });
    try {
      const stats = await lstat(operationPath);
      if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
        throw new Error('Staging operation directory must be private and cannot be a symlink');
      }
      const manifest = await open(path.join(operationPath, 'operation.json'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        await manifest.writeFile(JSON.stringify({ operationId, state: 'receiving', createdAt: new Date().toISOString() }));
        await manifest.sync();
      } finally {
        await manifest.close();
      }
      const operationHandle = await open(operationPath, constants.O_RDONLY);
      try {
        await operationHandle.sync();
      } finally {
        await operationHandle.close();
      }
      const rootHandle = await open(this.stagingRoot, constants.O_RDONLY);
      try {
        await rootHandle.sync();
      } finally {
        await rootHandle.close();
      }
    } catch (error) {
      await rm(operationPath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    return operationPath;
  }

  async createFile(operationId: string, kind: MediaKind): Promise<StagedFileHandle> {
    this.validateOperationId(operationId);
    const operationPath = this.operationPath(operationId);
    await this.assertPrivateDirectory(operationPath);
    const filePath = path.join(operationPath, STAGE_NAME[kind]);
    const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    return { path: filePath, handle };
  }

  async removeOperation(operationId: string): Promise<void> {
    this.validateOperationId(operationId);
    const operationPath = this.operationPath(operationId);
    try {
      await this.assertPrivateDirectory(operationPath);
      await rm(operationPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  resolveOperationPath(operationId: string): string {
    this.validateOperationId(operationId);
    return this.operationPath(operationId);
  }

  private operationPath(operationId: string): string {
    return path.join(this.stagingRoot, operationId);
  }

  private validateOperationId(operationId: string): void {
    if (!OPERATION_ID.test(operationId) || operationId === '.' || operationId === '..') {
      throw new Error('Invalid staging operation ID');
    }
  }

  private async ensurePrivateRoot(): Promise<void> {
    if (this.isWithin(this.publicRoot, this.stagingRoot)) {
      throw new Error('Media staging directory must be outside the public static directory');
    }
    await mkdir(this.stagingRoot, { recursive: true, mode: 0o700 });
    await this.assertPrivateDirectory(this.stagingRoot);
    const [stagingRealPath, staticRealPath] = await Promise.all([
      realpath(this.stagingRoot),
      this.realpathIfExists(this.publicRoot),
    ]);
    if (staticRealPath && this.isWithin(staticRealPath, stagingRealPath)) {
      throw new Error('Media staging directory resolves inside the public static directory');
    }
  }

  private async realpathIfExists(filePath: string): Promise<string | undefined> {
    try {
      return await realpath(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async assertPrivateDirectory(directoryPath: string): Promise<void> {
    const stats = await lstat(directoryPath);
    if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
      throw new Error('Media staging path must be a real directory with owner-only permissions');
    }
  }

  private isWithin(parent: string, candidate: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  }
}
