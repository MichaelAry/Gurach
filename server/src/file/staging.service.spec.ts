import { mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StagingService } from './staging.service.js';

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gurach-staging-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('StagingService', () => {
  it('creates private operation directories and exclusive private files', async () => {
    const root = await makeRoot();
    const service = new StagingService(path.join(root, 'private-stage'), path.join(root, 'static'));
    const operationPath = await service.createOperation('op_test-01');
    const file = await service.createFile('op_test-01', 'audio');
    await file.handle.writeFile('staged bytes');
    await file.handle.close();
    expect(file.path).toBe(path.join(operationPath, 'audio.upload'));
    expect((await stat(operationPath)).mode & 0o777).toBe(0o700);
    await expect(service.createFile('op_test-01', 'audio')).rejects.toMatchObject({ code: 'EEXIST' });
    await service.removeOperation('op_test-01');
    await expect(stat(operationPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects traversal IDs and a staging root inside the public static directory', async () => {
    const root = await makeRoot();
    const service = new StagingService(path.join(root, 'static', 'staging'), path.join(root, 'static'));
    await expect(service.createOperation('../escape')).rejects.toThrow(/operation ID/);
    await expect(service.createOperation('valid')).rejects.toThrow(/outside the public static/);
  });

  it('refuses symlinked operation directories', async () => {
    const root = await makeRoot();
    const service = new StagingService(path.join(root, 'private-stage'), path.join(root, 'static'));
    const outside = path.join(root, 'outside');
    const operationPath = await service.createOperation('linked');
    await rm(operationPath, { recursive: true });
    await symlink(outside, operationPath);
    await expect(service.createFile('linked', 'picture')).rejects.toThrow(/owner-only permissions/);
  });
});
