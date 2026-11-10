import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema.js';
import { Session, SessionSchema } from './schemas/session.schema.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { APP_GUARD } from '@nestjs/core';
import { SessionGuard } from './session.guard.js';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Session.name, schema: SessionSchema }])],
  controllers: [AuthController],
  providers: [PasswordService, SessionService, { provide: APP_GUARD, useClass: SessionGuard }],
  exports: [SessionService],
})
export class AuthModule {}
