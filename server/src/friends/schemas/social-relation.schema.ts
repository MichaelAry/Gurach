import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongoSchema, Types } from 'mongoose';
export type RelationStatus = 'none' | 'pending' | 'accepted';
@Schema({ collection: 'social_relations', timestamps: true, versionKey: false })
export class SocialRelation {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) userLowId!: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) userHighId!: Types.ObjectId;
  @Prop({ type: String, enum: ['none', 'pending', 'accepted'], default: 'none', required: true }) status!: RelationStatus;
  @Prop({ type: String }) requestId?: string;
  @Prop({ type: MongoSchema.Types.ObjectId }) requesterId?: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId }) recipientId?: Types.ObjectId;
  @Prop({ type: Date }) requestedAt?: Date;
  @Prop({ type: Date }) acceptedAt?: Date;
  @Prop({ type: Boolean, default: false }) blockedByLow!: boolean;
  @Prop({ type: Boolean, default: false }) blockedByHigh!: boolean;
  @Prop({ type: Date }) nextRequestAllowedAt?: Date;
  @Prop({ type: Number, default: 0, min: 0 }) revision!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
export const SocialRelationSchema = SchemaFactory.createForClass(SocialRelation);
SocialRelationSchema.index({ userLowId: 1, userHighId: 1 }, { unique: true, name: 'relation_pair_unique' });
SocialRelationSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } }, name: 'relation_request_unique' });
SocialRelationSchema.index({ recipientId: 1, status: 1, requestedAt: -1, _id: -1 }, { name: 'relation_incoming' });
SocialRelationSchema.index({ requesterId: 1, status: 1, requestedAt: -1, _id: -1 }, { name: 'relation_outgoing' });
SocialRelationSchema.index({ userLowId: 1, status: 1, acceptedAt: -1, _id: -1 }, { name: 'relation_friends_low' });
SocialRelationSchema.index({ userHighId: 1, status: 1, acceptedAt: -1, _id: -1 }, { name: 'relation_friends_high' });
SocialRelationSchema.index({ userLowId: 1, blockedByLow: 1, _id: -1 }, { name: 'relation_blocks_low' });
SocialRelationSchema.index({ userHighId: 1, blockedByHigh: 1, _id: -1 }, { name: 'relation_blocks_high' });
