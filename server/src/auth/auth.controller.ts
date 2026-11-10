import { Body, Controller, Get, Header, HttpCode, Post, Req, SetMetadata } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiTags, ApiOkResponse, ApiNoContentResponse } from '@nestjs/swagger';
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

class AuthUserDto {
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
