import type * as Command from '@effect/platform/Command'
import * as CommandExecutor from '@effect/platform/CommandExecutor'
import * as PlatformError from '@effect/platform/Error'
import * as Path from '@effect/platform/Path'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import type { Contents } from '@systemfsoftware/effect-memfs'
import * as Chunk from 'effect/Chunk'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Inspectable from 'effect/Inspectable'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Sink from 'effect/Sink'
import * as Stream from 'effect/Stream'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterAll, beforeAll, expect } from 'vitest'
import { layer as lintGuardAdapterLayer } from '../src/lint-guard/lint-guard.adapter.js'
import { runLintGuard, TRUNCATION_MARKER } from '../src/lint-guard/lint-guard.executor.js'
import type { HookResult, LintGuardOptions, ProcessResult } from '../src/lint-guard/lint-guard.executor.js'

const Feature = makeFeature({ it, layer })

const OXLINT_BIN = '/project/node_modules/.bin/oxlint'

interface SpawnRecord {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: Option.Option<string>
  readonly env: Record<string, string>
}

interface SpawnBox {
  readonly records: SpawnRecord[]
}

const SpawnRecords = Context.GenericTag<SpawnBox>('@oxlint-guard-test/SpawnRecords')

interface Environment {
  readonly tree: Contents
  readonly cwd: string
}

const clean: ProcessResult = { exitCode: 0, stdout: '', stderr: '' }

const violation: ProcessResult = {
  exitCode: 1,
  stdout: 'src/bad.ts:1:1: `debugger` statement is not allowed [Error/eslint(no-debugger)]\n\n1 problem\n',
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
  stdout: 'huge.ts:1:1: `debugger` statement is not allowed [Error/eslint(no-debugger)]\n' + 'x'.repeat(128 * 1024),
  stderr: '',
}

const basenameOf = (filePath: string): string => filePath.slice(filePath.lastIndexOf('/') + 1)

// Sentinels the shim can return besides a literal ProcessResult: 'hang' makes
// the spawned process never exit, 'spawn-failure' makes the executor's start
// fail with a typed permission error (as a real EACCES spawn does).
type ShimResult = ProcessResult | 'hang' | 'spawn-failure' | undefined

