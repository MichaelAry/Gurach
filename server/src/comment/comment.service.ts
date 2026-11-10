import { PermissionService } from '../auth/permission.service.js';
import type { Actor } from '../auth/session.service.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import { CommentPage } from '../contracts/track.contract.js';
import type { CommentRecord } from './mappers/comment.mapper.js';
import { toCommentResponse } from './mappers/comment.mapper.js';
import { Comment, CommentDocument } from './schemas/comment.schema.js';
import { TrackAccessService } from '../track/track-access.service.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import { commentsCursorScope, type ListCommentsQuery } from './dto/list-comments-query.dto.js';
import { decodeScopedCursor, encodeScopedCursor } from '../common/cursor.js';

function hasErrorLabel(error: unknown, label: string): boolean {
  return Boolean(error && typeof error === 'object' &&
    'hasErrorLabel' in error && typeof error.hasErrorLabel === 'function' &&
    error.hasErrorLabel(label));
}

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
    private readonly tracks: TrackAccessService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async add(trackId: string, dto: CreateCommentDto, actor?: Actor) {
    const identity = new PermissionService().requireActor(actor);
    if (!Types.ObjectId.isValid(trackId)) throw new BadRequestException('"trackId" must be a valid ObjectId');
    try {
      const comment = await this.withBoundedTransaction(async (session) => {
        const id = await this.tracks.reserveCommentWrite(trackId, session);
        const [created] = await this.comments.create([{
          username: identity.displayName, authorId: new Types.ObjectId(identity.id), text: dto.text, track_id: id, rating: dto.rating,
        }], { session });
        return created;
      });
      return toCommentResponse(comment as CommentRecord);
    } catch (error) {
      if (error instanceof Error && error.name === 'ValidationError') throw new BadRequestException(error.message);
      throw error;
    }
  }

  async delete(id: string, actor?: Actor) {
    const identity = new PermissionService().requireActor(actor);
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`"id" is not a valid ObjectId: "${id}"`);
    const comment = await this.withBoundedTransaction(async (session) => {
      const existing = await this.comments.findOne({
        _id: new Types.ObjectId(id), migrationQuarantineId: { $exists: false },
      }).session(session).exec();
      if (!existing) throw new NotFoundException(`Comment with id "${id}" was not found`);
      new PermissionService().assertOwner(identity, existing.authorId);
      await this.tracks.reserveCommentWrite(String(existing.track_id), session);
      const removed = await this.comments.findOneAndDelete({
        _id: existing._id, ...(identity.role === 'admin' ? {} : { authorId: new Types.ObjectId(identity.id) }), track_id: existing.track_id, migrationQuarantineId: { $exists: false },
      }).session(session).exec();
      if (!removed) throw new NotFoundException(`Comment with id "${id}" was not found`);
      return removed;
    });
    return toCommentResponse(comment as CommentRecord);
  }

  /** Explicit bounded retries; no HTTP, filesystem or callback effects belong in work(). */
  private async withBoundedTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    const maxAttempts = 3;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        try {
          const result = await work(session);
          let committed = false;
          for (let commitAttempt = 1; commitAttempt <= maxAttempts; commitAttempt += 1) {
            try {
              await session.commitTransaction();
              committed = true;
              break;
            } catch (error) {
              if (!hasErrorLabel(error, 'UnknownTransactionCommitResult') || commitAttempt === maxAttempts) throw error;
            }
          }
          if (!committed) throw new Error('Comment transaction commit outcome is unknown');
          return result;
        } catch (error) {
          if (session.inTransaction()) await session.abortTransaction().catch(() => undefined);
          if (!hasErrorLabel(error, 'TransientTransactionError') || attempt === maxAttempts) throw error;
        }
      }
      throw new Error('Comment transaction exhausted its retry budget');
    } finally {
      await session.endSession();
    }
  }

  async list(query: ListCommentsQuery): Promise<CommentPage> {
    const trackId = await this.tracks.assertActive(query.trackId);
    const scope = commentsCursorScope(query.trackId);
    const cursor = query.cursor ? decodeScopedCursor(query.cursor) : undefined;
    if (cursor && cursor.scope !== scope) throw new BadRequestException('"cursor" does not match the trackId filter');
    const filter: Record<string, unknown> = { track_id: trackId, migrationQuarantineId: { $exists: false } };
    if (cursor) filter._id = { $lt: new Types.ObjectId(cursor.after) };
    const records = await this.comments.find(filter).select('_id track_id authorId username text rating createdAt')
      .sort({ _id: -1 }).limit(query.count + 1).lean().exec() as CommentRecord[];
    const hasMore = records.length > query.count;
    const items = records.slice(0, query.count);
    return Object.assign(new CommentPage(), {
      items: items.map(toCommentResponse),
      nextCursor: hasMore && items.length ? encodeScopedCursor({ after: String(items.at(-1)!._id), scope }) : null,
    });
  }
}
