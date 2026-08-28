import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { dirname, join } from 'node:path'
import { PackageJsonSchema } from './package-json.schema.js'

type PackageJson = typeof PackageJsonSchema.Type

export function sanitizeKey(key: string): string {
  if (key === '.') return 'root'
  return key.replaceAll('/', '-').replace('.', 'root')
}

export function pascalKey(key: string): string {
  return sanitizeKey(key)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function isJsonExportValue(value: unknown): boolean {
  if (Array.isArray(value)) return false
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

function assertUniqueSanitizedKeys(keys: ReadonlyArray<string>): void {
  const seen = new Map<string, string>()
  for (const key of keys) {
    const sanitized = sanitizeKey(key)
    const prior = seen.get(sanitized)
    if (prior !== undefined) {
      throw new Error(`exports keys '${prior}' and '${key}' sanitize to the same snapshot name '${sanitized}'`)
    }
    seen.set(sanitized, key)
  }
}

export const shouldSkipExportValue = isJsonExportValue

function buildFileContent(packageName: string, entries: Array<[string, unknown]>): string {
  const body = entries
    .map(([key]) => {
      const spec = key === '.' ? packageName : `${packageName}${key.slice(1)}`
      const snap = `surface.${sanitizeKey(key)}.snap`
      return `  it('Should_PinExportSet_When_Importing${
        pascalKey(key)
      }', async () => {\n    const mod = await import('${spec}')\n    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/${snap}')\n  })`
    })
    .join('\n')
  return `import { describe, expect, it } from 'vitest'\n\ndescribe('surface', () => {\n${body ? `${body}\n` : ''}})\n`
}

export async function generateSurfaceTests(packageDir: string): Promise<void> {
  const pkgJsonPath = join(packageDir, 'package.json')
  const fsPromises = await import('node:fs/promises')
  const raw = await fsPromises.readFile(pkgJsonPath, 'utf8')
  const json: unknown = JSON.parse(raw)
  const decoded: PackageJson = await Effect.runPromise(
    Schema.decodeUnknownEffect(PackageJsonSchema)(json).pipe(Effect.orDie),
  )

  const packageName = decoded.name
  const exportsMap: Record<string, unknown> = decoded.exports ?? {}
  const entries = Object.entries(exportsMap).filter(([, v]) => !isJsonExportValue(v)).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  assertUniqueSanitizedKeys(entries.map(([k]) => k))
  const outPath = join(packageDir, 'tests', 'surface.snapshot.test.ts')
  if (entries.length === 0) {
    await fsPromises.rm(outPath, { force: true })
    return
  }
  const content = buildFileContent(packageName, entries)
  await fsPromises.mkdir(dirname(outPath), { recursive: true })
  await fsPromises.writeFile(outPath, content, 'utf8')
}

if (import.meta.vitest) {
  const { test, expect } = await import('vitest')
  const fs = await import('node:fs')
  const fsPromises = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  void buildFileContent

  async function makeFixture(exportsMap: Record<string, unknown>, name = '@test/fixture-pkg'): Promise<string> {
    const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'api-surface-'))
    const pkg = { name, exports: exportsMap }
    await fsPromises.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')
    return dir
  }

  test('Should_MapKeys_When_SanitizeKeyCalledWithRootAndSubpaths', () => {
    expect(sanitizeKey('.')).toBe('root')
    expect(sanitizeKey('./utils')).toBe('root-utils')
    expect(sanitizeKey('./foo/bar')).toBe('root-foo-bar')
    expect(sanitizeKey('./a/b/c')).toBe('root-a-b-c')
  })

  test('Should_SkipJsonLeaf_When_ValueIsJsonOrJsonc', () => {
    expect(isJsonExportValue('./package.json')).toBe(true)
    expect(isJsonExportValue('./data.json')).toBe(true)
    expect(isJsonExportValue('./data.jsonc')).toBe(true)
    expect(isJsonExportValue('./dist/index.mjs')).toBe(false)
    expect(shouldSkipExportValue('./package.json')).toBe(true)
  })

  test('Should_SkipNestedJson_When_ConditionObjectContainsJson', () => {
    expect(isJsonExportValue({ import: './data.json', types: './index.d.ts' })).toBe(true)
    expect(isJsonExportValue({ import: './dist/index.mjs', types: './dist/index.d.ts' })).toBe(false)
    expect(shouldSkipExportValue({ default: './package.json' })).toBe(true)
  })

  test('Should_OmitJsonExports_When_GeneratingFromMapWithJsonEntries', async () => {
    const dir = await makeFixture({
      '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
      './package.json': './package.json',
      './data': './data.json',
      './utils': { types: './dist/utils.d.ts', default: './dist/utils.mjs' },
    })
    try {
      await generateSurfaceTests(dir)
      const content = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      expect(content).not.toContain('surface: ./package.json')
      expect(content).not.toContain('surface: ./data')
      expect(content).toContain('Should_PinExportSet_When_ImportingRoot')
      expect(content).toContain('Should_PinExportSet_When_ImportingRootUtils')
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_EmitExactContent_When_PackageHasModuleExports', async () => {
    const dir = await makeFixture({
      '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
      './package.json': './package.json',
      './utils': { types: './dist/utils.d.ts', default: './dist/utils.mjs' },
    })
    try {
      await generateSurfaceTests(dir)
      const content = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      const expected = [
        `import { describe, expect, it } from 'vitest'`,
        ``,
        `describe('surface', () => {`,
        `  it('Should_PinExportSet_When_ImportingRoot', async () => {`,
        `    const mod = await import('@test/fixture-pkg')`,
        `    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')`,
        `  })`,
        `  it('Should_PinExportSet_When_ImportingRootUtils', async () => {`,
        `    const mod = await import('@test/fixture-pkg/utils')`,
        `    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-utils.snap')`,
        `  })`,
        `})`,
        ``,
      ].join('\n')
      expect(content).toBe(expected)
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_BeIdempotent_When_RunTwiceOnSamePackage', async () => {
    const dir = await makeFixture({
      '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
      './a': { default: './dist/a.mjs' },
      './b': { default: './dist/b.mjs' },
    })
    try {
      await generateSurfaceTests(dir)
      const first = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      await generateSurfaceTests(dir)
      const second = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      expect(second).toBe(first)
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_SanitizeNestedKeys_When_KeysContainSlashes', async () => {
    const dir = await makeFixture({
      '.': { default: './dist/index.mjs' },
      './foo/bar': { default: './dist/foo/bar.mjs' },
      './a/b/c': { default: './dist/a.mjs' },
    })
    try {
      await generateSurfaceTests(dir)
      const content = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      expect(content).toContain(`surface.root.snap`)
      expect(content).toContain(`surface.root-foo-bar.snap`)
      expect(content).toContain(`surface.root-a-b-c.snap`)
      expect(content).toContain(`import('@test/fixture-pkg/foo/bar')`)
      expect(content).toContain(`import('@test/fixture-pkg/a/b/c')`)
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_SortKeys_When_InputOrderIsArbitrary', async () => {
    const dir = await makeFixture({
      './z': { default: './dist/z.mjs' },
      '.': { default: './dist/index.mjs' },
      './a': { default: './dist/a.mjs' },
    })
    try {
      await generateSurfaceTests(dir)
      const content = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      const idxRoot = content.indexOf(`Should_PinExportSet_When_ImportingRoot'`)
      const idxA = content.indexOf('Should_PinExportSet_When_ImportingRootA')
      const idxZ = content.indexOf('Should_PinExportSet_When_ImportingRootZ')
      expect(idxRoot).toBeLessThan(idxA)
      expect(idxA).toBeLessThan(idxZ)
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_CreateTestsDirectory_When_Missing', async () => {
    const dir = await makeFixture({ '.': { default: './dist/index.mjs' } })
    try {
      await generateSurfaceTests(dir)
      const content = await fsPromises.readFile(path.join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
      expect(content).toContain(`describe('surface'`)
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_RemoveStaleTestFile_When_OnlyJsonExportsRemain', async () => {
    const dir = await makeFixture({ './package.json': './package.json' })
    const outPath = path.join(dir, 'tests', 'surface.snapshot.test.ts')
    try {
      await fsPromises.mkdir(path.join(dir, 'tests'), { recursive: true })
      await fsPromises.writeFile(outPath, 'stale', 'utf8')
      await generateSurfaceTests(dir)
      expect(fs.existsSync(outPath)).toBe(false)
    } finally {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
  })

  test('Should_TreatArrayValueAsModule_When_ExportsEntryIsAnArray', () => {
    expect(isJsonExportValue(['./x.json', './index.d.ts'])).toBe(false)
  })

  test('Should_FailFast_When_TwoKeysSanitizeToTheSameName', async () => {
    const dir = await makeFixture({
      '.': { default: './dist/index.mjs' },
      './a/b': { default: './dist/a-b.mjs' },
      './a-b': { default: './dist/a-b.mjs' },
    })
    await expect(generateSurfaceTests(dir)).rejects.toThrow(/sanitize to the same snapshot name/)
  })
}