const shim = (standard: Command.StandardCommand): ShimResult => {
  if (standard.command === OXLINT_BIN) {
    const name = basenameOf(standard.args.at(-1) ?? '')
    if (name === 'tsgolint.ts') {
      return standard.args.includes('--type-aware') ? tsgolintMissing : clean
    }
    if (name === 'retry.ts') {
      return standard.args.includes('--type-aware') ? tsgolintMissing : violation
    }
    if (name === 'tsgolint-noise.ts') {
      return standard.args.includes('--type-aware') ? tsgolintNoise : clean
    }
    if (name === 'eacces.ts') {
      return 'spawn-failure'
    }
    if (name === 'huge.ts') {
      return hugeOutput
    }
    if (name === 'typeaware-timeout.ts') {
      return standard.args.includes('--type-aware') ? 'hang' : clean
    }
    if (name === 'retry-timeout.ts') {
      return standard.args.includes('--type-aware') ? tsgolintMissing : 'hang'
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
  if (standard.command === 'deno') {
    const name = basenameOf(standard.args.at(-1) ?? '')
    if (name === 'deno-check-fail.ts') {
      return standard.args[0] === 'check' ? violation : clean
    }
    if (name === 'deno-lint-fail.ts') {
      return standard.args[0] === 'check' ? clean : violation
    }
    if (name === 'deno-missing.ts') {
      return 'spawn-failure'
    }
    return clean
  }
  return undefined
}

const asStandardCommand = (command: Command.Command): Command.StandardCommand => {
  if (command._tag === 'StandardCommand') {
    return command
  }
  throw new Error('unexpected PipedCommand in the lint guard shell')
}

const fakeProcess = (result: ProcessResult): CommandExecutor.Process => ({
  [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
  [Inspectable.NodeInspectSymbol]: () => ({ _id: '@effect/platform/CommandExecutor/Process', pid: 1 }),
  toJSON: () => ({ _id: '@effect/platform/CommandExecutor/Process', pid: 1 }),
  pid: CommandExecutor.ProcessId(1),
  exitCode: Effect.succeed(CommandExecutor.ExitCode(result.exitCode)),
  isRunning: Effect.succeed(false),
  kill: () => Effect.void,
  stdin: Sink.forEach(() => Effect.void),
  stdout: Stream.fromChunk(Chunk.of(new TextEncoder().encode(result.stdout))),
  stderr: Stream.fromChunk(Chunk.of(new TextEncoder().encode(result.stderr))),
})

// Never resolves, so the guard's per-command timeout (not the process itself)
// decides the outcome — this is how a hung linter is simulated.
const hangingProcess = (): CommandExecutor.Process => ({
  ...fakeProcess(clean),
  exitCode: Effect.never,
})

const makeExecutor = (box: SpawnBox): CommandExecutor.CommandExecutor =>
  CommandExecutor.makeExecutor((command) =>
    Effect.suspend(() => {
      const standard = asStandardCommand(command)
      const result = shim(standard)
      if (result === undefined) {
        return Effect.dieMessage(`unexpected command: ${standard.command} ${standard.args.join(' ')}`)
      }
      box.records.push({
        command: standard.command,
        args: [...standard.args],
        cwd: standard.cwd,
        env: Object.fromEntries(standard.env),
      })
      if (result === 'hang') {
        return Effect.succeed(hangingProcess())
      }
      if (result === 'spawn-failure') {
        const reason = standard.command === 'deno' ? 'NotFound' : 'PermissionDenied'
        return Effect.fail(
          new PlatformError.SystemError({
            reason,
            module: 'Command',
            method: 'spawn',
            pathOrDescriptor: standard.command,
            syscall: 'spawn',
            description: `spawn ${standard.command} failed with ${reason}`,
          }),
        )
      }
      return Effect.succeed(fakeProcess(result))
    })
  )

const scenarioLayer: Layer.Layer<CommandExecutor.CommandExecutor | SpawnBox, never> = Layer.effectContext(
  Effect.sync(() => {
    const box: SpawnBox = { records: [] }
    return Context.add(Context.make(SpawnRecords, box), CommandExecutor.CommandExecutor, makeExecutor(box))
  }),
)

const execute = (
  payload: string,
  env: Environment,
  options: LintGuardOptions = { commandTimeout: Duration.seconds(30) },
): Effect.Effect<
  { readonly result: HookResult; readonly records: SpawnRecord[] },
  never,
  SpawnBox | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function*() {
    const box = yield* SpawnRecords
    const layers = Layer.merge(
      Layer.provide(
        lintGuardAdapterLayer,
        Layer.mergeAll(Path.layer, MemoryFileSystem.layerWith(env.tree)),
      ),
      Path.layer,
    )
    const result = yield* Effect.provide(runLintGuard(payload, env.cwd, options), layers)
    return { result, records: box.records }
  })

const payload = (filePath: string): string => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })

