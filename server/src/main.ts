import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
// env подтягивает server/.env и валидирует переменные ДО старта приложения.
import { env } from './common/env.js';
import { AppModule } from './app.module.js';
import { redactSecrets } from './common/env-validation.js';
import { ApiErrorFilter } from './common/api-error.filter.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { configureBodyParsers } from './common/body-parsers.js';

const start = async () => {
  try {
    const app = await NestFactory.create(AppModule);
    app.enableShutdownHooks();
    configureBodyParsers(app);
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    app.useGlobalFilters(new ApiErrorFilter());

    app.enableCors({
      // Не `*`: браузерные запросы идут только с фронтенда (см. README),
      // медиа (<audio>/<img>) CORS не требуют.
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      // The audio worker reads byte-range metadata when warming the resume cache.
      exposedHeaders: ['Content-Range', 'Accept-Ranges'],
    });

    // Глобальная валидация DTO: whitelist срезает лишние поля,
    // transform приводит типы, ошибки без декораторов → 400.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );

    await app.listen(env.port, env.host, () => {
      console.log(
        `[${env.nodeEnv}] Server started on http://${env.host}:${env.port} (public: ${env.publicUrl})`,
      );
      console.log(`CORS origins: ${env.corsOrigins.join(', ')}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(redactSecrets(message));
    process.exit(1);
  }
};

void start();
