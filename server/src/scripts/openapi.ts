import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueueWriteDto } from '../queue/dto/queue-write.dto.js';
import { QueueResponseDto } from '../queue/dto/queue-response.dto.js';

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

async function main(): Promise<void> {
  // The emitter is a separate process. Establish safe documentation-only
  // settings before importing controllers, which load validated env config.
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/openapi-document-only',
    PUBLIC_URL: 'http://localhost:5000',
    HOST: '127.0.0.1',
    PORT: '5000',
  });

  const [{ NestFactory }, { DocumentBuilder, SwaggerModule }, { DocumentModule }] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/swagger'),
    import('../contracts/document.module.js'),
  ]);
  const app = await NestFactory.create(DocumentModule, { logger: false });
  try {
    const config = new DocumentBuilder()
      .setTitle('Gurach API')
      .setDescription('HTTP API contract for Gurach.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addServer('http://localhost:5000', 'Local development placeholder')
      .build();
    const document = SwaggerModule.createDocument(app, config, {
      extraModels: [QueueWriteDto, QueueResponseDto],
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    });
    const outputArgument = process.argv.indexOf('--output');
    const requestedOutput = outputArgument >= 0 ? process.argv[outputArgument + 1] : undefined;
    if (outputArgument >= 0 && !requestedOutput) throw new Error('--output requires a file path');
    const output = requestedOutput
      ? path.resolve(requestedOutput)
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', 'openapi.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(output, `${JSON.stringify(sortJson(document), null, 2)}\n`, 'utf8');
    process.stdout.write(`Wrote ${path.relative(process.cwd(), output)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'OpenAPI generation failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
