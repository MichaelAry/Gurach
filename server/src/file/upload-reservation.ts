export interface UploadReservation {
  readonly operationId: string;
  release(): void;
  releaseQuota?(): Promise<void>;
}

export const UPLOAD_RESERVATION = 'gurachUploadReservation' as const;

export interface UploadRequestContext {
  [UPLOAD_RESERVATION]?: UploadReservation;
}
