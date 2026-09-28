import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const start = async () => {
  try {
    const PORT = process.env.PORT || 5000;
    const app = await NestFactory.create(AppModule);

    await app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
    // exitCode не поможет: соединение с Mongo держит event loop,
    // процесс завис бы вместо завершения
    process.exit(1);
  }
};

void start();
