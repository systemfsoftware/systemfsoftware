import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest'

import {
  decodeDiagnostics,
  LOCAL_OXLINT,
  PACKAGE_ROOT,
  packageWorkDir,
  parseJson,
  removeWorkDirs,
  REPO_ROOT,
  requireObject,
  requireStringRecord,
  run,
  type RunResult,
  tailJson,
  tmpWorkDir,
  writeFiles,
} from './oxlint-probe.js'

afterAll(removeWorkDirs)

const CONSUMER_CONFIG = [
  "import preset from './package/dist/index.mjs'",
  "import { defineConfig } from 'oxlint'",
  '',
  'export default defineConfig({ extends: [preset] })',
  '',
].join('\n')

const TARGET_FILE = 'const value = 1\nexport { value }\n'

const OFFLINE_LIMITATION = /ERR_PNPM_NO_OFFLINE_(?:META|TARBALL)|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/u
const UNPUBLISHED_PRESET_SUBPATH = /ERR_PACKAGE_PATH_NOT_EXPORTED[\s\S]*'\.\/preset' is not defined by "exports"/u

const PACK_DIR = packageWorkDir('pack')

type PackedManifest = { dependencies: Record<string, string> }
type WorkspaceManifest = { name: string | undefined; private: boolean }

let tarballPath = ''
let packedManifest: PackedManifest = { dependencies: {} }

const decodePackedManifest = (text: string): PackedManifest => {
  const manifest = requireObject(parseJson(text), 'the packed package.json')
  const dependencies = 'dependencies' in manifest ? manifest.dependencies : undefined
  return {
    dependencies: dependencies === undefined ? {} : requireStringRecord(dependencies, 'the packed dependencies'),
  }
}

const decodeWorkspaceManifest = (text: string, source: string): WorkspaceManifest => {
  const manifest = requireObject(parseJson(text), `the manifest at ${source}`)
  const name = 'name' in manifest ? manifest.name : undefined
  const declaredPrivate = 'private' in manifest ? manifest.private : undefined
  return {
    name: typeof name === 'string' ? name : undefined,
    private: declaredPrivate === true,
  }
}

const collectWorkspaceManifests = (dir: string): WorkspaceManifest[] => {
  const found: WorkspaceManifest[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'temp', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectWorkspaceManifests(full))
    else if (entry.name === 'package.json') found.push(decodeWorkspaceManifest(readFileSync(full, 'utf8'), full))
  }
  return found
}

const privatePackageNames = (dir: string): string[] =>
  collectWorkspaceManifests(dir)
    .filter((manifest) => manifest.private)
    .map((manifest) => manifest.name)
    .filter((name): name is string => name !== undefined)

beforeAll(() => {
  const distEntry = path.join(PACKAGE_ROOT, 'dist', 'index.mjs')
  if (!existsSync(distEntry)) throw new Error(`the packed surface is built, not authored: build ${distEntry} first`)
  const pack = run('pnpm', ['pack', '--pack-destination', PACK_DIR], PACKAGE_ROOT)
  if (pack.code !== 0) throw new Error(`pnpm pack failed: ${pack.output}`)
  const tarballs = readdirSync(PACK_DIR).filter((name) => name.endsWith('.tgz'))
  expect(tarballs).toHaveLength(1)
  tarballPath = path.join(PACK_DIR, tarballs[0] ?? '')
  packedManifest = decodePackedManifest(run('tar', ['-xzOf', tarballPath, 'package/package.json'], PACK_DIR).output)
})

describe('packed surface', () => {
  it('Should_ShipTheDistEntrypointsAndNoSources_When_ThePackageIsPacked', () => {
    const entries = run('tar', ['tzf', tarballPath], PACK_DIR)
      .output.split('\n')
      .filter((entry) => entry.length > 0)
    expect(entries).toContain('package/dist/index.mjs')
    expect(entries).toContain('package/dist/instrument.mjs')
    expect(entries).toContain('package/dist/oxlint-preset.d.ts')
    expect(entries).toContain('package/dist/instrument.d.ts')
    expect(entries).toContain('package/package.json')
    expect(entries.some((entry) => entry.includes('/src/'))).toBe(false)
  })

  it('Should_DeclareOnlyPublishableDependencies_When_ThePackedManifestIsRead', () => {
    const dependencies = Object.keys(packedManifest.dependencies)
    const privateNames = privatePackageNames(path.join(REPO_ROOT, 'packages'))
    expect(dependencies.length).toBeGreaterThan(0)
    expect(dependencies.filter((name) => privateNames.includes(name))).toStrictEqual([])
  })
})

