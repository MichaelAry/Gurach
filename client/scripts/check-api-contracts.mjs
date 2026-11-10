import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function option(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${name} requires a path`)
  return value
}

const documentPath = option('--openapi', path.resolve(clientRoot, '../server/openapi.json'))
const generatedPath = option('--generated', path.resolve(clientRoot, 'lib/api/schema.d.ts'))
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'gurach-api-types-'))
const tempSchema = path.join(tempDir, 'schema.d.ts')

try {
  const cli = path.resolve(clientRoot, 'node_modules/openapi-typescript/bin/cli.js')
  const result = spawnSync(process.execPath, [cli, documentPath, '--output', tempSchema], {
    cwd: clientRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout)
    process.exitCode = result.status ?? 1
  } else {
    const normalize = (value) => value.replace(/\r\n/g, '\n').trimEnd() + '\n'
    const expected = normalize(readFileSync(tempSchema, 'utf8'))
    const actual = normalize(readFileSync(generatedPath, 'utf8'))
    if (actual !== expected) {
      process.stderr.write('Generated API types are out of date. Run `npm run api:generate` in client/.\n')
      process.exitCode = 1
    } else {
      process.stdout.write('Generated API types match the OpenAPI document.\n')
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
