import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  mergeConfigs,
  readConfigFile,
  resolveExtendsChain,
  resolveExtendsTarget,
} from '../../src/config/resolve-extends.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'stryker-extends-'))
})

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true })
})

async function writeJson(rel: string, content: unknown): Promise<string> {
  const file = path.join(tmpDir, rel)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify(content, null, 2), 'utf-8')
  return file
}

async function writeJs(rel: string, content: string): Promise<string> {
  const file = path.join(tmpDir, rel)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, content, 'utf-8')
  return file
}

async function writeFakePackage(
  hostDir: string,
  name: string,
  exportsMap: Record<string, string>,
  files: Record<string, unknown>,
): Promise<string> {
  const pkgDir = path.join(tmpDir, hostDir, 'node_modules', ...name.split('/'))
  await fs.promises.mkdir(pkgDir, { recursive: true })
  await fs.promises.writeFile(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', exports: exportsMap }, null, 2),
    'utf-8',
  )
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(pkgDir, rel)
    await fs.promises.mkdir(path.dirname(f), { recursive: true })
    await fs.promises.writeFile(f, JSON.stringify(content, null, 2), 'utf-8')
  }
  return pkgDir
}

describe('mergeConfigs', () => {
  it('returns parent verbatim when child is empty', () => {
    expect(mergeConfigs({ a: 1, b: 2 }, {})).toEqual({ a: 1, b: 2 })
  })

  it('child scalar replaces inherited scalar', () => {
    expect(mergeConfigs({ a: 1, b: 2 }, { b: 9 })).toEqual({ a: 1, b: 9 })
  })

  it('child array replaces inherited array wholesale', () => {
    expect(mergeConfigs({ x: [1, 2, 3] }, { x: [9] })).toEqual({ x: [9] })
  })

  it('child array does not concatenate with parent array', () => {
    const out = mergeConfigs({ x: [1, 2, 3] }, { x: [4, 5] })
    expect(out).toEqual({ x: [4, 5] })
    expect(out.x).not.toContain(1)
  })

  it('child object merges one level deep over inherited object', () => {
    expect(
      mergeConfigs({ x: { a: 1, b: 2, c: 3 } }, { x: { b: 9, d: 4 } }),
    ).toEqual({ x: { a: 1, b: 9, c: 3, d: 4 } })
  })

  it('child null deletes inherited key', () => {
    expect(mergeConfigs({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 })
  })

  it('child null on an object-valued key deletes the key (not crash, not assign null)', () => {
    const out = mergeConfigs({ x: { a: 1 } }, { x: null })
    expect(out).toEqual({})
    expect('x' in out).toBe(false)
  })

  it('child null on a non-existent inherited key deletes (no-op observable)', () => {
    expect(mergeConfigs({ a: 1 }, { b: null })).toEqual({ a: 1 })
  })

  it('inherited relative path value is unchanged in merged output', () => {
    expect(
      mergeConfigs({ incrementalFile: 'reports/stryker-incremental.json' }, { mutate: ['src/x.ts'] }),
    ).toEqual({
      incrementalFile: 'reports/stryker-incremental.json',
      mutate: ['src/x.ts'],
    })
  })
})

describe('readConfigFile', () => {
  it('parses a JSON config file', async () => {
    const f = await writeJson('cfg.json', { a: 1, b: 'two' })
    expect(await readConfigFile(f)).toEqual({ a: 1, b: 'two' })
  })

  it('throws ConfigError on malformed JSON with the file path in the message', async () => {
    const f = path.join(tmpDir, 'bad.json')
    await fs.promises.writeFile(f, '{ not json', 'utf-8')
    await expect(readConfigFile(f)).rejects.toThrow(/bad\.json/)
  })

  it('throws ConfigError when JS module has no default export', async () => {
    const f = await writeJs('cfg.mjs', 'export const a = 1\n')
    await expect(readConfigFile(f)).rejects.toThrow(/Default export/)
  })

  it('throws ConfigError naming the file when a JS parent fails to import', async () => {
    const f = await writeJs('cfg.mjs', 'throw new Error("boom")\n')
    await expect(readConfigFile(f)).rejects.toThrow(/Error during import/)
  })

  it('throws ConfigError when JSON config parses to a non-object', async () => {
    const f = await writeJson('cfg.json', [1, 2, 3])
    await expect(readConfigFile(f)).rejects.toThrow(/must be a JSON object/)
  })
})

describe('resolveExtendsChain', () => {
  it('returns the file content as-is when no extends is present', async () => {
    const f = await writeJson('child.json', { a: 1, b: 2 })
    expect(await resolveExtendsChain(f)).toEqual({ a: 1, b: 2 })
  })

  it('inherits a key the child does not state', async () => {
    const base = await writeJson('base.json', { a: 1, b: 2 })
    const child = await writeJson('child.json', { extends: './base.json', b: 9 })
    expect(await resolveExtendsChain(child)).toEqual({ a: 1, b: 9 })
  })

  it('child scalar replaces the inherited scalar', async () => {
    const base = await writeJson('base.json', { a: 1 })
    const child = await writeJson('child.json', { extends: './base.json', a: 99 })
    expect(await resolveExtendsChain(child)).toEqual({ a: 99 })
  })

  it('child array replaces the inherited array wholesale', async () => {
    const base = await writeJson('base.json', { mutate: ['src/a.ts', 'src/b.ts'] })
    const child = await writeJson('child.json', { extends: './base.json', mutate: ['src/c.ts'] })
    expect(await resolveExtendsChain(child)).toEqual({ mutate: ['src/c.ts'] })
  })

  it('child object merges one level deep over the inherited object', async () => {
    const base = await writeJson('base.json', { vitest: { dir: '.', related: true, configFile: 'vitest.config.ts' } })
    const child = await writeJson('child.json', { extends: './base.json', vitest: { related: false } })
    expect(await resolveExtendsChain(child)).toEqual({
      vitest: { dir: '.', related: false, configFile: 'vitest.config.ts' },
    })
  })

  it('child key set to null deletes the inherited key', async () => {
    const base = await writeJson('base.json', { a: 1, b: 2 })
    const child = await writeJson('child.json', { extends: './base.json', b: null })
    expect(await resolveExtendsChain(child)).toEqual({ a: 1 })
  })

  it('child null on an object-valued parent key deletes the key', async () => {
    const base = await writeJson('base.json', { vitest: { dir: '.' } })
    const child = await writeJson('child.json', { extends: './base.json', vitest: null })
    const out = await resolveExtendsChain(child)
    expect(out).toEqual({})
    expect('vitest' in out).toBe(false)
  })

  it('resolves a three-level grandparent chain with the nearest child winning', async () => {
    const grandparent = await writeJson('grand.json', { a: 'gp', b: 'gp', c: 'gp' })
    const parent = await writeJson('parent.json', { extends: './grand.json', b: 'parent', c: 'parent' })
    const child = await writeJson('child.json', { extends: './parent.json', c: 'child' })
    expect(await resolveExtendsChain(child)).toEqual({ a: 'gp', b: 'parent', c: 'child' })
  })

  it('an extends pointing at a missing file fails with the parent path in the message', async () => {
    const child = await writeJson('child.json', { extends: './missing.json' })
    await expect(resolveExtendsChain(child)).rejects.toThrow(/missing\.json/)
  })

  it('an extends pointing at malformed JSON fails with the parent path in the message', async () => {
    const base = path.join(tmpDir, 'bad.json')
    await fs.promises.writeFile(base, '{ not json', 'utf-8')
    const child = await writeJson('child.json', { extends: './bad.json' })
    await expect(resolveExtendsChain(child)).rejects.toThrow(/bad\.json/)
  })

  it('a two-file cycle fails rather than recursing', async () => {
    const a = await writeJson('a.json', { extends: './b.json' })
    const b = await writeJson('b.json', { extends: './a.json' })
    await expect(resolveExtendsChain(a)).rejects.toThrow(/cycle/i)
    await expect(resolveExtendsChain(b)).rejects.toThrow(/cycle/i)
  })

  it('a self-referential extends fails', async () => {
    const a = await writeJson('self.json', { extends: './self.json' })
    await expect(resolveExtendsChain(a)).rejects.toThrow(/cycle/i)
  })

  it('an inherited relative path value is unchanged in the resolved options', async () => {
    const base = await writeJson('base.json', { incrementalFile: 'reports/stryker-incremental.json' })
    const child = await writeJson('child.json', { extends: './base.json', mutate: ['src/x.ts'] })
    expect(await resolveExtendsChain(child)).toEqual({
      incrementalFile: 'reports/stryker-incremental.json',
      mutate: ['src/x.ts'],
    })
  })

  it('a JS config declaring extends resolves the same way as a JSON one', async () => {
    const base = await writeJson('base.json', { a: 1 })
    const child = await writeJs(
      'child.mjs',
      `import base from './base.json' with { type: 'json' }\nexport default { ...base, b: 2 }\n`,
    )
    const out = await resolveExtendsChain(child)
    expect(out).toEqual({ a: 1, b: 2 })
  })
})

describe('forkCoreSchema', () => {
  it('declares extends at the root so OptionsValidator does not warn', async () => {
    const { forkCoreSchema } = await import('../../src/config/fork-schema.js')
    const props = forkCoreSchema.properties as Record<string, unknown>
    expect(props['extends']).toBeDefined()
  })
})

describe('stryker-schema.json', () => {
  it('declares extends at the root so editors and validators accept it', async () => {
    const schemaRaw = await fs.promises.readFile(
      path.resolve(import.meta.dirname, '../../schema/stryker-schema.json'),
      'utf-8',
    )
    const schema = JSON.parse(schemaRaw) as { properties?: Record<string, unknown> }
    expect(schema.properties?.['extends']).toBeDefined()
  })
})

describe('ConfigReader integration', () => {
  // ConfigReader is not exported from src/index.ts (KTD3 keeps it internal), so
  // this test verifies the function loadOptionsFromConfigFile delegates to when
  // the child declares extends. A regression in either the wiring or the resolver
  // breaks this assertion.
  it('the extends key is stripped from resolved options and child values win over inherited', async () => {
    const base = await writeJson('base.json', { a: 1, b: 2, mutate: ['src/a.ts'] })
    const child = await writeJson('child.json', { extends: './base.json', b: 9 })
    const resolved = await resolveExtendsChain(child)
    expect(resolved).toEqual({ a: 1, b: 9, mutate: ['src/a.ts'] })
    expect('extends' in resolved).toBe(false)
  })

  it('treats extends: null the same whether it appears at the top or inside a chain', async () => {
    const base = await writeJson('base.json', { a: 1, extends: null })
    expect(await resolveExtendsChain(base)).toEqual({ a: 1 })
  })
})

describe('resolveExtendsTarget', () => {
  it('resolves a relative path against the config directory, not the process cwd', () => {
    const resolved = resolveExtendsTarget('./base.json', '/somewhere/pkg')
    expect(resolved).toBe(path.resolve('/somewhere/pkg', './base.json'))
  })

  it('resolves an absolute path unchanged', () => {
    const abs = path.resolve('/somewhere/base.json')
    expect(resolveExtendsTarget(abs, '/elsewhere')).toBe(abs)
  })

  it('resolves a scoped package specifier through node_modules', async () => {
    await writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {
      'base.json': { a: 1 },
    })
    const resolved = resolveExtendsTarget('@fake/preset/base', path.join(tmpDir, 'pkg'))
    expect(resolved).toBe(
      path.join(tmpDir, 'pkg', 'node_modules', '@fake', 'preset', 'base.json'),
    )
  })

  it('honours the package exports map rather than the literal subpath', async () => {
    await writeFakePackage('pkg', '@fake/preset', { './base': './dist/generated.json' }, {
      'dist/generated.json': { a: 1 },
      'base.json': { a: 'wrong-file' },
    })
    const resolved = resolveExtendsTarget('@fake/preset/base', path.join(tmpDir, 'pkg'))
    expect(resolved).toBe(
      path.join(tmpDir, 'pkg', 'node_modules', '@fake', 'preset', 'dist', 'generated.json'),
    )
  })

  it('resolves from the config directory even when a different package is installed at the cwd', async () => {
    await writeFakePackage('near', '@fake/preset', { './base': './near.json' }, {
      'near.json': { which: 'near' },
    })
    const resolved = resolveExtendsTarget('@fake/preset/base', path.join(tmpDir, 'near'))
    expect(resolved.startsWith(path.join(tmpDir, 'near'))).toBe(true)
    expect(resolved.startsWith(process.cwd())).toBe(false)
  })

  it('throws ConfigError naming the specifier when it cannot be resolved', () => {
    expect(() => resolveExtendsTarget('@nope/not-installed', tmpDir))
      .toThrow(/@nope\/not-installed/)
  })
})

