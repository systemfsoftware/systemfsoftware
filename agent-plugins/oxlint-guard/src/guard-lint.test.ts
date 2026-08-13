// Behaviour tests for the PostToolUse lint guard, ported from the original
// plugin's integration tests (formerly claude-plugins/oxlint-guard) with the
// same scenarios and assertions. A scripted runner replaces the fake
// CommandExecutor; an in-memory tree replaces effect-memfs.

import { assertEquals, assertStringIncludes } from '@std/assert'
import { runLintGuard, TRUNCATION_MARKER } from './guard-lint.ts'
import type { HookResult, LintFs, LintGuardOptions, ProcessResult, Runner } from './guard-lint.ts'

const OXLINT_BIN = '/project/node_modules/.bin/oxlint'

interface SpawnRecord {
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
}

interface Environment {
  readonly tree: Record<string, string | null>
  readonly cwd: string
}

type ShimResult = ProcessResult | 'hang' | 'spawn-failure' | undefined

const clean: ProcessResult = { exitCode: 0, stdout: '', stderr: '' }

const violation: ProcessResult = {
  exitCode: 1,
  stdout:
    'src/bad.ts:1:1: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement\n',
  stderr: '',
}

const noFiles: ProcessResult = {
  exitCode: 1,
  stdout: 'No files found to lint. Please check your paths and ignore patterns.\n',
  stderr: '',
}

const outsideRoot: ProcessResult = {
  exitCode: 1,
  stdout: 'path is expected to be under the root\n',
  stderr: '',
}

const tsgolintMissing: ProcessResult = {
  exitCode: 1,
  stdout: 'Failed to find tsgolint executable. You may need to add the `oxlint-tsgolint` package to your project?\n',
  stderr: '',
}

const tsgolintNoise: ProcessResult = {
  exitCode: 1,
  stdout: 'Failed to find tsgolint executable. You may need to add the `oxlint-tsgolint` package to your project?\n',
  stderr: 'warning: unrelated runtime noise from the backend\n',
}

const hugeOutput: ProcessResult = {
  exitCode: 1,
  stdout:
    'huge.ts:1:1: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement\n' +
    'x'.repeat(128 * 1024),
  stderr: '',
}

const basenameOf = (filePath: string): string => filePath.slice(filePath.lastIndexOf('/') + 1)

const shim = (program: string, args: readonly string[]): ShimResult => {
  if (program === OXLINT_BIN) {
    const name = basenameOf(args.at(-1) ?? '')
    if (name === 'tsgolint.ts') {
      return args.includes('--type-aware') ? tsgolintMissing : clean
    }
    if (name === 'retry.ts') {
      return args.includes('--type-aware') ? tsgolintMissing : violation
    }
    if (name === 'tsgolint-noise.ts') {
      return args.includes('--type-aware') ? tsgolintNoise : clean
    }
    if (name === 'eacces.ts') {
      return 'spawn-failure'
    }
    if (name === 'huge.ts') {
      return hugeOutput
    }
    if (name === 'typeaware-timeout.ts') {
      return args.includes('--type-aware') ? 'hang' : clean
    }
    if (name === 'retry-timeout.ts') {
      return args.includes('--type-aware') ? tsgolintMissing : 'hang'
    }
    switch (name) {
      case 'clean.ts':
      case 'relative.ts':
      case '--fixme.ts':
        return clean
      case 'bad.ts':
        return violation
      case 'ignored.ts':
        return noFiles
      case 'outside.ts':
        return outsideRoot
      default:
        return undefined
    }
  }
  if (program === 'deno') {
    const name = basenameOf(args.at(-1) ?? '')
    if (name === 'deno-check-fail.ts') {
      return args[0] === 'check' ? violation : clean
    }
    if (name === 'deno-lint-fail.ts') {
      return args[0] === 'check' ? clean : violation
    }
    if (name === 'deno-missing.ts') {
      return 'spawn-failure'
    }
    return clean
  }
  return undefined
}

