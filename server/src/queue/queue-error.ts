import { HttpException } from '@nestjs/common';
export type QueueErrorCode = 'QUEUE_FULL' | 'QUEUE_CONFLICT' | 'QUEUE_ENTRY_INVALID' | 'TRACK_UNAVAILABLE';
export class QueueError extends HttpException {
  constructor(public readonly queueCode: QueueErrorCode, message: string, status = 400) { super(message, status); }
}
