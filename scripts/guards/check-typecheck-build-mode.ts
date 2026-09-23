#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write=/tmp --allow-env
import { dirname, join, relative } from '@std/path'
import { parse } from '@std/yaml'

const WS = 'pnpm-workspace.yaml'
const TS_CONFIG = 'tsconfig.json'
const MANIFEST = 'package.json'
const TSC = join(Deno.cwd(), 'node_modules/.bin/tsc')

type TsConfig = { files?: unknown; references?: unknown; include?: unknown }

const dec = new TextDecoder()

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

const workspaceGlobs = async (wsPath: string): Promise<readonly string[]> => {
  let doc: unknown
  try {
    doc = parse(await Deno.readTextFile(wsPath))
  } catch (cause) {
    throw new Error(`${wsPath}: unparseable YAML — cannot name what the guard would miss`, { cause })
  }
  const declared = (doc as { packages?: unknown } | null)?.packages
  if (!Array.isArray(declared)) throw new Error(`${wsPath}: no \`packages:\` sequence`)
  if (declared.length === 0) throw new Error(`${wsPath}: \`packages:\` block is empty`)
  return declared.map((entry, i) => {
    if (typeof entry !== 'string') throw new Error(`${wsPath}: entry #${i + 1} is not a string glob`)
    if (!entry.endsWith('/*')) throw new Error(`${wsPath}: only \`<dir>/*\` globs are understood; got: ${entry}`)
    return entry
  })
}

const packagesWithTsconfig = async (root: string): Promise<readonly string[]> => {
  const dirs = new Set<string>()
  for (const glob of await workspaceGlobs(join(root, WS))) {
    const prefix = join(root, glob.slice(0, -2))
    if (!(await exists(prefix))) continue
    for await (const entry of Deno.readDir(prefix)) {
      if (!entry.isDirectory) continue
      const dir = join(prefix, entry.name)
      if (await exists(join(dir, TS_CONFIG))) dirs.add(dir)
    }
  }
  return [...dirs].sort()
}

const isReferenceOnly = (config: TsConfig): boolean => {
  const files = Array.isArray(config.files) ? config.files : null
  const references = Array.isArray(config.references) ? config.references : null
  return files !== null && files.length === 0 && references !== null && references.length > 0
}

const runsBuild = (script: string): boolean =>
  script.split(/\s*(?:&&|\|\||;|\||\n)\s*/).some((command) => {
    const tokens = command.trim().split(/\s+/)
    const tscAt = tokens.findIndex((token) => token === 'tsc' || token.endsWith('/tsc'))
    return tscAt !== -1 && tokens.slice(tscAt + 1).some((token) => token === '-b' || token === '--build')
  })

const buildModeViolation = (label: string, referenceOnly: boolean, script: string | null): string | null =>
  referenceOnly && (script === null || !runsBuild(script))
    ? `${label}: typecheck '${script ?? '(none)'}' does not build referenced projects`
    : null

const readManifestScript = async (dir: string): Promise<string | null> => {
  try {
    const manifest = JSON.parse(await Deno.readTextFile(join(dir, MANIFEST))) as { scripts?: unknown }
    const script = (manifest.scripts as Record<string, unknown> | undefined)?.typecheck
    return typeof script === 'string' ? script : null
  } catch {
    return null
  }
}

