// Поля picture/audio НЕ входят в DTO: они приходят только файлами
// через FileFieldsInterceptor и заполняются сервисом.
// Иначе клиент мог бы передать их в body и обойти файловый слой.
export class CreateTrackDto {
  readonly name: string;
  readonly artist?: string;
  readonly text?: string;
  readonly duration?: number;
}
