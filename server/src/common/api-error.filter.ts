import { QueueError } from '../queue/queue-error.js';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiErrorCode } from '../contracts/api-error.dto.js';
import { redactSecrets } from './env-validation.js';
import { resolveRequestId, REQUEST_ID_HEADER } from './request-id.middleware.js';

interface MulterLikeError extends Error {
  code?: string;
}

interface ErrorMapping {
  code: ApiErrorCode;
  message: string;
}

const PUBLIC_MESSAGES: Record<number, ErrorMapping> = {
  400: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication is required' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
  404: { code: 'NOT_FOUND', message: 'The requested resource was not found' },
  409: { code: 'CONFLICT', message: 'The request conflicts with existing data' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'The uploaded payload is too large' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The media type is not supported' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests' },
};

function validationFields(response: unknown): Record<string, string[]> | undefined {
  if (typeof response !== 'object' || response === null || !('message' in response)) return;
  const messages = response.message;
  if (!Array.isArray(messages)) return;
  const fields: Record<string, string[]> = {};
  for (const entry of messages) {
    if (typeof entry !== 'string') continue;
    const match = /^([\w.[\]-]+)\s(.+)$/.exec(entry);
    if (!match) continue;
    (fields[match[1]] ??= []).push(match[2]);
  }
  return Object.keys(fields).length ? fields : undefined;
}

function mapError(exception: unknown): { status: number; mapping: ErrorMapping; fields?: Record<string, string[]> } {
  if (exception instanceof QueueError) return { status: exception.getStatus(), mapping: { code: exception.queueCode, message: exception.message } };
  if (exception && typeof exception === 'object' && 'type' in exception && exception.type === 'entity.too.large') return { status: 413, mapping: PUBLIC_MESSAGES[413] };
  const multer = exception as MulterLikeError;
  if (multer?.name === 'MulterError') {
    if (multer.code === 'LIMIT_FILE_SIZE') return { status: 413, mapping: PUBLIC_MESSAGES[413] };
    return { status: 400, mapping: PUBLIC_MESSAGES[400] };
  }
  if (exception instanceof mongoose.Error.ValidationError || exception instanceof mongoose.Error.CastError) {
    return { status: 400, mapping: PUBLIC_MESSAGES[400] };
  }
  if (exception instanceof mongoose.mongo.MongoServerError && exception.code === 11000) {
    return { status: 409, mapping: PUBLIC_MESSAGES[409] };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const mapping = PUBLIC_MESSAGES[status] ?? {
      code: status >= 500 ? 'INTERNAL_ERROR' as const : 'VALIDATION_ERROR' as const,
      message: status >= 500 ? 'An unexpected error occurred' : 'The request could not be processed',
    };
    return { status, mapping, fields: status === 400 ? validationFields(exception.getResponse()) : undefined };
  }
  return { status: 500, mapping: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } };
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    const { status, mapping, fields } = mapError(exception);

    if (status >= 500) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(JSON.stringify({
        event: 'http.unhandled_error',
        requestId,
        status,
        errorType: error.name,
        message: redactSecrets(error.message),
      }));
    }

    const queueValidation = !(exception instanceof QueueError) && status === 400 && request.method === 'PUT' && request.path === '/queue'
      ? { code: Array.isArray(request.body?.entries) && request.body.entries.length > 100 ? 'QUEUE_FULL' : 'QUEUE_ENTRY_INVALID', message: 'Invalid queue write' }
      : null;
    const body = {
      error: {
        code: queueValidation?.code ?? mapping.code,
        message: queueValidation?.message ?? mapping.message,
        ...(fields ? { fieldErrors: fields } : {}),
        requestId,
      },
    };
    const retryAfter = (exception as { retryAfter?: unknown })?.retryAfter;
    if (typeof retryAfter === 'number' || typeof retryAfter === 'string') {
      response.setHeader('Retry-After', String(retryAfter));
    }
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(status).json(body);
  }
}