describe('extends via a package specifier', () => {
  it('inherits a parent resolved through node_modules', async () => {
    await writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {
      'base.json': { a: 1, b: 2 },
    })
    const child = await writeJson('pkg/stryker.config.json', {
      extends: '@fake/preset/base',
      b: 9,
    })
    expect(await resolveExtendsChain(child)).toEqual({ a: 1, b: 9 })
  })

  it('applies the null-delete rule to a key inherited from a package parent', async () => {
    await writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {
      'base.json': { a: 1, checkers: ['typescript'] },
    })
    const child = await writeJson('pkg/stryker.config.json', {
      extends: '@fake/preset/base',
      checkers: null,
    })
    const out = await resolveExtendsChain(child)
    expect(out).toEqual({ a: 1 })
    expect('checkers' in out).toBe(false)
  })

  it('detects a cycle that runs through a package specifier', async () => {
    const pkgDir = await writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {})
    const child = path.join(tmpDir, 'pkg', 'stryker.config.json')
    await fs.promises.writeFile(
      path.join(pkgDir, 'base.json'),
      JSON.stringify({ extends: child }),
      'utf-8',
    )
    await fs.promises.writeFile(
      child,
      JSON.stringify({ extends: '@fake/preset/base' }),
      'utf-8',
    )
    await expect(resolveExtendsChain(child)).rejects.toThrow(/cycle/i)
  })
})

describe('the shipped base preset', () => {
  it('is resolvable by the specifier every package config uses', () => {
    const resolved = resolveExtendsTarget(
      '@systemfsoftware/stryker-js-core/config/base',
      path.resolve(import.meta.dirname, '../..'),
    )
    expect(fs.existsSync(resolved)).toBe(true)
  })

  it('supplies the modal options a package config omits', async () => {
    const child = await writeJson('stryker.config.json', {
      extends: '@systemfsoftware/stryker-js-core/config/base',
      mutate: ['src/only-this.ts'],
    })
    const out = await resolveExtendsChain(child) as Record<string, unknown>
    expect(out['mutate']).toEqual(['src/only-this.ts'])
    expect(out['testRunner']).toBe('vitest')
    expect(out['thresholds']).toEqual({ high: 100, low: 80, break: 100 })
  })
})
