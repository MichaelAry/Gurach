export class CreateCommentDto {
  readonly username: string;
  readonly text: string;
  readonly trackId: string;
  readonly rating?: number;
}
