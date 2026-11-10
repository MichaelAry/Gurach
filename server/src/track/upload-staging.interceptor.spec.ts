import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { lastValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { UploadAdmissionService } from '../file/upload-admission.service.js';
import { StagingService } from '../file/staging.service.js';
import { UPLOAD_RESERVATION } from '../file/upload-reservation.js';
import { UploadStagingInterceptor } from './upload-staging.interceptor.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gurach-multipart-'));
  roots.push(root);
  return root;
}

function multipart(boundary: string, parts: { headers: string; body: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n${part.headers}\r\n\r\n`), part.body, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function createContext(request: PassThrough & Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

async function reservedRequest(staging: StagingService, admission: UploadAdmissionService, body: Buffer, boundary: string) {
  const request = new PassThrough() as PassThrough & Record<string, unknown>;
  request.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) };
  request.method = 'POST';
  const reservation = admission.reserve();
  if (!reservation) throw new Error('Test upload reservation unexpectedly unavailable');
  await staging.createOperation(reservation.operationId);
  request[UPLOAD_RESERVATION] = reservation;
  request.end(body);
  return { request, reservation };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('UploadStagingInterceptor', () => {
  it('streams multipart file parts into private exclusive files and removes staging after success', async () => {
    const root = await createRoot();
    const staging = new StagingService(path.join(root, 'private-stage'), path.join(root, 'static'));
    const admission = new UploadAdmissionService();
    const interceptor = new UploadStagingInterceptor(staging);
    const boundary = 'gurach-test-boundary';
    const audioBytes = Buffer.from('streamed audio test bytes');
    const pictureBytes = Buffer.from('streamed image test bytes');
    const body = multipart(boundary, [
      { headers: 'Content-Disposition: form-data; name="name"', body: Buffer.from('A title') },
      { headers: 'Content-Disposition: form-data; name="audio"; filename="song.mp3"\r\nContent-Type: text/plain', body: audioBytes },
      { headers: 'Content-Disposition: form-data; name="picture"; filename="cover.png"\r\nContent-Type: text/plain', body: pictureBytes },
    ]);
    const { request, reservation } = await reservedRequest(staging, admission, body, boundary);
    const operationPath = staging.resolveOperationPath(reservation.operationId);
    const context = createContext(request);
    const result = await interceptor.intercept(context, {
      handle: () => {
        const files = request.files as Record<string, Express.Multer.File[]>;
        expect(files.audio[0].buffer).toBeUndefined();
        return of({ audioSize: files.audio[0].size, pictureSize: files.picture[0].size });
      },
    }).then((observable) => lastValueFrom(observable));

    expect(result).toEqual({ audioSize: audioBytes.length, pictureSize: pictureBytes.length });
    expect(admission.activeCount).toBe(0);
    await expect(stat(operationPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans partial files after unexpected fields and the per-cover size limit', async () => {
    const root = await createRoot();
    const staging = new StagingService(path.join(root, 'private-stage'), path.join(root, 'static'));
    const admission = new UploadAdmissionService();
    const interceptor = new UploadStagingInterceptor(staging);
    const boundary = 'gurach-error-boundary';
    const audio = { headers: 'Content-Disposition: form-data; name="audio"; filename="song.mp3"', body: Buffer.alloc(128, 1) };

    const unexpectedBody = multipart(boundary, [audio, {
      headers: 'Content-Disposition: form-data; name="other"; filename="bad.bin"', body: Buffer.alloc(32, 2),
    }]);
    const unexpected = await reservedRequest(staging, admission, unexpectedBody, boundary);
    const unexpectedPath = staging.resolveOperationPath(unexpected.reservation.operationId);
    await expect(interceptor.intercept(createContext(unexpected.request), { handle: () => of('unreachable') }))
      .rejects.toMatchObject({ code: 'LIMIT_UNEXPECTED_FILE' });
    await expect(stat(unexpectedPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const coverTooLarge = multipart(boundary, [audio, {
      headers: 'Content-Disposition: form-data; name="picture"; filename="large.png"',
      body: Buffer.alloc(10 * 1024 * 1024 + 1, 3),
    }]);
    const oversized = await reservedRequest(staging, admission, coverTooLarge, boundary);
    const oversizedPath = staging.resolveOperationPath(oversized.reservation.operationId);
    await expect(interceptor.intercept(createContext(oversized.request), { handle: () => of('unreachable') }))
      .rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
    await expect(stat(oversizedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(admission.activeCount).toBe(0);
  });

  it('does not invoke application logic after a multipart abort and releases the reservation', async () => {
    const root = await createRoot();
    const staging = new StagingService(path.join(root, 'private-stage'), path.join(root, 'static'));
    const admission = new UploadAdmissionService();
    const interceptor = new UploadStagingInterceptor(staging);
    const boundary = 'gurach-abort-boundary';
    const request = new PassThrough() as PassThrough & Record<string, unknown>;
    request.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': '10000' };
    request.method = 'POST';
    const reservation = admission.reserve()!;
    await staging.createOperation(reservation.operationId);
    request[UPLOAD_RESERVATION] = reservation;
    const operationPath = staging.resolveOperationPath(reservation.operationId);
    const handler = vi.fn(() => of('unreachable'));
    const result = interceptor.intercept(createContext(request), { handle: handler });
    request.write(Buffer.from(`--${boundary}\r\n`));
    request.emit('aborted');
    await expect(result).rejects.toThrow(/aborted/);
    expect(handler).not.toHaveBeenCalled();
    expect(admission.activeCount).toBe(0);
    await expect(stat(operationPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes the operation directory after a staging disk failure', async () => {
    const root = await createRoot();
    const staging = new StagingService(path.join(root, 'private-stage'), path.join(root, 'static'));
    const admission = new UploadAdmissionService();
    const interceptor = new UploadStagingInterceptor(staging);
    const boundary = 'gurach-disk-error';
    const body = multipart(boundary, [{
      headers: 'Content-Disposition: form-data; name="audio"; filename="song.mp3"',
      body: Buffer.from('audio bytes'),
    }]);
    const { request, reservation } = await reservedRequest(staging, admission, body, boundary);
    const operationPath = staging.resolveOperationPath(reservation.operationId);
    const failure = Object.assign(new Error('disk unavailable'), { code: 'ENOSPC' });
    const createFile = vi.spyOn(staging, 'createFile').mockRejectedValue(failure);
    try {
      await expect(interceptor.intercept(createContext(request), { handle: () => of('unreachable') }))
        .rejects.toMatchObject({ code: 'ENOSPC' });
    } finally {
      createFile.mockRestore();
    }
    expect(admission.activeCount).toBe(0);
    await expect(stat(operationPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('UploadAdmissionService', () => {
  it('caps concurrent requests and releases each reservation once', () => {
    const admission = new UploadAdmissionService();
    const first = admission.reserve()!;
    const second = admission.reserve()!;
    expect(admission.reserve()).toBeUndefined();
    first.release();
    first.release();
    expect(admission.activeCount).toBe(1);
    expect(admission.reserve()).toBeDefined();
    second.release();
  });
});
