import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async create(dto: CreateTrackDto): Promise<TrackDocument> {
    return this.trackModel.create({ ...dto, listens: 0 });
  }

  async getAll(): Promise<TrackDocument[]> {
    return this.trackModel.find().exec();
  }

  async getOne(id: string): Promise<TrackDocument | null> {
    return this.trackModel.findById(id).populate('comments').exec();
  }

  async deleteOne(id: string): Promise<TrackDocument | null> {
    return this.trackModel.findByIdAndDelete(id).exec();
  }

  async addComment(dto: CreateCommentDto): Promise<CommentDocument> {
    const comment = await this.commentModel.create({
      username: dto.username,
      text: dto.text,
      track_id: dto.trackId,
      rating: dto.rating ?? 0,
    });

    await this.trackModel.findByIdAndUpdate(dto.trackId, {
      $push: { comments: comment._id },
    });

    return comment;
  }
  async getAllComments(): Promise<CommentDocument[]> {
    return this.commentModel.find().exec();
  }
}