const memFs = (tree: Record<string, string | null>): LintFs => {
  // Directory markers carry a trailing slash (e.g. '/project/dir/': null);
  // lookups check both forms so the guard's slashless candidates match.
  const keyOf = (target: string): string => target.replace(/\/+$/, '')
  const directoryOf = (target: string): string => `${keyOf(target)}/`
  return {
    exists: (target) => Promise.resolve(keyOf(target) in tree || directoryOf(target) in tree),
    isDirectory: (target) => Promise.resolve(tree[directoryOf(target)] === null || tree[keyOf(target)] === null),
    readFirstLine: (target) => {
      const content = tree[directoryOf(target)] ?? tree[keyOf(target)]
      if (content === null || content === undefined) {
        return Promise.reject(new Error(`no such file: ${target}`))
      }
      return Promise.resolve(content.split('\n', 1)[0] === '' ? null : content.split('\n', 1)[0] ?? null)
    },
  }
}

// A complete environment record, so tests never touch the real process env
// (no --allow-env needed) and the planted secret provably never leaks.
const testEnv = (overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  PATH: '/usr/bin:/bin',
  HOME: '/home/test',
  TMPDIR: '/tmp',
  TEMP: '/tmp',
  TMP: '/tmp',
  USERPROFILE: undefined,
  HOMEDRIVE: undefined,
  HOMEPATH: undefined,
  SystemRoot: undefined,
  COMSPEC: undefined,
  PATHEXT: undefined,
  CLAUDE_PROJECT_DIR: undefined,
  OXLINT_GUARD_TEST_SECRET: 'do-not-leak',
  ...overrides,
})

const makeRunner = (): { runner: Runner; records: SpawnRecord[] } => {
  const records: SpawnRecord[] = []
  const runner: Runner = {
    async run(program, args, cwd, env, timeoutMs) {
      const result = shim(program, args)
      records.push({ program, args: [...args], cwd, env })
      if (result === undefined) {
        throw new Error(`unexpected command: ${program} ${args.join(' ')}`)
      }
      if (result === 'hang') {
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + 10))
        return { tag: 'timeout' }
      }
      if (result === 'spawn-failure') {
        const reason = program === 'deno' ? 'NotFound' : 'PermissionDenied'
        return {
          tag: 'spawn-failure',
          failure: {
            reason: reason === 'NotFound' ? 'not-found' : 'not-executable',
            message: `spawn ${program} failed with ${reason}`,
          },
        }
      }
      return { tag: 'result', result }
    },
  }
  return { runner, records }
}

const execute = (
  raw: string,
  env: Environment,
  commandTimeoutMs = 30_000,
): Promise<{ result: HookResult; records: SpawnRecord[] }> => {
  const { runner, records } = makeRunner()
  const options: LintGuardOptions = {
    commandTimeoutMs,
    fs: memFs(env.tree),
    runner,
    env: testEnv(),
  }
  return runLintGuard(raw, env.cwd, options).then((result) => ({ result, records }))
}

const payload = (filePath: string): string => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })

const fullTree: Record<string, string | null> = {
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/node_modules/.bin/oxlint': 'fake-oxlint',
  '/project/bun.lock': 'lockfile v1',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
  '/project/src/bad.ts': 'export const unused = 42\n',
  '/project/src/ignored.ts': 'export const ignored = 1\n',
  '/project/src/outside.ts': 'export const outside = 1\n',
  '/project/src/tsgolint.ts': 'export const tsgolint = 1\n',
  '/project/src/retry.ts': 'export const retry = 1\n',
  '/project/src/readme.md': '# readme\n',
  '/project/src/--fixme.ts': 'export const dash = 1\nexport default dash\n',
  '/project/src/eacces.ts': 'export const eacces = 1\nexport default eacces\n',
  '/project/src/huge.ts': 'export const huge = 1\nexport default huge\n',
  '/project/src/tsgolint-noise.ts': 'export const noise = 1\nexport default noise\n',
  '/project/src/typeaware-timeout.ts': 'export const t = 1\nexport default t\n',
  '/project/src/retry-timeout.ts': 'export const r = 1\nexport default r\n',
  '/project/src/deno.ts': '#!/usr/bin/env -S deno run\nexport const deno = 1\n',
  '/project/src/deno-check-fail.ts': '#!/usr/bin/env deno run\nexport const bad = 1\n',
  '/project/src/deno-lint-fail.ts': '#!/usr/bin/env deno run\nexport const bad = 1\n',
  '/project/src/deno-missing.ts': '#!/usr/bin/env deno run\nexport const missing = 1\n',
}

const PROJECT: Environment = { tree: fullTree, cwd: '/project' }

