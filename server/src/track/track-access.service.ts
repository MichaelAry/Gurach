import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { Track, TrackDocument } from './schemas/track.schema.js';

/** Narrow cross-feature access to active track existence. */
@Injectable()
export class TrackAccessService {
  constructor(@InjectModel(Track.name) private readonly tracks: Model<TrackDocument>) {}

  async assertActive(trackId: string): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(trackId)) throw new BadRequestException('"trackId" must be a valid ObjectId');
    const id = new Types.ObjectId(trackId);
    const exists = await this.tracks.exists({ _id: id, lifecycle: 'active' }).exec();
    if (!exists) throw new NotFoundException(`Track with id "${trackId}" was not found`);
    return id;
  }

  async reserveCommentWrite(trackId: string, session: ClientSession): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(trackId)) throw new BadRequestException('"trackId" must be a valid ObjectId');
    const id = new Types.ObjectId(trackId);
    const result = await this.tracks.updateOne(
      { _id: id, lifecycle: 'active' },
      { $inc: { commentWriteRevision: 1 } },
      { session },
    ).exec();
    if (result.matchedCount !== 1) throw new NotFoundException(`Track with id "${trackId}" was not found`);
    return id;
  }

}
