import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ versionKey: false })
export class ArtworkWearReset {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true }) resetAt: Date;
}

export const ArtworkWearResetSchema = SchemaFactory.createForClass(ArtworkWearReset);