const fullTree: Contents = {
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

const relativeTree: Contents = {
  ...fullTree,
  // A .git marker (worktree style — a file, not a directory) makes the walk
  // stop at /project even though the scenario's cwd is the nested /project/a.
  '/project/.git': 'gitdir: /elsewhere/real-git-dir',
  '/project/a/b/src/relative.ts': 'export const relative = 1\n',
}

const noConfigTree: Contents = {
  '/project/node_modules/.bin/oxlint': 'fake-oxlint',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
}

const noBinaryTree = (lockfile: Contents): Contents => ({
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
  ...lockfile,
})

// A directory where node_modules/.bin/oxlint should be — it passes exists() but
// can never be spawned.
const directoryBinaryTree: Contents = {
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/node_modules/.bin/oxlint/': null,
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
}

// No local binary, but one planted in an ancestor directory outside the root.
const ancestorBinaryTree: Contents = {
  '/project/oxlint.config.mjs': 'export default {}',
  '/project/src/clean.ts': 'export const ok = 1\nexport default ok\n',
  '/tmp/node_modules/.bin/oxlint': 'planted-oxlint',
}

let fakeBinDir: string
let previousPath: string | undefined
let previousProjectDir: string | undefined
let previousSecret: string | undefined

beforeAll(() => {
  fakeBinDir = mkdtempSync(join(tmpdir(), 'oxlint-guard-path-'))
  writeFileSync(join(fakeBinDir, 'oxlint'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  previousPath = process.env['PATH']
  process.env['PATH'] = `${fakeBinDir}${delimiter}${previousPath ?? ''}`
  // Root discovery must fall back to git/cwd in these scenarios, never to a
  // CLAUDE_PROJECT_DIR the host session happens to export.
  previousProjectDir = process.env['CLAUDE_PROJECT_DIR']
  delete process.env['CLAUDE_PROJECT_DIR']
  // A planted credential that must never reach the spawned linter.
  previousSecret = process.env['OXLINT_GUARD_TEST_SECRET']
  process.env['OXLINT_GUARD_TEST_SECRET'] = 'do-not-leak'
})

afterAll(() => {
  if (previousPath === undefined) {
    delete process.env['PATH']
  } else {
    process.env['PATH'] = previousPath
  }
  if (previousProjectDir === undefined) {
    delete process.env['CLAUDE_PROJECT_DIR']
  } else {
    process.env['CLAUDE_PROJECT_DIR'] = previousProjectDir
  }
  if (previousSecret === undefined) {
    delete process.env['OXLINT_GUARD_TEST_SECRET']
  } else {
    process.env['OXLINT_GUARD_TEST_SECRET'] = previousSecret
  }
  rmSync(fakeBinDir, { recursive: true, force: true })
})

const BENIGN_REPORTS = [
  { report: 'that no files matched', file: 'src/ignored.ts' },
  { report: 'that the target lies outside the lint root', file: 'src/outside.ts' },
] as const

const IGNORED_PAYLOADS = [
  { situation: 'text that is not JSON', raw: 'not json' },
  {
    situation: 'a read of the file',
    raw: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'src/clean.ts' } }),
  },
] as const

const SKIP_TARGETS = [
  { situation: 'a file that does not exist', file: 'src/nope.ts' },
  { situation: 'a markdown file', file: 'src/readme.md' },
] as const

