import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export enum FileType {
  AUDIO = 'audio',
  IMAGE = 'image',
}

@Injectable()
export class FileService {
  private readonly staticDir = path.resolve(__dirname, '..', 'static');

  private generateFileName(originalName?: string): string {
    const ext = path.extname(originalName ?? '').toLowerCase();
    return `${randomUUID()}${ext}`;
  }

  async createFile(type: FileType, file: any) {
    try {
      const typeDir = path.join(this.staticDir, type);
      await fs.mkdir(typeDir, { recursive: true });

      let fileName = this.generateFileName(file?.originalname);
      let filePath = path.join(typeDir, fileName);

      while (await this.fileExists(filePath)) {
        fileName = this.generateFileName(file?.originalname);
        filePath = path.join(typeDir, fileName);
      }

      await fs.writeFile(filePath, file?.buffer ?? file);
      return { name: fileName, path: filePath };
    } catch (error) {
      throw new HttpException((error as Error).message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async removeFile(fileName: string, type?: FileType) {
    try {
      const filePath = path.join(this.staticDir, type ?? '', fileName);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new HttpException((error as Error).message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
