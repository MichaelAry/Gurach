import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import { FileService, FileType } from '../file/file.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreateTrackDto } from './dto/create-track.dto.js';
import { Comment, CommentDocument } from './schemas/comment.schema.js';
import { Track, TrackDocument } from './schemas/track.schema.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SearchParams {
  query?: string;
  name?: string;
  artist?: string;
  text?: string;
}

@Injectable()
export class TrackService {
  constructor(
    @InjectModel(Track.name) private trackModel: Model<TrackDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    private fileService: FileService,
  ) {}

  async create(
    dto: CreateTrackDto,
    picture?: Express.Multer.File,
    audio?: Express.Multer.File,
  ): Promise<TrackDocument> {
    if (!audio) {
      throw new BadRequestException('Audio file is required');
    }
    if (!picture) {
      throw new BadRequestException('Picture file is required');
    }

    const stored: { name: string; type: FileType }[] = [];

    try {
      const audioFile = await this.fileService.createFile(
        FileType.AUDIO,
        audio,
      );
      stored.push({ name: audioFile.name, type: FileType.AUDIO });

      const pictureFile = await this.fileService.createFile(
        FileType.PICTURE,
        picture,
      );
      stored.push({ name: pictureFile.name, type: FileType.PICTURE });

      const track = await this.trackModel.create({
        ...dto,
        listens: 0,
        audio: audioFile.name,
        picture: pictureFile.name,
      });

      return track;
    } catch (error) {
      await Promise.all(
        stored.map(({ name, type }) =>
          this.fileService.removeFile(name, type).catch(() => undefined),
        ),
      );
      throw error;
    }
  }

  async getAll(count = 10, offset = 0): Promise<TrackDocument[]> {
    const limit = Number(count);
    const skip = Number(offset);

    if (!Number.isFinite(limit) || limit <= 0 || limit > 100) {
      throw new BadRequestException('"count" must be between 1 and 100');
    }
    if (!Number.isFinite(skip) || skip < 0) {
      throw new BadRequestException('"offset" must be non-negative');
    }

    return this.trackModel.find().skip(skip).limit(limit).populate('comments').exec();
  }

  async getOne(id: string): Promise<TrackDocument> {
    this.assertValidId(id);

    const track = await this.trackModel
      .findById(id)
      .populate('comments')
      .exec();

    if (!track) {
      throw new NotFoundException(`Track with id "${id}" was not found`);
    }

    return track;
  }

  async deleteOne(id: string): Promise<TrackDocument> {
    this.assertValidId(id);

    const track = await this.trackModel.findByIdAndDelete(id).exec();

    if (!track) {
      throw new NotFoundException(`Track with id "${id}" was not found`);
    }

    await this.commentModel.deleteMany({ track_id: track._id }).exec();

    return track;
  }

  async addComment(dto: CreateCommentDto): Promise<CommentDocument> {
    this.assertValidId(dto.trackId, 'trackId');

    const track = await this.trackModel.findById(dto.trackId).exec();

    if (!track) {
      throw new NotFoundException(
        `Track with id "${dto.trackId}" was not found`,
      );
    }

    try {
      const comment = await this.commentModel.create({
        username: dto.username,
        text: dto.text,
        track_id: track._id,
        rating: dto.rating,
      });

      await this.trackModel.findByIdAndUpdate(track._id, {
        $push: { comments: comment._id },
      });

      return comment;
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async deleteComment(id: string): Promise<CommentDocument> {
    this.assertValidId(id);

    const comment = await this.commentModel.findByIdAndDelete(id).exec();

    if (!comment) {
      throw new NotFoundException(`Comment with id "${id}" was not found`);
    }

    await this.trackModel.findByIdAndUpdate(comment.track_id, {
      $pull: { comments: comment._id },
    });

    return comment;
  }

  async getAllComments(trackId?: string): Promise<CommentDocument[]> {
    if (trackId) {
      if (!Types.ObjectId.isValid(trackId)) {
        throw new BadRequestException('Invalid track id');
      }
      return this.commentModel.find({ track_id: trackId }).exec();
    }
    return this.commentModel.find().exec();
  }

  async listen(id: string): Promise<void> {
    this.assertValidId(id);

    const track = await this.trackModel.findById(id).exec();

    if (!track) {
      throw new NotFoundException(`Track with id "${id}" was not found`);
    }

    track.listens += 1;
    await track.save();
  }

  async search(params: SearchParams): Promise<TrackDocument[]> {
    const { query, name, artist, text } = params;

    const filter: Record<string, unknown> = {};

    if (query?.trim()) {
      const re = new RegExp(escapeRegex(query.trim()), 'i');
      filter.$or = [{ name: re }, { artist: re }, { text: re }];
    }

    if (name?.trim()) {
      filter.name = new RegExp(escapeRegex(name.trim()), 'i');
    }
    if (artist?.trim()) {
      filter.artist = new RegExp(escapeRegex(artist.trim()), 'i');
    }
    if (text?.trim()) {
      filter.text = new RegExp(escapeRegex(text.trim()), 'i');
    }

    if (Object.keys(filter).length === 0) {
      throw new BadRequestException(
        'Provide at least one of: query, name, artist, text',
      );
    }

    return this.trackModel.find(filter).exec();
  }

  private assertValidId(id: string, field = 'id'): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        `"${field}" is not a valid ObjectId: "${id}"`,
      );
    }
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof mongoose.Error.ValidationError ||
      error instanceof mongoose.Error.CastError
    ) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
