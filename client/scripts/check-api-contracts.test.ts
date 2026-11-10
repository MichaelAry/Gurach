import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('API type drift check', () => {
  it('fails when generated declarations are stale', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'gurach-api-drift-'))
    const staleTypes = path.join(directory, 'schema.d.ts')
    writeFileSync(staleTypes, '// intentionally stale generated declarations\n')
    try {
      const result = spawnSync(process.execPath, [
        path.join(clientRoot, 'scripts/check-api-contracts.mjs'),
        '--generated', staleTypes,
      ], { cwd: clientRoot, encoding: 'utf8' })
      expect(result.status).toBe(1)
      expect(`${result.stdout}${result.stderr}`).toContain('Generated API types are out of date')
      expect(readFileSync(staleTypes, 'utf8')).toContain('intentionally stale')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
