import { assertEquals, assert } from '@std/assert'
import { beforeEach, afterEach, describe, it } from '@std/testing/bdd'
import { basename, dirname, fromFileUrl, join } from '@std/path'
import type { ProcessResult } from './lint-outcome.ts'
import {
  TRUNCATION_MARKER,
  productionDeps,
  runLintGuard,
  type CommandSpec,
  type HookResult,
  type LintGuardDeps,
} from './lint-guard.ts'

const CLEAN: ProcessResult = { exitCode: 0, stdout: '', stderr: '' }

const NO_DEBUGGER_OUTPUT = 'src/bad.ts:1:1: `debugger` statement is not allowed [Error/eslint(no-debugger)]\n\n1 problem\n'

const VIOLATION: ProcessResult = { exitCode: 1, stdout: NO_DEBUGGER_OUTPUT, stderr: '' }

const NO_FILES: ProcessResult = {
  exitCode: 1,
  stdout: 'No files found to lint. Please check your paths and ignore patterns.\n',
  stderr: '',
}

const OUTSIDE_ROOT: ProcessResult = {
  exitCode: 1,
  stdout: 'path is expected to be under the root\n',
  stderr: '',
}

const TSGOLINT_MISSING: ProcessResult = {
  exitCode: 1,
  stdout: 'Failed to find tsgolint executable. You may need to add the `oxlint-tsgolint` package to your project?\n',
  stderr: '',
}

const TSGOLINT_NOISE: ProcessResult = {
  exitCode: 1,
  stdout: 'Failed to find tsgolint executable. You may need to add the `oxlint-tsgolint` package to your project?\n',
  stderr: 'warning: unrelated runtime noise from the backend\n',
}

// Independent restatements of the guard's message strings: a drift in either
// side fails these tests, exactly as the characterization baseline pins them.
const FIX_ROOT_CAUSE =
  'Fix the root cause of each violation — do not suppress the rule with an eslint-disable comment,\n' +
  'and do not weaken the oxlint config to make the check pass.'

const TYPE_AWARE_UNAVAILABLE =
  'the type-aware backend (oxlint-tsgolint) was unavailable, so these findings come from\n' +
  'the lint pass without type information.'

const VIOLATION_STDERR = `oxlint-guard: lint violations found.\n${FIX_ROOT_CAUSE}\n\n${NO_DEBUGGER_OUTPUT}`

const RETRY_VIOLATION_STDERR =
  `oxlint-guard: lint violations found.\n${TYPE_AWARE_UNAVAILABLE}\n${FIX_ROOT_CAUSE}\n\n${NO_DEBUGGER_OUTPUT}`

const NO_CONFIG_STDERR =
  'oxlint-guard: no oxlint config found in any directory up from the edited file.\n' +
  'Add one of oxlint.config.ts, oxlint.config.js, oxlint.config.mjs, oxlint.config.cjs, .oxlintrc.json, or oxlint.json at the project root, and install oxlint locally: install oxlint as a dev dependency of this project'

const NO_BINARY_BUN_STDERR =
  'oxlint-guard: no local oxlint binary (node_modules/.bin/oxlint) found in any directory up from the edited file.\n' +
  'Install oxlint locally: bun add -d oxlint\n' +
  'Make sure an oxlint config (oxlint.config.ts, oxlint.config.js, oxlint.config.mjs, oxlint.config.cjs, .oxlintrc.json, or oxlint.json) exists at the project root.'

const DENO_MISSING_STDERR = 'oxlint-guard: deno not found on PATH. Install Deno to check and lint Deno-scripted files.'

// The guard's own allowlist, restated independently so the security assertion
// cannot pass by comparing the implementation against itself.
const ALLOWLIST: readonly string[] = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SystemRoot',
  'COMSPEC',
  'PATHEXT',
]

const DENO_SHEBANG = '#!/usr/bin/env -S deno run\n'

