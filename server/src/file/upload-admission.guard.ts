import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { StagingService } from './staging.service.js';
import { UPLOAD_RESERVATION, type UploadRequestContext } from './upload-reservation.js';
import { UploadAdmissionService } from './upload-admission.service.js';

@Injectable()
export class UploadAdmissionGuard implements CanActivate {
  constructor(
    private readonly admission: UploadAdmissionService,
    private readonly staging: StagingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & UploadRequestContext>();
    const reservation = this.admission.reserve();
    if (!reservation) throw new HttpException('Upload capacity is currently full', HttpStatus.TOO_MANY_REQUESTS);
    try {
      await this.staging.createOperation(reservation.operationId);
      request[UPLOAD_RESERVATION] = reservation;
      return true;
    } catch (error) {
      reservation.release();
      throw error;
    }
  }
}
