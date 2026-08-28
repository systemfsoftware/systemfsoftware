import {
  generateSurfaceTests,
  isJsonExportValue,
  sanitizeKey,
  shouldSkipExportValue,
} from '@systemfsoftware/api-surface'
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

async function makeFixture(
  exportsMap: Record<string, unknown>,
  name = '@test/fixture-pkg',
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'api-surface-'))
  const pkg = { name, exports: exportsMap }
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')
  return dir
}

Feature('api-surface generator').body(({ scenario }) => {
  scenario(
    'Should_MapKeys_When_SanitizeKeyCalledWithRootAndSubpaths',
    Effect.sync(() => {
      expect(sanitizeKey('.')).toBe('root')
      expect(sanitizeKey('./utils')).toBe('root-utils')
      expect(sanitizeKey('./foo/bar')).toBe('root-foo-bar')
      expect(sanitizeKey('./a/b/c')).toBe('root-a-b-c')
    }),
  )

  scenario(
    'Should_SkipJsonLeaf_When_ValueIsJsonOrJsonc',
    Effect.sync(() => {
      expect(isJsonExportValue('./package.json')).toBe(true)
      expect(isJsonExportValue('./data.json')).toBe(true)
      expect(isJsonExportValue('./data.jsonc')).toBe(true)
      expect(isJsonExportValue('./dist/index.mjs')).toBe(false)
      expect(shouldSkipExportValue('./package.json')).toBe(true)
    }),
  )

  scenario(
    'Should_SkipNestedJson_When_ConditionObjectContainsJson',
    Effect.sync(() => {
      expect(isJsonExportValue({ import: './data.json', types: './index.d.ts' })).toBe(true)
      expect(isJsonExportValue({ import: './dist/index.mjs', types: './dist/index.d.ts' })).toBe(false)
      expect(shouldSkipExportValue({ default: './package.json' })).toBe(true)
    }),
  )

  scenario(
    'Should_OmitJsonExports_When_GeneratingFromMapWithJsonEntries',
    Effect.promise(async () => {
      const dir = await makeFixture({
        '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
        './package.json': './package.json',
        './data': './data.json',
        './utils': { types: './dist/utils.d.ts', default: './dist/utils.mjs' },
      })
      try {
        await generateSurfaceTests(dir)
        const content = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        expect(content).not.toContain('surface: ./package.json')
        expect(content).not.toContain('surface: ./data')
        expect(content).toContain(`surface: .`)
        expect(content).toContain('surface: ./utils')
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }),
  )

  scenario(
    'Should_EmitExactContent_When_PackageHasModuleExports',
    Effect.promise(async () => {
      const dir = await makeFixture({
        '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
        './package.json': './package.json',
        './utils': { types: './dist/utils.d.ts', default: './dist/utils.mjs' },
      })
      try {
        await generateSurfaceTests(dir)
        const content = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        const expected = [
          `import { describe, expect, it } from 'vitest'`,
          ``,
          `describe('surface', () => {`,
          `  it('surface: .', async () => {`,
          `    const mod = await import('@test/fixture-pkg')`,
          `    expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')`,
          `  })`,
          `  it('surface: ./utils', async () => {`,
          `    const mod = await import('@test/fixture-pkg/utils')`,
          `    expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-utils.snap')`,
          `  })`,
          `})`,
          ``,
        ].join('\n')
        expect(content).toBe(expected)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }),
  )

  scenario(
    'Should_BeIdempotent_When_RunTwiceOnSamePackage',
    Effect.promise(async () => {
      const dir = await makeFixture({
        '.': { types: './dist/index.d.ts', default: './dist/index.mjs' },
        './a': { default: './dist/a.mjs' },
        './b': { default: './dist/b.mjs' },
      })
      try {
        await generateSurfaceTests(dir)
        const first = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        await generateSurfaceTests(dir)
        const second = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        expect(second).toBe(first)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }),
  )

  scenario(
    'Should_SanitizeNestedKeys_When_KeysContainSlashes',
    Effect.promise(async () => {
      const dir = await makeFixture({
        '.': { default: './dist/index.mjs' },
        './foo/bar': { default: './dist/foo/bar.mjs' },
        './a/b/c': { default: './dist/a.mjs' },
      })
      try {
        await generateSurfaceTests(dir)
        const content = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        expect(content).toContain(`surface.root.snap`)
        expect(content).toContain(`surface.root-foo-bar.snap`)
        expect(content).toContain(`surface.root-a-b-c.snap`)
        expect(content).toContain(`import('@test/fixture-pkg/foo/bar')`)
        expect(content).toContain(`import('@test/fixture-pkg/a/b/c')`)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }),
  )

  scenario(
    'Should_SortKeys_When_InputOrderIsArbitrary',
    Effect.promise(async () => {
      const dir = await makeFixture({
        './z': { default: './dist/z.mjs' },
        '.': { default: './dist/index.mjs' },
        './a': { default: './dist/a.mjs' },
      })
      try {
        await generateSurfaceTests(dir)
        const content = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        const idxRoot = content.indexOf(`surface: .`)
        const idxA = content.indexOf(`surface: ./a`)
        const idxZ = content.indexOf(`surface: ./z`)
        expect(idxRoot).toBeLessThan(idxA)
        expect(idxA).toBeLessThan(idxZ)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }),
  )

  scenario(
    'Should_CreateTestsDirectory_When_Missing',
    Effect.promise(async () => {
      const dir = await makeFixture({ '.': { default: './dist/index.mjs' } })
      try {
        await generateSurfaceTests(dir)
        const content = await readFile(join(dir, 'tests', 'surface.snapshot.test.ts'), 'utf8')
        expect(content).toContain(`describe('surface'`)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }),
  )
})