const installPackedPreset = (addArgs: readonly string[], consumer: string): RunResult => {
  const offline = run('pnpm', [...addArgs, '--offline'], consumer)
  return offline.code === 0 ? offline : run('pnpm', [...addArgs], consumer)
}

const lastLineOf = (text: string): string => text.trim().split('\n').at(-1) ?? ''

const firstLineOf = (text: string): string => text.trim().split('\n').at(0) ?? ''

const requireInstalled = (installed: RunResult, context: TestContext): void => {
  if (installed.code === 0) return
  if (OFFLINE_LIMITATION.test(installed.output)) {
    context.skip(`pnpm cannot reach the registry or store here: ${lastLineOf(installed.output)}`)
    return
  }
  const unpublished = installed.output.match(/\[ERR_PNPM_FETCH_404\][^\n]*registry\.npmjs\.org[^\n]*Not Found/u) ??
    installed.output.match(/is not in the npm registry/u)
  if (unpublished !== null) {
    context.skip(
      `a packed dependency is not on the registry yet (published by this branch's release, not the working tree): ${
        lastLineOf(installed.output)
      }`,
    )
    return
  }
  throw new Error(`the packed artifact could not be installed: ${installed.output}`)
}

const requirePublishedPresetSubpath = (load: RunResult, context: TestContext): void => {
  if (!UNPUBLISHED_PRESET_SUBPATH.test(load.output)) return
  const unpublishable = load.output.match(/in\s+(\S+package\.json)/u)
  context.skip(
    `a published fragment predates its ./preset subpath: ${unpublishable?.[1] ?? firstLineOf(load.output)}`,
  )
}

describe('artifact in a consumer', () => {
  it('Should_RunTheFragmentRules_When_ThePackedPresetExtendsIntoOxlint', () => {
    const consumer = packageWorkDir('artifact')
    const extract = run('tar', ['-xzf', tarballPath, '-C', consumer], consumer)
    expect(extract.code).toBe(0)
    writeFiles(consumer, {
      'oxlint.config.ts': CONSUMER_CONFIG,
      'target.ts': TARGET_FILE,
      'main.ts': 'const entry = 1\nexport { entry }\n',
      'control.config.ts':
        "export default { rules: { '@systemfsoftware/oxlint-plugin-cell-vocabulary/no-io-in-phase-bodies': 'error' } }\n",
    })

    const control = run(LOCAL_OXLINT, ['-c', 'control.config.ts', 'target.ts'], consumer)
    expect(control.code).not.toBe(0)
    expect(control.output).toContain("Plugin '@systemfsoftware/cell-vocabulary' not found")

    const clean = run(LOCAL_OXLINT, ['-c', 'oxlint.config.ts', 'target.ts'], consumer)
    expect(clean.output.replaceAll('\n', ' ')).not.toContain('not found')
    expect(clean.code).toBe(0)

    const violations = run(LOCAL_OXLINT, ['-c', 'oxlint.config.ts', '-f', 'json', 'main.ts'], consumer)
    const diagnostics = decodeDiagnostics(parseJson(tailJson(violations.output)))
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      '@systemfsoftware/effect-entrypoint(entrypoint-no-exports)',
    )
  })

  it('Should_ResolveEveryDeclaredDependency_When_ThePackedPresetIsInstalledFromTheRegistry', (context) => {
    const consumer = tmpWorkDir('registry-consumer')
    writeFiles(consumer, {
      'package.json': `${JSON.stringify({ name: 'oxlint-preset-consumer', private: true, type: 'module' }, null, 2)}\n`,
    })
    const store = run('pnpm', ['store', 'path'], REPO_ROOT).output.trim()
    const addArgs = ['add', tarballPath, 'oxlint@1.77.0', '--ignore-scripts', '--store-dir', store]
    requireInstalled(installPackedPreset(addArgs, consumer), context)

    writeFiles(consumer, {
      'oxlint.config.ts': [
        "import preset from '@systemfsoftware/oxlint-preset'",
        "import { defineConfig } from 'oxlint'",
        '',
        'export default defineConfig({ extends: [preset] })',
        '',
      ].join('\n'),
      'target.ts': TARGET_FILE,
    })
    const installedOxlint = path.join(consumer, 'node_modules', '.bin', 'oxlint')
    const load = run(installedOxlint, ['-c', 'oxlint.config.ts', 'target.ts'], consumer)
    requirePublishedPresetSubpath(load, context)
    expect(load.output.replaceAll('\n', ' ')).not.toContain('not found')
    expect(load.code).toBe(0)
  })
})
