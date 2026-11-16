import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { reserveAccountQuota, releaseAccountQuota } from './account-quota.js';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FILE_POLICY } from './file-policy.js';
import type { UploadReservation } from './upload-reservation.js';

@Injectable()
export class UploadAdmissionService {
  private active = 0;
  constructor(@InjectConnection() private readonly connection?: Connection) {}

  async reserveForAccount(ownerId: string): Promise<UploadReservation | undefined> {
    const reservation = this.reserve();
    if (!reservation) return undefined;
    try {
      if (!this.connection) throw new Error('Quota database unavailable');
      await reserveAccountQuota(this.connection, ownerId, reservation.operationId);
      return { ...reservation, releaseQuota: () => releaseAccountQuota(this.connection!, reservation.operationId) };
    } catch (error) { reservation.release(); throw error; }
  }

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
