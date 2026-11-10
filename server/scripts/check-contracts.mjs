import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientRoot = path.resolve(serverRoot, '../client')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'gurach-contracts-'))
const tempDocument = path.join(tempDir, 'openapi.json')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`)
}

try {
  run(process.execPath, [
    path.join(serverRoot, '.tools/src/scripts/openapi.js'),
    '--output',
    tempDocument,
  ], serverRoot)

  const normalizeJson = (value) => `${JSON.stringify(sortKeys(JSON.parse(value)), null, 2)}\n`
  const trackedDocument = readFileSync(path.join(serverRoot, 'openapi.json'), 'utf8')
  const generatedDocument = readFileSync(tempDocument, 'utf8')
  if (normalizeJson(trackedDocument) !== normalizeJson(generatedDocument)) {
    throw new Error('server/openapi.json is stale. Run `npm run openapi:generate` in server/.')
  }

  run(process.execPath, [
    path.join(clientRoot, 'scripts/check-api-contracts.mjs'),
    '--openapi', tempDocument,
  ], clientRoot)
  process.stdout.write('OpenAPI document and generated client types are in sync.\n')
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Contract check failed'}\n`)
  process.exitCode = 1
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
}
