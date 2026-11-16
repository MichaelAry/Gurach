import { Body, Controller, Get, Header, HttpCode, Post, Req, SetMetadata } from '@nestjs/common';
import { IsString, MaxLength, MinLength, IsEmail } from 'class-validator';
import { ApiProperty, ApiTags, ApiOkResponse, ApiNoContentResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { Throttle } from '@nestjs/throttler';
import { Public, type ActorRequest } from './session.guard.js';
import { SessionService } from './session.service.js';

export class LoginDto {
  @ApiProperty() @IsString() @MaxLength(32)
  username: string;
  @ApiProperty() @IsString() @MaxLength(512)
  password: string;
}
export class RegisterDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(32) username: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) displayName: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(512) password: string;
}

export class RecoveryRequestDto {
  @ApiProperty() @IsString() @MaxLength(32) username: string;
}
export class RecoveryTokenDto {
  @ApiProperty() @IsString() @MinLength(43) @MaxLength(43) token: string;
}
export class RecoveryResetDto extends RecoveryTokenDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(512) password: string;
}
export class RecoveryChannelDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @MaxLength(512) password: string;
}
class RegisterResultDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
}
class RecoveryAcceptedDto {
  @ApiProperty({ example: 'If eligible, instructions will be sent to the confirmed channel.' }) message: string;
}
class AuthUserDto {
  @ApiProperty({ enum: ['en', 'ru'], required: false }) preferredLocale?: 'en' | 'ru';
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
  @ApiProperty({ enum: ['user', 'admin'] }) role: string;
}
class AuthSessionDto {
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}
class LoginResultDto extends AuthSessionDto {
  @ApiProperty({ description: 'Secret session token for the calling server only' }) token: string;
}

@SetMetadata('gurach.private', true)
@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly sessions: SessionService) {}
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiCreatedResponse({ type: RegisterResultDto })
  @ApiForbiddenResponse({ description: 'Public registration is disabled' })
  @ApiStandardErrors({ conflict: true, rateLimited: true })
  register(@Body() dto: RegisterDto) { return this.sessions.register(dto.username, dto.displayName, dto.password); }
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOkResponse({ type: LoginResultDto })
  @ApiStandardErrors({ authenticated: true, rateLimited: true })
  login(@Body() dto: LoginDto) { return this.sessions.login(dto.username, dto.password); }

  @Public()
  @Post('recovery/request')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOkResponse({ type: RecoveryAcceptedDto })
  @ApiStandardErrors({ rateLimited: true })
  async requestRecovery(@Body() dto: RecoveryRequestDto) {
    await this.sessions.requestRecovery(dto.username);
    return { message: 'If eligible, instructions will be sent to the confirmed channel.' };
  }

  @Post('recovery/channel')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiNoContentResponse()
  @ApiStandardErrors({ authenticated: true, rateLimited: true })
  async requestChannel(@Req() request: ActorRequest, @Body() dto: RecoveryChannelDto) {
    await this.sessions.requestChannel(request.actor, dto.email, dto.password);
  }

  @Public()
  @Post('recovery/verify')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiNoContentResponse()
  @ApiStandardErrors({ rateLimited: true })
  async verifyChannel(@Body() dto: RecoveryTokenDto) { await this.sessions.confirmRecovery(dto.token); }

  @Public()
  @Post('recovery/reset')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiNoContentResponse()
  @ApiStandardErrors({ rateLimited: true })
  async resetPassword(@Body() dto: RecoveryResetDto) { await this.sessions.confirmRecovery(dto.token, dto.password); }

  @Header('Cache-Control', 'private, no-store')
  @Get('me')
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiStandardErrors({ authenticated: true })
  me(@Req() request: ActorRequest) { return this.sessions.authenticate(request.sessionToken); }

  @Header('Cache-Control', 'private, no-store')
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiStandardErrors({ authenticated: true })
  async logout(@Req() request: ActorRequest) { await this.sessions.logout(request.sessionToken); }
}