const packageViolation = async (
  root: string,
  dir: string,
): Promise<{ readonly referenceOnly: boolean; readonly violation: string | null }> => {
  let config: TsConfig
  try {
    config = JSON.parse(await Deno.readTextFile(join(dir, TS_CONFIG))) as TsConfig
  } catch (cause) {
    throw new Error(
      `${dir}/${TS_CONFIG}: unparsable JSON — ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  if (!isReferenceOnly(config)) return { referenceOnly: false, violation: null }
  return {
    referenceOnly: true,
    violation: buildModeViolation(relative(root, dir), true, await readManifestScript(dir)),
  }
}

const main = async (): Promise<number> => {
  const root = Deno.cwd()
  const dirs = await packagesWithTsconfig(root)
  if (dirs.length === 0) throw new Error('no workspace package carries a tsconfig.json — refusing the empty verdict')

  const violations: string[] = []
  let referenceOnly = 0
  for (const dir of dirs) {
    const judged = await packageViolation(root, dir)
    if (judged.referenceOnly) referenceOnly++
    if (judged.violation !== null) violations.push(judged.violation)
  }

  if (violations.length > 0) {
    console.error(
      `typecheck build mode: ${violations.length} reference-only root(s) of ${dirs.length} package(s) with a tsconfig.json are typechecked without 'tsc -b':`,
    )
    console.error('')
    for (const violation of violations) console.error(violation)
    console.error('')
    console.error(
      'A reference-only root (`files: []` plus references) typechecks nothing by itself: a non-build `tsc` exits 0 on a',
    )
    console.error(
      'tree that does not compile, while `tsc -b` reaches the referenced projects and reports their errors (R4).',
    )
    return 1
  }

  console.log(
    `typecheck build mode: ${referenceOnly} reference-only root(s) of ${dirs.length} package(s) with a tsconfig.json, each typechecked with 'tsc -b'`,
  )
  return 0
}

const plant = async (root: string, files: Readonly<Record<string, string>>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    await Deno.mkdir(dirname(target), { recursive: true })
    await Deno.writeTextFile(target, content)
  }
}

const runTsc = async (
  args: readonly string[],
): Promise<{ readonly success: boolean; readonly report: string }> => {
  const out = await new Deno.Command(TSC, { args: [...args], stdout: 'piped', stderr: 'piped' }).output()
  const report = [dec.decode(out.stderr), dec.decode(out.stdout)].filter((text) => text.trim().length > 0)
    .join('\n').trim().split('\n').slice(-8).join('\n')
  return { success: out.success, report }
}

const REFERENCE_ROOT = '{"files": [], "references": [{"path": "./tsconfig.app.json"}]}\n'
const APP = '{"compilerOptions": {"composite": true}, "include": ["src"]}\n'
const TS = 'export const x = 1\n'
const BROKEN = "export const x: number = 'nope'\n"

const selftest = async (): Promise<number> => {
  const failures: string[] = []
  const wsRoot = await Deno.makeTempDir({ prefix: 'typecheck-build-mode-' })

  try {
    const flagged = (script: string | null): string | null => buildModeViolation('p', true, script)
    const checks: readonly [string, boolean][] = [
      [
        'files: [] plus references is reference-only',
        isReferenceOnly({ files: [], references: [{ path: './a.json' }] }),
      ],
      ['files: [] without references is not reference-only', !isReferenceOnly({ files: [] })],
      [
        'references without an empty files array is not reference-only',
        !isReferenceOnly({ references: [{ path: './a.json' }] }),
      ],
      ['an include-based config is not reference-only', !isReferenceOnly({ include: ['src'] })],
      [
        'a non-reference-only root is never flagged',
        buildModeViolation('p', false, 'tsc --noEmit --incremental') === null,
      ],
      ['tsc --noEmit is flagged', flagged('tsc --noEmit --incremental') !== null],
      ['tsc -b builds', flagged('tsc -b') === null],
      ['tsc --build builds', flagged('tsc --build') === null],
      ['a composed script builds when a segment builds', flagged('tsc --noEmit --incremental && tsc -b') === null],
      [
        'a composed script is flagged when no segment builds',
        flagged('tsc --noEmit; tsc --noEmit -p tsconfig.test.json') !== null,
      ],
      ['an absent typecheck script is flagged as (none)', (flagged(null) ?? '').includes("'(none)'")],
      ['a runner-prefixed tsc -b still builds', flagged('pnpm exec tsc -b') === null],
    ]
    for (const [label, ok] of checks) {
      if (!ok) failures.push(`  ${label}`)
    }

    await plant(wsRoot, {
      'pkgs/no-emit/tsconfig.json': REFERENCE_ROOT,
      'pkgs/no-emit/tsconfig.app.json': APP,
      'pkgs/no-emit/src/index.ts': TS,
      'pkgs/no-emit/package.json': '{"scripts": {"typecheck": "tsc --noEmit"}}\n',
      'pkgs/build/tsconfig.json': REFERENCE_ROOT,
      'pkgs/build/tsconfig.app.json': APP,
      'pkgs/build/src/index.ts': TS,
      'pkgs/build/package.json': '{"scripts": {"typecheck": "tsc -b"}}\n',
      'premise/tsconfig.json': REFERENCE_ROOT,
      'premise/tsconfig.app.json': APP,
      'premise/src/broken.ts': BROKEN,
    })

    const noEmit = await packageViolation(wsRoot, join(wsRoot, 'pkgs/no-emit'))
    const buildRow = await packageViolation(wsRoot, join(wsRoot, 'pkgs/build'))
    const fixtureRows: readonly [string, string | null, string | null][] = [
      [
        'a reference-only fixture with a non-build typecheck is flagged',
        noEmit.violation,
        "pkgs/no-emit: typecheck 'tsc --noEmit' does not build referenced projects",
      ],
      [
        'a reference-only fixture with tsc -b passes',
        buildRow.violation,
        null,
      ],
    ]
    for (const [label, got, expect] of fixtureRows) {
      if (got !== expect) {
        failures.push(`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`)
      }
    }

    const premiseRoot = join(wsRoot, 'premise')
    const quiet = await runTsc(['--noEmit', '-p', premiseRoot])
    if (!quiet.success) {
      failures.push(`  the premise: tsc --noEmit on a reference-only root must exit 0\n    ${quiet.report}`)
    }
    const built = await runTsc(['-b', premiseRoot])
    if (built.success) {
      failures.push(
        '  the premise: tsc -b on the same root must exit non-zero — the fixture type error did not surface',
      )
    }

    if (failures.length > 0) {
      console.error(
        `check-typecheck-build-mode: selftest FAILED (${failures.length}/${checks.length + fixtureRows.length + 2})\n`,
      )
      for (const failure of failures) console.error(failure)
      return 1
    }
    console.log(
      `check-typecheck-build-mode: selftest ok (${fixtureRows.length} fixture rows + ${checks.length} mechanism rows + 2 premise rows)`,
    )
    return 0
  } finally {
    await Deno.remove(wsRoot, { recursive: true }).catch(() =>
      console.error(`warning: could not remove the fixture ${wsRoot}`)
    )
  }
}

try {
  Deno.exitCode = Deno.args.includes('--selftest') ? await selftest() : await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