const PROJECT_FILES: Readonly<Record<string, string>> = {
  'oxlint.config.mjs': 'export default {}\n',
  'node_modules/.bin/oxlint': 'fake-oxlint\n',
  'src/clean.ts': 'export const a = 1\n',
  'src/bad.ts': 'debugger\n',
  'src/ignored.ts': 'export const b = 2\n',
  'src/outside.ts': 'export const c = 3\n',
  'src/tsgolint.ts': 'export const d = 4\n',
  'src/retry.ts': 'export const e = 5\n',
  'src/tsgolint-exhausted.ts': 'export const f = 6\n',
  'src/tsgolint-noise.ts': 'export const g = 7\n',
  'src/typeaware-timeout.ts': 'export const i = 9\n',
  'src/retry-timeout.ts': 'export const j = 10\n',
  'src/eacces.ts': 'export const k = 11\n',
  'src/--fixme.ts': 'export const l = 12\n',
  'src/readme.md': '# readme\n',
  'src/deno.ts': DENO_SHEBANG,
  'src/deno-check-fail.ts': DENO_SHEBANG,
  'src/deno-lint-fail.ts': DENO_SHEBANG,
  'src/deno-missing.ts': DENO_SHEBANG,
}

const payload = (filePath: string): string =>
  JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })

const makeProject = async (files: Readonly<Record<string, string>> = PROJECT_FILES): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'oxlint-guard-test-' })
  for (const [relative, contents] of Object.entries(files)) {
    const target = join(root, relative)
    await Deno.mkdir(dirname(target), { recursive: true })
    await Deno.writeTextFile(target, contents)
  }
  return root
}

interface SpawnRecord {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
}

type ShimResult = ProcessResult | 'hang' | 'spawn-not-found' | 'spawn-permission'

type Shim = (spec: CommandSpec) => ShimResult

const defaultShim: Shim = (spec) => {
  const file = basename(spec.args.at(-1) ?? '')
  if (spec.command === 'deno') {
    switch (file) {
      case 'deno-check-fail.ts':
        return spec.args[0] === 'check' ? VIOLATION : CLEAN
      case 'deno-lint-fail.ts':
        return spec.args[0] === 'check' ? CLEAN : VIOLATION
      case 'deno-missing.ts':
        return 'spawn-not-found'
      default:
        return CLEAN
    }
  }
  switch (file) {
    case 'tsgolint.ts':
      return spec.args.includes('--type-aware') ? TSGOLINT_MISSING : CLEAN
    case 'retry.ts':
      return spec.args.includes('--type-aware') ? TSGOLINT_MISSING : VIOLATION
    case 'tsgolint-exhausted.ts':
      return TSGOLINT_MISSING
    case 'tsgolint-noise.ts':
      return spec.args.includes('--type-aware') ? TSGOLINT_NOISE : CLEAN
    case 'eacces.ts':
      return 'spawn-permission'
    case 'typeaware-timeout.ts':
      return spec.args.includes('--type-aware') ? 'hang' : CLEAN
    case 'retry-timeout.ts':
      return spec.args.includes('--type-aware') ? TSGOLINT_MISSING : 'hang'
    case 'bad.ts':
      return VIOLATION
    case 'ignored.ts':
      return NO_FILES
    case 'outside.ts':
      return OUTSIDE_ROOT
    default:
      return CLEAN
  }
}

const makeDeps = (root: string, shim: Shim, records: SpawnRecord[]): LintGuardDeps => ({
  readTextFile: (path) => Deno.readTextFile(path),
  exists: async (path) => {
    try {
      await Deno.stat(path)
      return true
    } catch {
      return false
    }
  },
  stat: async (path) => ({ isDirectory: (await Deno.stat(path)).isDirectory }),
  runCommand: async (spec) => {
    records.push({
      command: spec.command,
      args: [...spec.args],
      cwd: spec.cwd,
      env: { ...spec.env },
    })
    const result = shim(spec)
    if (result === 'hang') {
      return await new Promise<ProcessResult>(() => {})
    }
    if (result === 'spawn-not-found') {
      throw new Deno.errors.NotFound('spawn failed')
    }
    if (result === 'spawn-permission') {
      throw new Deno.errors.PermissionDenied('spawn failed')
    }
    return result
  },
})

