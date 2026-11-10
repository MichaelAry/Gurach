import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller.js';
import { SessionService } from '../auth/session.service.js';
import { configureBodyParsers } from './body-parsers.js';

describe('JSON parsing with route-specific parsers', () => {
  it('limits public registration and login requests to five per minute', async () => {
    const sessions = { register: vi.fn().mockResolvedValue({ id: 'test' }), login: vi.fn().mockResolvedValue({}) };
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [{ provide: SessionService, useValue: sessions }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    const app = module.createNestApplication();
    configureBodyParsers(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    try {
      for (const [path, status] of [['register', 201], ['login', 200]] as const) {
        const data = { username: 'example_user', displayName: 'Example', password: 'testpass8' };
        for (let attempt = 0; attempt < 5; attempt++) await request(app.getHttpServer()).post(`/auth/${path}`).send(data).expect(status);
        await request(app.getHttpServer()).post(`/auth/${path}`).send(data).expect(429);
      }
      expect(sessions.register).toHaveBeenCalledTimes(5);
      expect(sessions.login).toHaveBeenCalledTimes(5);
    } finally { await app.close(); }
  });

  it('delivers registration and login fields to the auth service', async () => {
    const sessions = { register: vi.fn().mockResolvedValue({ id: 'test' }), login: vi.fn().mockResolvedValue({}) };
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: SessionService, useValue: sessions }] }).compile();
    const app = module.createNestApplication();
    configureBodyParsers(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    try {
      await request(app.getHttpServer()).post('/auth/register').send({ username: 'example_user', displayName: 'Example', password: 'testpass8' }).expect(201);
      expect(sessions.register).toHaveBeenCalledWith('example_user', 'Example', 'testpass8');
      await request(app.getHttpServer()).post('/auth/login').send({ username: 'example_user', password: 'testpass8' }).expect(200);
      expect(sessions.login).toHaveBeenCalledWith('example_user', 'testpass8');
    } finally { await app.close(); }
  });
});
