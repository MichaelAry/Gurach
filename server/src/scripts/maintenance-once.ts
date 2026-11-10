import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { redactSecrets } from '../common/env-validation.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(MaintenanceService).runOnce();
    process.stdout.write(`${JSON.stringify({ command: 'maintenance:once', ...result }, null, 2)}\n`);
    if (result.retried > 0 || result.eventsRetried > 0) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const value = error as { name?: unknown };
  const name = typeof value?.name === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value.name)
    ? value.name
    : 'MaintenanceCommandFailed';
  process.stderr.write(`${redactSecrets(name)}\n`);
  process.exitCode = 1;
});
