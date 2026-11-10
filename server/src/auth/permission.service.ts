import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Actor } from './session.service.js';

@Injectable()
export class PermissionService {
  requireActor(actor: Actor | undefined): Actor {
    if (!actor) throw new UnauthorizedException('Authentication required');
    return actor;
  }
  assertOwner(actor: Actor, ownerId: string | { toString(): string } | null | undefined): void {
    if (actor.role !== 'admin' && (ownerId == null || String(ownerId) !== actor.id)) throw new ForbiddenException('Insufficient permissions');
  }
}
