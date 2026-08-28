import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PackageJsonSchema } from './package-json.schema.js'

type PackageJson = typeof PackageJsonSchema.Type

export function sanitizeKey(key: string): string {
  if (key === '.') return 'root'
  return key.replaceAll('/', '-').replace('.', 'root')
}

export function isJsonExportValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.endsWith('.json') || value.endsWith('.jsonc')
  }
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) {
      if (isJsonExportValue(v)) return true
    }
  }
  return false
}

export function shouldSkipExportValue(value: unknown): boolean {
  return isJsonExportValue(value)
}

function sortedFilteredEntries(exportsMap: Record<string, unknown>): Array<[string, unknown]> {
  const entries = Object.entries(exportsMap).filter(([, v]) => !shouldSkipExportValue(v))
  entries.sort((a, b) => a[0].localeCompare(b[0]))
  return entries
}

function importSpecifier(packageName: string, key: string): string {
  return key === '.' ? packageName : `${packageName}${key.slice(1)}`
}

function buildFileContent(packageName: string, entries: Array<[string, unknown]>): string {
  const lines: Array<string> = []
  lines.push(`import { describe, expect, it } from 'vitest'`)
  lines.push('')
  lines.push(`describe('surface', () => {`)
  for (const [key] of entries) {
    const spec = importSpecifier(packageName, key)
    const snap = `surface.${sanitizeKey(key)}.snap`
    lines.push(`  it('surface: ${key}', async () => {`)
    lines.push(`    const mod = await import('${spec}')`)
    lines.push(`    expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/${snap}')`)
    lines.push(`  })`)
  }
  lines.push(`})`)
  lines.push('')
  return lines.join('\n')
}

export async function generateSurfaceTests(packageDir: string): Promise<void> {
  const pkgJsonPath = join(packageDir, 'package.json')
  const raw = await readFile(pkgJsonPath, 'utf8')
  const json: unknown = JSON.parse(raw)
  const decoded: PackageJson = await Effect.runPromise(
    Schema.decodeUnknownEffect(PackageJsonSchema)(json).pipe(Effect.orDie),
  )

  const packageName = decoded.name
  const exportsMap: Record<string, unknown> = decoded.exports ?? {}
  const entries = sortedFilteredEntries(exportsMap)
  const content = buildFileContent(packageName, entries)

  const outPath = join(packageDir, 'tests', 'surface.snapshot.test.ts')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, content, 'utf8')
}
