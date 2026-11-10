import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { SessionService, type Actor } from './session.service.js';

const PUBLIC = 'gurach.public';
export const Public = () => SetMetadata(PUBLIC, true);
export type ActorRequest = Request & { actor: Actor; sessionToken: string };
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): Actor => {
  const actor = context.switchToHttp().getRequest<ActorRequest>().actor;
  if (!actor) throw new UnauthorizedException('Authentication required');
  return actor;
});

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('gurach.private', [context.getHandler(), context.getClass()])) {
      context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'private, no-store');
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Authentication required');
    const identity = await this.sessions.authenticate(match[1]);
    request.actor = identity.user;
    request.sessionToken = match[1];
    return true;
  }
}
