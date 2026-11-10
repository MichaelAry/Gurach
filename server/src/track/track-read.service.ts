import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Track } from './schemas/track.schema.js';
import { toTrackListItem, type TrackListRecord } from './mappers/track.mapper.js';
@Injectable()
export class TrackReadService {
  constructor(@InjectModel(Track.name) private readonly tracks: Model<Track>) {}
  async random() {
    const rows = await this.tracks.aggregate<TrackListRecord>([
      { $match: { lifecycle: 'active', audio: { $type: 'string', $ne: '' } } },
      { $sample: { size: 50 } },
      { $project: { _id: 1, name: 1, artist: 1, audio: 1, picture: 1, duration: 1, listens: 1 } },
    ]).exec();
    return rows.map(toTrackListItem);
  }
  async resolve(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length > 100) throw new Error('Track resolution limit exceeded');
    if (!unique.length) return new Map<string, ReturnType<typeof toTrackListItem>>();
    const rows = await this.tracks.find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) }, lifecycle: 'active' })
      .select('_id name artist audio picture duration listens').lean().exec();
    return new Map(rows.map((row) => [String(row._id), toTrackListItem(row)]));
  }
}
