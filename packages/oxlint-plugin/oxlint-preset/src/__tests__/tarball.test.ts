import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  LOCAL_OXLINT,
  PACKAGE_ROOT,
  packageWorkDir,
  removeWorkDirs,
  REPO_ROOT,
  run,
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

let tarballPath = ''
let packedManifest: { dependencies?: Record<string, string> } = {}

const collectWorkspaceManifests = (dir: string): { name?: unknown; private?: unknown }[] => {
  const found: { name?: unknown; private?: unknown }[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'temp', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectWorkspaceManifests(full))
    else if (entry.name === 'package.json') found.push(JSON.parse(readFileSync(full, 'utf8')))
  }
  return found
}

beforeAll(() => {
  const distEntry = path.join(PACKAGE_ROOT, 'dist', 'index.mjs')
  if (!existsSync(distEntry)) throw new Error(`the packed surface is built, not authored: build ${distEntry} first`)
  const pack = run('pnpm', ['pack', '--pack-destination', PACK_DIR], PACKAGE_ROOT)
  if (pack.code !== 0) throw new Error(`pnpm pack failed: ${pack.output}`)
  const tarballs = readdirSync(PACK_DIR).filter((name) => name.endsWith('.tgz'))
  expect(tarballs).toHaveLength(1)
  tarballPath = path.join(PACK_DIR, tarballs[0] ?? '')
  packedManifest = JSON.parse(run('tar', ['-xzOf', tarballPath, 'package/package.json'], PACK_DIR).output)
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
    const dependencies = Object.keys(packedManifest.dependencies ?? {})
    const privateNames = collectWorkspaceManifests(path.join(REPO_ROOT, 'packages'))
      .filter((manifest) => manifest.private === true && typeof manifest.name === 'string')
      .map((manifest) => manifest.name)
    expect(dependencies.length).toBeGreaterThan(0)
    expect(dependencies.filter((name) => privateNames.includes(name))).toStrictEqual([])
  })
})

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
    const parsed: { diagnostics: { code: string }[] } = JSON.parse(tailJson(violations.output))
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
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
    const offline = run('pnpm', [...addArgs, '--offline'], consumer)
    const installed = offline.code === 0 ? offline : run('pnpm', addArgs, consumer)
    if (installed.code !== 0) {
      if (OFFLINE_LIMITATION.test(installed.output)) {
        context.skip(
          `pnpm cannot reach the registry or store here: ${installed.output.trim().split('\n').at(-1) ?? ''}`,
        )
        return
      }
      throw new Error(`the packed artifact could not be installed: ${installed.output}`)
    }

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
    if (UNPUBLISHED_PRESET_SUBPATH.test(load.output)) {
      const unpublishable = load.output.match(/in\s+(\S+package\.json)/u)
      context.skip(
        `a published fragment predates its ./preset subpath: ${
          unpublishable?.[1] ?? load.output.trim().split('\n')[0]
        }`,
      )
      return
    }
    expect(load.output.replaceAll('\n', ' ')).not.toContain('not found')
    expect(load.code).toBe(0)
  })
})