const relativeTree: Record<string, string | null> = {
  ...fullTree,
  // A .git marker (worktree style — a file, not a directory) makes the walk
  // stop at /project even though the scenario's cwd is the nested /project/a.
  '/project/.git': 'gitdir: /elsewhere/real-git-dir',
  '/project/a/b/src/relative.ts': 'export const relative = 1\n',
}

const noConfigTree: Record<string, string | null> = {
  '/project/node_modules/.bin/oxlint': 'fake-oxlint',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
}

const noBinaryTree = (lockfile: Record<string, string | null>): Record<string, string | null> => ({
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
  ...lockfile,
})

// A directory where node_modules/.bin/oxlint should be — it passes exists() but
// can never be spawned.
const directoryBinaryTree: Record<string, string | null> = {
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/node_modules/.bin/oxlint/': null,
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
}

// No local binary, but one planted in an ancestor directory outside the root.
const ancestorBinaryTree: Record<string, string | null> = {
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
  '/tmp/node_modules/.bin/oxlint': 'planted-oxlint',
}

Deno.test('an edit that introduces a lint violation is refused', async () => {
  const { result, records } = await execute(payload('src/bad.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'no-debugger')
  assertEquals(records.length, 1)
  assertEquals(records[0]!.program, OXLINT_BIN)
  assertEquals(records[0]!.args, [
    '--type-aware',
    '--type-check',
    '-f',
    'agent',
    '-c',
    '/project/oxlint.config.mjs',
    '--',
    '/project/src/bad.ts',
  ])
  assertEquals(records[0]!.cwd, '/project')
  assertStringIncludes(result.stderr, 'do not suppress the rule')
  assertStringIncludes(result.stderr, 'do not weaken the oxlint config')
})

Deno.test('a clean edit passes without a sound', async () => {
  const { result, records } = await execute(payload('src/clean.ts'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records[0]!.env['PATH'], '/usr/bin:/bin')
  assertEquals(records[0]!.env['OXLINT_GUARD_TEST_SECRET'], undefined)
})

Deno.test('the edit passes when the linter reports that no files matched', async () => {
  const { result } = await execute(payload('src/ignored.ts'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
})

Deno.test('the edit passes when the linter reports the target lies outside the lint root', async () => {
  const { result } = await execute(payload('src/outside.ts'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
})

Deno.test('a missing type-checking backend is retried without type checking', async () => {
  const { result, records } = await execute(payload('src/tsgolint.ts'), PROJECT)
  assertEquals(result.exitCode, 0)
  assertEquals(records.length, 2)
  assertEquals(records[0]!.args.includes('--type-aware'), true)
  assertEquals(records[1]!.args.includes('--type-aware'), false)
})

Deno.test('an edit that still fails after the retry is refused', async () => {
  const { result, records } = await execute(payload('src/retry.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'type-aware backend')
  assertEquals(records.length, 2)
})

Deno.test('text that is not JSON is ignored', async () => {
  const { result, records } = await execute('not json', PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('a read of the file is ignored', async () => {
  const raw = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'src/clean.ts' } })
  const { result, records } = await execute(raw, PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('an edit to a file that does not exist passes without linting', async () => {
  const { result, records } = await execute(payload('src/nope.ts'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('an edit to a markdown file passes without linting', async () => {
  const { result, records } = await execute(payload('src/readme.md'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('a Deno-scripted file is checked and linted with Deno', async () => {
  const { result, records } = await execute(payload('src/deno.ts'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.map((r) => [r.program, r.args[0]]), [
    ['deno', 'check'],
    ['deno', 'lint'],
  ])
  assertEquals(records[0]!.cwd, '/project/src')
  assertEquals(records[1]!.cwd, '/project/src')
  assertEquals(records[0]!.args.at(-2), '--')
  assertEquals(records[1]!.args.at(-2), '--')
})

Deno.test('a Deno script that fails its type check is refused and never linted', async () => {
  const { result, records } = await execute(payload('src/deno-check-fail.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'deno check failed')
  assertEquals(records.length, 1)
})

Deno.test('a Deno script that fails linting is refused with its output', async () => {
  const { result, records } = await execute(payload('src/deno-lint-fail.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'deno lint failed')
  assertEquals(records.length, 2)
})

Deno.test('a relative edit path is resolved against the project exactly once', async () => {
  const { result, records } = await execute(payload('b/src/relative.ts'), { tree: relativeTree, cwd: '/project/a' })
  assertEquals(result.exitCode, 0)
  assertEquals(records.length, 1)
  const resolvedArgs = records[0]!.args.filter((arg) => arg === '/project/a/b/src/relative.ts')
  assertEquals(resolvedArgs.length, 1)
  assertEquals(records[0]!.args.includes('/project/a/project/a/b/src/relative.ts'), false)
})

Deno.test('an edit with no oxlint config is refused with the accepted filenames', async () => {
  const { result, records } = await execute(payload('src/clean.ts'), { tree: noConfigTree, cwd: '/project' })
  assertEquals(result.exitCode, 2)
  assertEquals(records.length, 0)
  assertStringIncludes(result.stderr, 'oxlint.config.ts')
  assertStringIncludes(result.stderr, '.oxlintrc.json')
  assertStringIncludes(result.stderr, 'install oxlint as a dev dependency of this project')
})

Deno.test('a Bun project without a local linter is told to install it with Bun', async () => {
  const { result, records } = await execute(
    payload('src/clean.ts'),
    { tree: noBinaryTree({ '/project/bun.lock': 'lockfile v1' }), cwd: '/project' },
  )
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'bun add -d oxlint')
  assertEquals(result.stderr.includes('pnpm add -D oxlint'), false)
  assertEquals(records.length, 0)
})

Deno.test('a linter on PATH never substitutes for a missing local one', async () => {
  const { result, records } = await execute(payload('src/clean.ts'), { tree: noBinaryTree({}), cwd: '/project' })
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'node_modules/.bin/oxlint')
  assertEquals(records.length, 0)
})

Deno.test('a Deno script whose interpreter is missing is refused with a plain message', async () => {
  const { result, records } = await execute(payload('src/deno-missing.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'deno not found on PATH')
  assertEquals(result.stderr.includes('lint violations found'), false)
  assertEquals(records.length, 1)
})

Deno.test('a file whose name starts with a dash is linted as a positional path', async () => {
  const { result, records } = await execute(payload('src/--fixme.ts'), PROJECT)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 1)
  assertEquals(records[0]!.args.at(-2), '--')
  assertEquals(records[0]!.args.at(-1), '/project/src/--fixme.ts')
})

Deno.test('a present but non-executable oxlint binary is a hard failure, not a lint violation', async () => {
  const { result, records } = await execute(payload('src/eacces.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, '/project/node_modules/.bin/oxlint')
  assertStringIncludes(result.stderr, 'but is not executable')
  assertEquals(result.stderr.includes('lint violations found'), false)
  assertEquals(records.length, 1)
})

Deno.test('a directory where the oxlint binary should be is refused before any spawn', async () => {
  const { result, records } = await execute(payload('src/clean.ts'), { tree: directoryBinaryTree, cwd: '/project' })
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, '/project/node_modules/.bin/oxlint')
  assertStringIncludes(result.stderr, 'but is not executable')
  assertEquals(records.length, 0)
})

Deno.test('linter output beyond the byte budget is truncated with a marker', async () => {
  const { result, records } = await execute(payload('src/huge.ts'), PROJECT)
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, TRUNCATION_MARKER)
  assertEquals(result.stderr.length < 70 * 1024, true)
  assertEquals(records.length, 1)
})

Deno.test('a missing type-checking backend is retried even when stderr carries unrelated noise', async () => {
  const { result, records } = await execute(payload('src/tsgolint-noise.ts'), PROJECT)
  assertEquals(result.exitCode, 0)
  assertEquals(records.length, 2)
  assertEquals(records[0]!.args.includes('--type-aware'), true)
  assertEquals(records[1]!.args.includes('--type-aware'), false)
})

Deno.test('a type-aware pass that times out is retried without type checking', async () => {
  const { result, records } = await execute(payload('src/typeaware-timeout.ts'), PROJECT, 50)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 2)
  assertEquals(records[0]!.args.includes('--type-aware'), true)
  assertEquals(records[1]!.args.includes('--type-aware'), false)
})

Deno.test('a timeout on the retry is not reported as a lint violation', async () => {
  const { result, records } = await execute(payload('src/retry-timeout.ts'), PROJECT, 50)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 2)
})

Deno.test('an oxlint binary planted outside the project root is never selected', async () => {
  const { result, records } = await execute(payload('src/clean.ts'), { tree: ancestorBinaryTree, cwd: '/project' })
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'node_modules/.bin/oxlint')
  assertEquals(records.length, 0)
})
