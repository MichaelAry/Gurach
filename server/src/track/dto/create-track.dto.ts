export class CreateTrackDto {
  readonly name: string;
  readonly artist?: string;
  readonly picture?: string;
  readonly audio?: string;
  readonly text?: string;
  readonly duration?: number;
}
