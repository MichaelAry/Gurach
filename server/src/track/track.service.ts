import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types, isValidObjectId } from 'mongoose';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreateTrackDto } from './dto/create-track.dto.js';
import { Comment, CommentDocument } from './schemas/comment.schema.js';
import { Track, TrackDocument } from './schemas/track.schema.js';

@Injectable()
export class TrackService {
  constructor(
    @InjectModel(Track.name) private trackModel: Model<TrackDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {}
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

  async create(
    dto: CreateTrackDto,
    picture?: Express.Multer.File,
    audio?: Express.Multer.File,
  ): Promise<Track> {
    const track = await this.trackModel.create({ ...dto, listens: 0 });
    return track;
  }

  async getAll(): Promise<TrackDocument[]> {
    return this.trackModel.find().exec();
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

  async getAllComments(trackId?: string): Promise<CommentDocument[]> {
    if (trackId) {
      if (!isValidObjectId(trackId)) {
        throw new BadRequestException('Invalid track id');
      }
      return this.commentModel.find({ track_id: trackId }).exec();
    }
    return this.commentModel.find().exec();
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