const withEnv = async <T>(key: string, value: string | undefined, fn: () => Promise<T>): Promise<T> => {
  const previous = Deno.env.get(key)
  if (value === undefined) {
    Deno.env.delete(key)
  } else {
    Deno.env.set(key, value)
  }
  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      Deno.env.delete(key)
    } else {
      Deno.env.set(key, previous)
    }
  }
}

// Bounds a real-subprocess test so a deadlock regression fails the test
// instead of hanging the suite.
const withHardTimeout = async <T>(ms: number, fn: () => Promise<T>): Promise<T> => {
  let timer: number | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`guard did not complete within ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

// A real executable the production deps will spawn: floods one or both pipes
// with output well beyond the 64 KiB per-stream cap, then exits 1.
const writeFloodBinary = async (binaryPath: string, floodStderr: boolean): Promise<void> => {
  const pad = 'x'.repeat(128 * 1024)
  const lines = [
    '#!/bin/sh',
    "printf 'huge.ts:1:1: flood\\n'",
    `printf '%s' '${pad}'`,
  ]
  if (floodStderr) {
    lines.push("printf 'huge.ts:1:1: flood\\n' >&2", `printf '%s' '${pad}' >&2`)
  }
  lines.push('exit 1')
  await Deno.writeTextFile(binaryPath, `${lines.join('\n')}\n`)
  await Deno.chmod(binaryPath, 0o755)
}

interface Outcome {
  readonly result: HookResult
  readonly records: SpawnRecord[]
}

const runGuard = async (
  stdin: string,
  root: string,
  options: { readonly cwd?: string; readonly shim?: Shim; readonly commandTimeoutMs?: number } = {},
): Promise<Outcome> => {
  const { cwd = root, shim = defaultShim, commandTimeoutMs } = options
  const records: SpawnRecord[] = []
  const deps = makeDeps(root, shim, records)
  const guardOptions = commandTimeoutMs === undefined ? {} : { commandTimeoutMs }
  const result = await withEnv('CLAUDE_PROJECT_DIR', root, () =>
    runLintGuard(stdin, cwd, deps, guardOptions)
  )
  return { result, records }
}

const single = (records: SpawnRecord[]): SpawnRecord => {
  assertEquals(records.length, 1)
  const record = records[0]
  assert(record !== undefined)
  return record
}

describe('runLintGuard', () => {
  let root: string

  beforeEach(async () => {
    root = await makeProject()
  })

  afterEach(async () => {
    await Deno.remove(root, { recursive: true })
  })

  it('allows a clean edit with the exact oxlint invocation', async () => {
    const outcome = await runGuard(payload('src/clean.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    const record = single(outcome.records)
    assertEquals(record.command, join(root, 'node_modules', '.bin', 'oxlint'))
    assertEquals(record.args, [
      '--type-aware',
      '--type-check',
      '-f',
      'unix',
      '-c',
      join(root, 'oxlint.config.mjs'),
      '--',
      join(root, 'src', 'clean.ts'),
    ])
    assertEquals(record.cwd, root)
  })

  it('blocks an edit that introduces a lint violation', async () => {
    const outcome = await runGuard(payload('src/bad.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assertEquals(outcome.result.stderr, VIOLATION_STDERR)
    assert(outcome.result.stderr.includes('do not suppress the rule'))
    assert(outcome.result.stderr.includes('do not weaken the oxlint config'))
  })

  it('skips an edit to a file that does not exist', async () => {
    const outcome = await runGuard(payload('src/nope.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records, [])
  })

  it('skips an edit to a non-lintable file', async () => {
    const outcome = await runGuard(payload('src/readme.md'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records, [])
  })

  it('ignores a payload from a non-edit tool', async () => {
    const outcome = await runGuard(
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'src/clean.ts' } }),
      root,
    )
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records, [])
  })

  it('ignores stdin that is not JSON', async () => {
    const outcome = await runGuard('not json', root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records, [])
  })

  it('ignores an edit payload with no file_path', async () => {
    const outcome = await runGuard(JSON.stringify({ tool_name: 'Edit', tool_input: {} }), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records, [])
  })

  it('allows a linter report that no files matched', async () => {
    const outcome = await runGuard(payload('src/ignored.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 1)
  })

  it('allows a linter report that the target lies outside the lint root', async () => {
    const outcome = await runGuard(payload('src/outside.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 1)
  })

  it('retries without type checking when the type-aware backend is missing', async () => {
    const outcome = await runGuard(payload('src/tsgolint.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 2)
    assert(outcome.records[0]?.args.includes('--type-aware'))
    assert(!outcome.records[1]?.args.includes('--type-aware'))
  })

  it('retries even when stderr carries unrelated backend noise', async () => {
    const outcome = await runGuard(payload('src/tsgolint-noise.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 2)
    assert(outcome.records[0]?.args.includes('--type-aware'))
    assert(!outcome.records[1]?.args.includes('--type-aware'))
  })

  it('blocks an edit that still fails after the retry', async () => {
    const outcome = await runGuard(payload('src/retry.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assertEquals(outcome.result.stderr, RETRY_VIOLATION_STDERR)
    assertEquals(outcome.records.length, 2)
  })

  it('blocks when the retry also reports the missing type-aware backend', async () => {
    const outcome = await runGuard(payload('src/tsgolint-exhausted.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assert(outcome.result.stderr.includes('the type-aware backend (oxlint-tsgolint) was unavailable'))
    assert(outcome.result.stderr.includes('Failed to find tsgolint executable'))
    assertEquals(outcome.records.length, 2)
  })

  it('checks and lints a Deno-scripted file from its own directory', async () => {
    const outcome = await runGuard(payload('src/deno.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 2)
    assertEquals(outcome.records.map((record) => [record.command, record.args[0]]), [
      ['deno', 'check'],
      ['deno', 'lint'],
    ])
    assertEquals(outcome.records[0]?.cwd, join(root, 'src'))
    assertEquals(outcome.records[1]?.cwd, join(root, 'src'))
    assertEquals(outcome.records[0]?.args.at(-2), '--')
    assertEquals(outcome.records[1]?.args.at(-2), '--')
  })

  it('refuses a Deno script whose check fails without running the lint pass', async () => {
    const outcome = await runGuard(payload('src/deno-check-fail.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assertEquals(outcome.result.stderr, `oxlint-guard: deno check failed for ${join(root, 'src', 'deno-check-fail.ts')}:\n${NO_DEBUGGER_OUTPUT}`)
    assertEquals(outcome.records.length, 1)
  })

  it('refuses a Deno script whose lint pass fails', async () => {
    const outcome = await runGuard(payload('src/deno-lint-fail.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assertEquals(outcome.result.stderr, `oxlint-guard: deno lint failed for ${join(root, 'src', 'deno-lint-fail.ts')}:\n${NO_DEBUGGER_OUTPUT}`)
    assertEquals(outcome.records.length, 2)
  })

  it('reports a missing deno interpreter without claiming lint violations', async () => {
    const outcome = await runGuard(payload('src/deno-missing.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assertEquals(outcome.result.stderr, DENO_MISSING_STDERR)
    assert(!outcome.result.stderr.includes('lint violations found'))
  })

  it('refuses a lintable file with no oxlint config, naming the accepted filenames', async () => {
    const project = await makeProject({ 'src/clean.ts': 'export const a = 1\n' })
    try {
      const outcome = await runGuard(payload('src/clean.ts'), project)
      assertEquals(outcome.result.exitCode, 2)
      assertEquals(outcome.result.stderr, NO_CONFIG_STDERR)
      assertEquals(outcome.records, [])
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('suggests the bun install command when bun.lock is present and no local linter exists', async () => {
    const project = await makeProject({
      'oxlint.config.mjs': 'export default {}\n',
      'src/clean.ts': 'export const a = 1\n',
      'bun.lock': 'v1\n',
    })
    try {
      const outcome = await runGuard(payload('src/clean.ts'), project)
      assertEquals(outcome.result.exitCode, 2)
      assertEquals(outcome.result.stderr, NO_BINARY_BUN_STDERR)
      assert(!outcome.result.stderr.includes('pnpm add -D oxlint'))
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('never lets an oxlint binary on PATH substitute for a missing local one', async () => {
    const project = await makeProject({
      'oxlint.config.mjs': 'export default {}\n',
      'src/clean.ts': 'export const a = 1\n',
    })
    try {
      const fakeBin = join(project, 'fakebin')
      await Deno.mkdir(fakeBin, { recursive: true })
      await Deno.writeTextFile(join(fakeBin, 'oxlint'), '#!/bin/sh\nexit 0\n')
      const outcome = await withEnv('PATH', fakeBin, () => runGuard(payload('src/clean.ts'), project))
      assertEquals(outcome.result.exitCode, 2)
      assert(outcome.result.stderr.includes('node_modules/.bin/oxlint'))
      assertEquals(outcome.records, [])
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('never selects an oxlint binary planted in an ancestor directory', async () => {
    const base = await Deno.makeTempDir({ prefix: 'oxlint-guard-ancestor-' })
    try {
      const project = join(base, 'project')
      await Deno.mkdir(join(project, 'src'), { recursive: true })
      await Deno.writeTextFile(join(project, 'oxlint.config.mjs'), 'export default {}\n')
      await Deno.writeTextFile(join(project, 'src', 'clean.ts'), 'export const a = 1\n')
      await Deno.mkdir(join(base, 'node_modules', '.bin'), { recursive: true })
      await Deno.writeTextFile(join(base, 'node_modules', '.bin', 'oxlint'), 'planted-oxlint\n')
      const outcome = await runGuard(payload('src/clean.ts'), project)
      assertEquals(outcome.result.exitCode, 2)
      assert(outcome.result.stderr.includes('no local oxlint binary'))
      assertEquals(outcome.records, [])
    } finally {
      await Deno.remove(base, { recursive: true })
    }
  })

  it('refuses a present but non-executable binary as a machine problem, not a lint violation', async () => {
    const outcome = await runGuard(payload('src/eacces.ts'), root)
    assertEquals(outcome.result.exitCode, 2)
    assert(outcome.result.stderr.includes(join(root, 'node_modules', '.bin', 'oxlint')))
    assert(outcome.result.stderr.includes('but is not executable'))
    assert(!outcome.result.stderr.includes('lint violations found'))
    assertEquals(outcome.records.length, 1)
  })

  it('refuses a directory where the binary should be, before any spawn', async () => {
    const project = await makeProject({
      'oxlint.config.mjs': 'export default {}\n',
      'src/clean.ts': 'export const a = 1\n',
    })
    try {
      await Deno.mkdir(join(project, 'node_modules', '.bin', 'oxlint'), { recursive: true })
      const binaryPath = join(project, 'node_modules', '.bin', 'oxlint')
      const outcome = await runGuard(payload('src/clean.ts'), project)
      assertEquals(outcome.result, {
        exitCode: 2,
        stderr:
          `oxlint-guard: oxlint binary found at ${binaryPath} but is not executable.\n` +
          'Remove it (or fix its permissions) and install oxlint locally.',
      })
      assertEquals(outcome.records, [])
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('truncates linter output beyond the byte budget with the marker', async () => {
    const project = await makeProject({
      'oxlint.config.mjs': 'export default {}\n',
      'src/huge-real.ts': 'export const huge = 1\n',
    })
    try {
      const binaryPath = join(project, 'node_modules', '.bin', 'oxlint')
      await Deno.mkdir(dirname(binaryPath), { recursive: true })
      await writeFloodBinary(binaryPath, false)
      const result = await withEnv('CLAUDE_PROJECT_DIR', project, () =>
        runLintGuard(payload('src/huge-real.ts'), project, productionDeps)
      )
      assertEquals(result.exitCode, 2)
      assert(result.stderr.endsWith(TRUNCATION_MARKER))
      assert(result.stderr.length < 70 * 1024)
      const prefix = `oxlint-guard: lint violations found.\n${FIX_ROOT_CAUSE}\n\n`
      assertEquals(result.stderr.length, prefix.length + 64 * 1024 + TRUNCATION_MARKER.length)
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('drains stdout and stderr concurrently so a flood on both streams cannot deadlock', async () => {
    const project = await makeProject({
      'oxlint.config.mjs': 'export default {}\n',
      'src/flood.ts': 'export const flood = 1\n',
    })
    try {
      const binaryPath = join(project, 'node_modules', '.bin', 'oxlint')
      await Deno.mkdir(dirname(binaryPath), { recursive: true })
      await writeFloodBinary(binaryPath, true)
      const result = await withHardTimeout(5000, () =>
        withEnv('CLAUDE_PROJECT_DIR', project, () =>
          runLintGuard(payload('src/flood.ts'), project, productionDeps)
        )
      )
      assertEquals(result.exitCode, 2)
      assert(result.stderr.endsWith(TRUNCATION_MARKER))
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('resolves a relative file path against cwd exactly once', async () => {
    const project = await makeProject({
      'node_modules/.bin/oxlint': 'fake-oxlint\n',
      'a/b/oxlint.config.mjs': 'export default {}\n',
      'a/b/src/relative.ts': 'export const a = 1\n',
    })
    try {
      const cwd = join(project, 'a')
      const outcome = await runGuard(payload('b/src/relative.ts'), project, { cwd })
      assertEquals(outcome.result.exitCode, 0)
      const record = single(outcome.records)
      const resolved = join(cwd, 'b', 'src', 'relative.ts')
      assertEquals(record.args.filter((arg) => arg === resolved).length, 1)
      assert(!record.args.includes(join(cwd, 'a', 'b', 'src', 'relative.ts')))
    } finally {
      await Deno.remove(project, { recursive: true })
    }
  })

  it('lints a dash-prefixed filename as a positional path after --', async () => {
    const outcome = await runGuard(payload('src/--fixme.ts'), root)
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    const record = single(outcome.records)
    assertEquals(record.args.at(-2), '--')
    assertEquals(record.args.at(-1), join(root, 'src', '--fixme.ts'))
  })

  it('retries without type checking when the type-aware pass times out', async () => {
    const outcome = await runGuard(payload('src/typeaware-timeout.ts'), root, { commandTimeoutMs: 50 })
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 2)
    assert(outcome.records[0]?.args.includes('--type-aware'))
    assert(!outcome.records[1]?.args.includes('--type-aware'))
  })

  it('does not report a timed-out retry as a lint violation', async () => {
    const outcome = await runGuard(payload('src/retry-timeout.ts'), root, { commandTimeoutMs: 50 })
    assertEquals(outcome.result, { exitCode: 0, stderr: '' })
    assertEquals(outcome.records.length, 2)
  })

  it('entry point exits 0 silently on a payload over the stdin cap', async () => {
    const entryPath = fromFileUrl(new URL('./lint-guard.ts', import.meta.url))
    const oversized = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/clean.ts', new_string: 'a'.repeat(1024 * 1024 + 64) },
    })
    const child = new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-read', '--allow-run', '--allow-env', entryPath],
      cwd: root,
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped',
    }).spawn()
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(oversized))
    await writer.close()
    const output = await child.output()
    assertEquals(output.code, 0)
    assertEquals(new TextDecoder().decode(output.stdout), '')
    assertEquals(new TextDecoder().decode(output.stderr), '')
  })

  it('hands the spawned linter only the allowlisted environment, never a planted credential', async () => {
    const sentinel = 'OXLINT_GUARD_TEST_SECRET'
    const previous: Record<string, string | undefined> = {}
    for (const key of [...ALLOWLIST, sentinel]) {
      previous[key] = Deno.env.get(key)
    }
    try {
      for (const key of ALLOWLIST) {
        Deno.env.set(key, `${key}-value`)
      }
      Deno.env.set(sentinel, 'do-not-leak')
      const outcome = await runGuard(payload('src/clean.ts'), root)
      assertEquals(outcome.result.exitCode, 0)
      const record = single(outcome.records)
      assertEquals(Object.keys(record.env).sort(), [...ALLOWLIST].sort())
      assertEquals(record.env[sentinel], undefined)
      assertEquals(record.env['CLAUDE_PROJECT_DIR'], undefined)
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          Deno.env.delete(key)
        } else {
          Deno.env.set(key, value)
        }
      }
    }
  })
})
