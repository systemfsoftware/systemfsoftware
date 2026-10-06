import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { transformSync } from 'esbuild'

import { FORK_DIR, forkPathFor, SPECIFIER_MAP, upstreamDirOfSuitePath } from './src/specifier-map.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

// The lane's only source of upstream's suite is the flake output (KTD5.1). The
// wrapper prints its store path; the suite is materialized beside this config so
// the suite files' bare imports resolve through this package's node_modules.
const suiteStore = execFileSync('bash', [join(here, 'bin', 'upstream-suite')], { encoding: 'utf8' }).trim()
const suiteRoot = join(here, '.suite')
const stamp = join(suiteRoot, '.source')
if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== suiteStore) {
  rmSync(suiteRoot, { recursive: true, force: true })
  cpSync(suiteStore, suiteRoot, { recursive: true })
  writeFileSync(stamp, `${suiteStore}\n`)
}

const packageRoot = (dir: string): string => join(suiteRoot, 'packages', dir)

const firstFile = (base: string): string | undefined =>
  [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  )

/**
 * Resolves every upstream specifier through the committed map (KTD5.3): a mapped
 * package specifier to its fork entry, and a relative `src/` import to the same
 * file under that package's fork directory. A specifier the map cannot resolve
 * is refused — the lane fails and names it rather than falling through to a
 * stray build.
 */
const resolver = {
  name: 'xstate-upstream-resolver',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    const mappedSource = Object.hasOwn(SPECIFIER_MAP, source) ? SPECIFIER_MAP[source] : undefined
    if (mappedSource !== undefined) {
      const mapped = firstFile(resolve(repoRoot, mappedSource))
      return mapped ?? null
    }
    if (importer === undefined || !importer.includes('/.suite/')) return undefined
    const relativeImporter = relative(suiteRoot, importer)
    const upstreamDir = upstreamDirOfSuitePath(relativeImporter.split('/').slice(1).join('/'))
    if (upstreamDir === undefined) return undefined
    // `#is-development` resolves through the fork package's `imports` map to the
    // same file a fork source's own `#is-development` resolves to, so the suite
    // file's `vi.doMock('#is-development')` and the fork source's import share an
    // id. Vitest runs in development, so the condition is `development`.
    if (source === '#is-development') {
      return resolve(repoRoot, `packages/xstate/${FORK_DIR[upstreamDir]}/src/true.ts`)
    }
    if (!(source.startsWith('./') || source.startsWith('../'))) return undefined
    const packageRelative = relative(packageRoot(upstreamDir), resolve(dirname(importer), source))
    const forkRelative = forkPathFor(upstreamDir, packageRelative)
    return forkRelative === undefined ? undefined : firstFile(resolve(repoRoot, forkRelative)) ?? null
  },
}

/**
 * Upstream's inline snapshots capture the function source `serializeMachine`
 * reads with `fn.toString()`. Vite 8 reprints test modules with oxc (tabs,
 * `undefined`); upstream's snapshots hold esbuild's reprint (two spaces, `void
 * 0`). Reprinting each suite test file with the repo's esbuild restores the text
 * upstream's own run produced, so its snapshots hold unedited (plan KTD5).
 */
const esbuildSource = {
  name: 'xstate-upstream-esbuild-source',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!/[/\\]\.suite[/\\].*\.(ts|tsx)$/.test(id)) return undefined
    const loaded = transformSync(code, {
      loader: id.endsWith('.tsx') ? 'tsx' : 'ts',
      jsx: 'automatic',
      target: 'esnext',
      format: 'esm',
    })
    return { code: loaded.code, map: null }
  },
}

/** zod 4's root, v3 and v4 entries, for the packages whose tests were written against zod 4. */
const zodV4Alias = [
  { find: /^zod$/, replacement: 'zod-v4' },
  { find: /^zod\/v3$/, replacement: 'zod-v4/v3' },
  { find: /^zod\/v4$/, replacement: 'zod-v4/v4' },
]

type Project = {
  readonly name: string
  readonly dir: string
  readonly environment: string
  readonly include: ReadonlyArray<string>
  readonly exclude?: ReadonlyArray<string>
  readonly zodV4?: boolean
}

// One project per upstream package, keeping upstream's environment and include
// (KTD5.2). The three tooling files U3 retired (declarations and the two lint
// suites) are named in `disposition.json`; they are not run, because a retired
// case is accounted for by its replacement rather than held.
const projects: ReadonlyArray<Project> = [
  {
    name: 'upstream-core',
    dir: 'core',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['test/declarations.test.ts'],
  },
  {
    name: 'upstream-xstate-effect',
    dir: 'xstate-effect',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/lint.test.ts'],
  },
  {
    name: 'upstream-xstate-test',
    dir: 'xstate-test',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/engine/propertySuite.test.ts'],
    zodV4: true,
  },
  {
    name: 'upstream-xstate-react',
    dir: 'xstate-react',
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/lint.test.ts'],
  },
  {
    name: 'upstream-xstate-store',
    dir: 'xstate-store',
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    zodV4: true,
  },
  {
    name: 'upstream-xstate-store-react',
    dir: 'xstate-store-react',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    zodV4: true,
  },
]

export default defineConfig({
  ...sharedConfig,
  // Suite files are transformed by esbuild (above) so the function source their
  // snapshots capture matches upstream's run; oxc is told to leave them alone.
  oxc: { exclude: [/[/\\]\.suite[/\\]/] },
  plugins: [resolver, esbuildSource],
  test: {
    ...sharedConfig.test,
    // The reporter (src/reporter.ts) reads this JSON beside disposition.json.
    reporters: [['json', { outputFile: '.oracle/report.json' }], 'default'],
    projects: [
      {
        extends: true,
        test: {
          name: 'own',
          globals: true,
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        // The fork-owned replacement tests a retired lane case names (R4). They
        // live in each package's `tests/` directory, which U4 does not delete.
        extends: true,
        root: repoRoot,
        test: {
          name: 'replacements',
          globals: true,
          environment: 'node',
          include: ['packages/xstate/*/tests/**/*.test.ts'],
        },
      },
      ...projects.map((project) => ({
        extends: true,
        root: packageRoot(project.dir),
        ...(project.zodV4 ? { resolve: { alias: zodV4Alias } } : {}),
        test: {
          name: project.name,
          globals: true,
          environment: project.environment,
          include: [...project.include],
          exclude: [...(sharedConfig.test?.exclude ?? []), ...(project.exclude ?? [])],
        },
      })),
    ],
  },
})
