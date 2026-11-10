import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FILE_POLICY } from './file-policy.js';
import type { UploadReservation } from './upload-reservation.js';

@Injectable()
export class UploadAdmissionService {
  private active = 0;

  reserve(): UploadReservation | undefined {
    if (this.active >= FILE_POLICY.maxConcurrentUploads) return undefined;
    this.active += 1;
    let released = false;
    return {
      operationId: randomUUID(),
      release: () => {
        if (released) return;
        released = true;
        this.active -= 1;
      },
    };
  }

  get activeCount(): number {
    return this.active;
  }
}