// liveClock: the guard's per-command timeouts must fire on real time; the
// default harness mode runs under the effect TestClock, which never advances.
Feature('Guarding edits against lint violations')
  .liveClock()
  .withScenarioLayer(scenarioLayer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'An edit that introduces a lint violation is refused',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload that introduces a debugger statement')(
          'payload',
          () => Effect.succeed(payload('src/bad.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with the linter findings against the project config')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('no-debugger')
          expect(s.outcome.records).toHaveLength(1)
          expect(s.outcome.records[0]?.command).toBe(OXLINT_BIN)
          expect(s.outcome.records[0]?.args).toEqual([
            '--type-aware',
            '--type-check',
            '-f',
            'unix',
            '-c',
            '/project/oxlint.config.mjs',
            '--',
            '/project/src/bad.ts',
          ])
          expect(s.outcome.records[0]?.cwd).toEqual(Option.some('/project'))
        }),
        And('the refusal directs fixing the root cause rather than suppressing the rule')((s) => {
          expect(s.outcome.result.stderr).toContain('do not suppress the rule')
          expect(s.outcome.result.stderr).toContain('do not weaken the oxlint config')
        }),
      ),
    )

    scenario(
      'A clean edit passes without a sound',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file that passes linting')(
          'payload',
          () => Effect.succeed(payload('src/clean.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is allowed and nothing is written to stderr')((s) => {
          expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
        }),
        And('the linter receives a minimal environment, never the agent credentials')((s) => {
          expect(s.outcome.records[0]?.env['PATH']).toBe(process.env['PATH'])
          expect(s.outcome.records[0]?.env['OXLINT_GUARD_TEST_SECRET']).toBeUndefined()
        }),
      ),
    )

    scenarioOutline(
      'The edit passes when the linter reports <report>',
      BENIGN_REPORTS,
      (row) =>
        Gherkin.Do.pipe(
          Given('a project whose linter gives that report')('env', () => Effect.succeed(PROJECT)),
          Given(`an edit payload touching ${row.file}`)('payload', () => Effect.succeed(payload(row.file))),
          When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
          Then('the edit is allowed with no output')((s) => {
            expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
          }),
        ),
    )

    scenario(
      'A missing type-checking backend is retried without type checking',
      Gherkin.Do.pipe(
        Given('a project whose linter cannot run its type-checking backend')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file that only trips the type-checking pass')(
          'payload',
          () => Effect.succeed(payload('src/tsgolint.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is allowed')((s) => {
          expect(s.outcome.result.exitCode).toBe(0)
        }),
        And('the linter is retried once without the type-checking flags')((s) => {
          expect(s.outcome.records).toHaveLength(2)
          expect(s.outcome.records[0]?.args).toContain('--type-aware')
          expect(s.outcome.records[1]?.args).not.toContain('--type-aware')
        }),
      ),
    )

    scenario(
      'An edit that still fails after the retry is refused',
      Gherkin.Do.pipe(
        Given('a project whose linter cannot run its type-checking backend')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file that fails linting even without type checking')(
          'payload',
          () => Effect.succeed(payload('src/retry.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
        }),
        And('the refusal notes that the type-checking backend was unavailable')((s) => {
          expect(s.outcome.result.stderr).toContain('type-aware backend')
        }),
      ),
    )

    scenarioOutline(
      'The guard ignores <situation>',
      IGNORED_PAYLOADS,
      (row) =>
        Gherkin.Do.pipe(
          Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
          Given(`the guard receives ${row.situation}`)('payload', () => Effect.succeed(row.raw)),
          When('the guard processes it')('outcome', (s) => execute(s.payload, s.env)),
          Then('nothing is refused and no linter runs')((s) => {
            expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
            expect(s.outcome.records).toHaveLength(0)
          }),
        ),
    )

    scenarioOutline(
      'An edit to <situation> passes without linting',
      SKIP_TARGETS,
      (row) =>
        Gherkin.Do.pipe(
          Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
          Given(`an edit payload touching ${row.file}`)('payload', () => Effect.succeed(payload(row.file))),
          When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
          Then('the edit is allowed with no output and no linter run')((s) => {
            expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
            expect(s.outcome.records).toHaveLength(0)
          }),
        ),
    )

    scenario(
      'A Deno-scripted file is checked and linted with Deno',
      Gherkin.Do.pipe(
        Given('a project with an edited file that is a Deno script')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching that Deno script')('payload', () => Effect.succeed(payload('src/deno.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is allowed')((s) => {
          expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
        }),
        And('Deno first checks and then lints the file from its own directory')((s) => {
          expect(s.outcome.records.map((r) => [r.command, r.args[0]])).toEqual([
            ['deno', 'check'],
            ['deno', 'lint'],
          ])
          expect(s.outcome.records[0]?.cwd).toEqual(Option.some('/project/src'))
          expect(s.outcome.records[1]?.cwd).toEqual(Option.some('/project/src'))
          expect(s.outcome.records[0]?.args.at(-2)).toBe('--')
          expect(s.outcome.records[1]?.args.at(-2)).toBe('--')
        }),
      ),
    )

    scenario(
      'A Deno script that fails its type check is refused and never linted',
      Gherkin.Do.pipe(
        Given('a project with an edited Deno script that fails its type check')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching that script')(
          'payload',
          () => Effect.succeed(payload('src/deno-check-fail.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with the check output')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('deno check failed')
        }),
        And('the lint pass never runs')((s) => {
          expect(s.outcome.records).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'A Deno script that fails linting is refused with its output',
      Gherkin.Do.pipe(
        Given('a project with an edited Deno script that fails linting')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching that script')(
          'payload',
          () => Effect.succeed(payload('src/deno-lint-fail.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with the lint output')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('deno lint failed')
        }),
      ),
    )

    scenario(
      'A relative edit path is resolved against the project exactly once',
      Gherkin.Do.pipe(
        Given('a project under a working directory with a nested target')(
          'env',
          () => Effect.succeed({ tree: relativeTree, cwd: '/project/a' }),
        ),
        Given('an edit payload naming the target relative to the working directory')(
          'payload',
          () => Effect.succeed(payload('b/src/relative.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the linter runs on the resolved absolute path exactly once')((s) => {
          expect(s.outcome.result.exitCode).toBe(0)
          expect(s.outcome.records).toHaveLength(1)
          const resolvedArgs = s.outcome.records[0]?.args.filter((arg) => arg === '/project/a/b/src/relative.ts') ?? []
          expect(resolvedArgs).toHaveLength(1)
          expect(s.outcome.records[0]?.args).not.toContain('/project/a/project/a/b/src/relative.ts')
        }),
      ),
    )

    scenario(
      'An edit with no oxlint config is refused with the accepted filenames',
      Gherkin.Do.pipe(
        Given('a project with a local linter but no oxlint config')(
          'env',
          () => Effect.succeed({ tree: noConfigTree, cwd: '/project' }),
        ),
        Given('an edit payload touching a lintable file')('payload', () => Effect.succeed(payload('src/clean.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused and no linter runs')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.records).toHaveLength(0)
        }),
        And('the refusal names the accepted config filenames and a plain install hint')((s) => {
          expect(s.outcome.result.stderr).toContain('oxlint.config.ts')
          expect(s.outcome.result.stderr).toContain('.oxlintrc.json')
          expect(s.outcome.result.stderr).toContain('install oxlint as a dev dependency of this project')
        }),
      ),
    )

    scenario(
      'A Bun project without a local linter is told to install it with Bun',
      Gherkin.Do.pipe(
        Given('a Bun project with oxlint configured but no local linter')(
          'env',
          () => Effect.succeed({ tree: noBinaryTree({ '/project/bun.lock': 'lockfile v1' }), cwd: '/project' }),
        ),
        Given('an edit payload touching a lintable file')('payload', () => Effect.succeed(payload('src/clean.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
        }),
        And('the refusal suggests the Bun install command rather than pnpm command')((s) => {
          expect(s.outcome.result.stderr).toContain('bun add -d oxlint')
          expect(s.outcome.result.stderr).not.toContain('pnpm add -D oxlint')
        }),
      ),
    )

    scenario(
      'A linter on PATH never substitutes for a missing local one',
      Gherkin.Do.pipe(
        Given('a project with no local linter but an oxlint binary on PATH')(
          'env',
          () => Effect.succeed({ tree: noBinaryTree({}), cwd: '/project' }),
        ),
        Given('an edit payload touching a lintable file')('payload', () => Effect.succeed(payload('src/clean.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused for the missing local linter')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('node_modules/.bin/oxlint')
        }),
        And('the PATH binary is never invoked')((s) => {
          expect(s.outcome.records).toHaveLength(0)
        }),
      ),
    )

    scenario(
      'A Deno script whose interpreter is missing is refused with a plain message',
      Gherkin.Do.pipe(
        Given('a project with an edited Deno script but no deno binary')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching that script')('payload', () => Effect.succeed(payload('src/deno-missing.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with the missing-binary message')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('deno not found on PATH')
        }),
        And('the failure is never reported as lint violations')((s) => {
          expect(s.outcome.result.stderr).not.toContain('lint violations found')
        }),
      ),
    )

    scenario(
      'A file whose name starts with a dash is linted as a positional path',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a dash-prefixed file')(
          'payload',
          () => Effect.succeed(payload('src/--fixme.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is allowed')((s) => {
          expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
        }),
        And('the linter receives the file after a -- separator')((s) => {
          expect(s.outcome.records).toHaveLength(1)
          const args = s.outcome.records[0]?.args ?? []
          expect(args.at(-2)).toBe('--')
          expect(args.at(-1)).toBe('/project/src/--fixme.ts')
        }),
      ),
    )

    scenario(
      'A present but non-executable oxlint binary is a hard failure, not a lint violation',
      Gherkin.Do.pipe(
        Given('a project whose local oxlint binary cannot be executed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file whose linter run hits the broken binary')(
          'payload',
          () => Effect.succeed(payload('src/eacces.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with the distinct executability message')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('/project/node_modules/.bin/oxlint')
          expect(s.outcome.result.stderr).toContain('but is not executable')
        }),
        And('the failure is never reported as lint violations')((s) => {
          expect(s.outcome.result.stderr).not.toContain('lint violations found')
        }),
      ),
    )

    scenario(
      'A directory where the oxlint binary should be is refused before any spawn',
      Gherkin.Do.pipe(
        Given('a project whose local oxlint path is a directory')(
          'env',
          () => Effect.succeed({ tree: directoryBinaryTree, cwd: '/project' }),
        ),
        Given('an edit payload touching a lintable file')('payload', () => Effect.succeed(payload('src/clean.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with the distinct executability message')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('/project/node_modules/.bin/oxlint')
          expect(s.outcome.result.stderr).toContain('but is not executable')
        }),
        And('no linter is spawned')((s) => {
          expect(s.outcome.records).toHaveLength(0)
        }),
      ),
    )

    scenario(
      'Linter output beyond the byte budget is truncated with a marker',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file whose linter output is enormous')(
          'payload',
          () => Effect.succeed(payload('src/huge.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused with bounded output')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain(TRUNCATION_MARKER)
          expect(s.outcome.result.stderr.length).toBeLessThan(70 * 1024)
        }),
      ),
    )

    scenario(
      'A missing type-checking backend is retried even when stderr carries unrelated noise',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file whose backend notice lands on stdout amid stderr noise')(
          'payload',
          () => Effect.succeed(payload('src/tsgolint-noise.ts')),
        ),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is allowed')((s) => {
          expect(s.outcome.result.exitCode).toBe(0)
        }),
        And('the linter is retried once without the type-checking flags')((s) => {
          expect(s.outcome.records).toHaveLength(2)
          expect(s.outcome.records[0]?.args).toContain('--type-aware')
          expect(s.outcome.records[1]?.args).not.toContain('--type-aware')
        }),
      ),
    )

    scenario(
      'A type-aware pass that times out is retried without type checking',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file whose type-aware pass hangs')(
          'payload',
          () => Effect.succeed(payload('src/typeaware-timeout.ts')),
        ),
        When('the guard processes the edit within a short command budget')(
          'outcome',
          (s) => execute(s.payload, s.env, { commandTimeout: Duration.millis(50) }),
        ),
        Then('the edit is allowed via the retry')((s) => {
          expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
        }),
        And('the linter is retried without the type-checking flags')((s) => {
          expect(s.outcome.records).toHaveLength(2)
          expect(s.outcome.records[0]?.args).toContain('--type-aware')
          expect(s.outcome.records[1]?.args).not.toContain('--type-aware')
        }),
      ),
    )

    scenario(
      'A timeout on the retry is not reported as a lint violation',
      Gherkin.Do.pipe(
        Given('a project with oxlint configured and a local linter installed')('env', () => Effect.succeed(PROJECT)),
        Given('an edit payload touching a file whose retry pass hangs')(
          'payload',
          () => Effect.succeed(payload('src/retry-timeout.ts')),
        ),
        When('the guard processes the edit within a short command budget')(
          'outcome',
          (s) => execute(s.payload, s.env, { commandTimeout: Duration.millis(50) }),
        ),
        Then('the edit is allowed despite the hung retry')((s) => {
          expect(s.outcome.result).toEqual({ exitCode: 0, stderr: '' })
        }),
        And('the linter is attempted exactly twice')((s) => {
          expect(s.outcome.records).toHaveLength(2)
        }),
      ),
    )

    scenario(
      'An oxlint binary planted outside the project root is never selected',
      Gherkin.Do.pipe(
        Given('a project with no local oxlint but one planted in an ancestor directory')(
          'env',
          () => Effect.succeed({ tree: ancestorBinaryTree, cwd: '/project' }),
        ),
        Given('an edit payload touching a lintable file')('payload', () => Effect.succeed(payload('src/clean.ts'))),
        When('the guard processes the edit')('outcome', (s) => execute(s.payload, s.env)),
        Then('the edit is refused for the missing local linter')((s) => {
          expect(s.outcome.result.exitCode).toBe(2)
          expect(s.outcome.result.stderr).toContain('node_modules/.bin/oxlint')
        }),
        And('the ancestor binary is never invoked')((s) => {
          expect(s.outcome.records).toHaveLength(0)
        }),
      ),
    )
  })
