import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Playlist } from './playlist.schema.js';
import { TrackReadService } from '../track/track-read.service.js';
import type { PlaylistWrite, PlaylistUpdate, PlaylistSharing, PlaylistView } from './playlists.contract.js';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class PlaylistsService {
  constructor(@InjectModel(Playlist.name) private readonly playlists: Model<Playlist>, private readonly tracks: TrackReadService) {}
  private id(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestException('Invalid playlist ID');
    return new Types.ObjectId(id);
  }
  private async owned(ownerId: string, id: string) {
    const row = await this.playlists.findOne({ _id: this.id(id), ownerId: new Types.ObjectId(ownerId) }).exec();
    if (!row) throw new NotFoundException('Playlist unavailable');
    return row;
  }
  private async view(row: Playlist & { _id: Types.ObjectId }): Promise<PlaylistView> {
    const tracks = await this.tracks.resolve(row.trackIds);
    return { id: String(row._id), ownerId: String(row.ownerId), name: row.name, revision: row.revision, visibility: row.visibility,
      entries: row.trackIds.map((trackId) => ({ trackId, track: tracks.get(trackId) ?? null })) };
  }
  async list(ownerId: string) {
    const rows = await this.playlists.find({ ownerId: new Types.ObjectId(ownerId) }).sort({ _id: -1 }).select('_id name').lean().exec();
    return { items: rows.map((row) => ({ id: String(row._id), name: row.name })) };
  }
  async create(ownerId: string, input: PlaylistWrite) {
    return this.view(await this.playlists.create({ ownerId: new Types.ObjectId(ownerId), name: input.name, trackIds: input.trackIds.map(id => id.toLowerCase()) }));
  }
  async read(ownerId: string, id: string) { return this.view(await this.owned(ownerId, id)); }
  async shared(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Playlist unavailable');
    const row = await this.playlists.findOne({ tokenHash: hash(token), visibility: 'link' }).exec();
    if (!row) throw new NotFoundException('Playlist unavailable');
    return this.view(row);
  }
  async update(ownerId: string, id: string, input: PlaylistUpdate) {
    await this.owned(ownerId, id);
    const row = await this.playlists.findOneAndUpdate({ _id: this.id(id), ownerId: new Types.ObjectId(ownerId), revision: input.expectedRevision },
      { $set: { name: input.name, trackIds: input.trackIds.map(id => id.toLowerCase()) }, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!row) throw new ConflictException('Playlist changed; reload before saving');
    return this.view(row);
  }
  async sharing(ownerId: string, id: string, input: PlaylistSharing) {
    await this.owned(ownerId, id);
    const token = input.visibility === 'link' ? randomBytes(32).toString('base64url') : null;
    const row = await this.playlists.findOneAndUpdate({ _id: this.id(id), ownerId: new Types.ObjectId(ownerId), revision: input.expectedRevision },
      { $set: { visibility: input.visibility, tokenHash: token ? hash(token) : null }, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!row) throw new ConflictException('Playlist changed; reload before sharing');
    return { token, revision: row.revision };
  }
}
