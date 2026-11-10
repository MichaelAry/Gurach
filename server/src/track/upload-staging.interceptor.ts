import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import multer from 'multer';
import type { Request, Response } from 'express';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { FILE_POLICY } from '../file/file-policy.js';
import { StagingService } from '../file/staging.service.js';
import { UPLOAD_RESERVATION, type UploadRequestContext, type UploadReservation } from '../file/upload-reservation.js';
import { validateUploadFields } from '../file/file-policy.js';

class PrivateStagingStorage implements multer.StorageEngine {
  constructor(private readonly staging: StagingService) {}

  _handleFile(
    request: Request & UploadRequestContext,
    file: Express.Multer.File,
    callback: (error?: Error | null, info?: Partial<Express.Multer.File>) => void,
  ): void {
    const reservation = request[UPLOAD_RESERVATION];
    const kind = file.fieldname === 'audio' ? 'audio' : file.fieldname === 'picture' ? 'picture' : undefined;
    if (!reservation || !kind) {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      return;
    }
    void this.staging.createFile(reservation.operationId, kind).then(async (staged) => {
      let size = 0;
      const maximum = kind === 'audio' ? FILE_POLICY.maxAudioBytes : FILE_POLICY.maxCoverBytes;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          if (size > maximum) {
            done(new multer.MulterError('LIMIT_FILE_SIZE', file.fieldname));
            return;
          }
          done(null, chunk);
        },
      });
      try {
        await pipeline(file.stream, limiter, staged.handle.createWriteStream({ autoClose: true }));
        callback(null, { path: staged.path, filename: kind === 'audio' ? 'audio.upload' : 'picture.upload', size });
      } catch (error) {
        callback(error instanceof Error ? error : new Error('Failed to write staged upload'));
      }
    }).catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error('Failed to allocate staged upload'));
    });
  }

  _removeFile(_request: Request, _file: Express.Multer.File, callback: (error: Error | null) => void): void {
    // UploadStagingInterceptor owns cleanup of the whole operation directory on every outcome.
    callback(null);
  }
}

@Injectable()
export class UploadStagingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UploadStagingInterceptor.name);
  private readonly receive: ReturnType<ReturnType<typeof multer>['fields']>;

  constructor(
    private readonly staging: StagingService,
  ) {
    this.receive = multer({
      storage: new PrivateStagingStorage(staging),
      limits: {
        fileSize: FILE_POLICY.maxAudioBytes,
        files: FILE_POLICY.maxRequestFiles,
        fields: FILE_POLICY.maxBodyFields,
        // Busboy reports partsLimit as soon as the count reaches the configured value.
        parts: FILE_POLICY.maxRequestFiles + FILE_POLICY.maxBodyFields + 1,
        fieldNameSize: FILE_POLICY.maxFieldNameChars,
        fieldSize: FILE_POLICY.maxLyricsChars,
      },
    }).fields([
      { name: 'picture', maxCount: 1 },
      { name: 'audio', maxCount: 1 },
    ]);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & UploadRequestContext>();
    const response = http.getResponse<Response>();
    const reservation = request[UPLOAD_RESERVATION];
    if (!reservation) throw new InternalServerErrorException('Upload admission reservation is missing');

    try {
      await this.receiveRequest(request, response);
      validateUploadFields((request.body ?? {}) as Record<string, unknown>);
    } catch (error) {
      this.logFailure(reservation.operationId, error);
      await this.cleanup(request, reservation);
      throw error;
    }
    return from(this.completeRequest(next.handle(), request, reservation));
  }

  private receiveRequest(request: Request, response: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        request.off('aborted', onAborted);
        if (error) reject(error);
        else resolve();
      };
      const onAborted = () => finish(new InternalServerErrorException('Upload request was aborted'));
      request.once('aborted', onAborted);
      this.receive(request, response, (error: unknown) => finish(error));
    });
  }

  private async completeRequest(
    handler: Observable<unknown>,
    request: Request & UploadRequestContext,
    reservation: UploadReservation,
  ): Promise<unknown> {
    try {
      return await lastValueFrom(handler);
    } catch (error) {
      this.logFailure(reservation.operationId, error);
      throw error;
    } finally {
      await this.cleanup(request, reservation);
    }
  }

  private async cleanup(request: Request & UploadRequestContext, reservation: UploadReservation): Promise<void> {
    try {
      await this.staging.removeOperation(reservation.operationId);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
      this.logger.error(`Could not clean staged upload operation ${reservation.operationId} (code: ${code})`);
      throw error;
    } finally {
      reservation.release();
      delete request[UPLOAD_RESERVATION];
    }
  }

  private logFailure(operationId: string, error: unknown): void {
    const value = error as { name?: unknown; code?: unknown; getStatus?: () => number };
    const status = typeof value?.getStatus === 'function' ? value.getStatus() : undefined;
    const name = typeof value?.name === 'string' ? value.name : 'unknown';
    const code = typeof value?.code === 'string' ? value.code : undefined;
    const hint = status === 503 ? '; verify FFPROBE_PATH and the FFmpeg installation' : '';
    this.logger.warn(`Upload operation ${operationId} failed (${name}${code ? `/${code}` : ''}${status ? `/${status}` : ''})${hint}`);
  }
}
