import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import * as path from 'node:path'
import { decodePayload, isRecord, readStdin, runLintGuard } from './lint-guard.ts'
import type { GuardOptions, HookResult, ProcessResult, Runner } from './lint-guard.ts'

const PROJECT = '/project'
const FOREIGN_CWD = '/tmp/agent-session'

interface SpawnRecord {
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
  readonly timeoutMs: number
}

type ShimResult = ProcessResult | 'timeout' | 'spawn-pnpm' | 'spawn-deno' | undefined

const clean: ProcessResult = { exitCode: 0, stdout: '', stderr: '' }

const violationLines = (count: number, name: string): string =>
  Array.from(
    { length: count },
    (_, i) => `${name}:${i + 1}:1: error eslint(no-debugger): debugger statement is not allowed`,
  ).join('\n')

const violation40: ProcessResult = { exitCode: 1, stdout: violationLines(40, 'bad40.ts'), stderr: '' }

const denoCheckViolation: ProcessResult = {
  exitCode: 1,
  stdout: 'TS2345: Argument of type number is not assignable to parameter of type string\n',
  stderr: '',
}

const denoLintViolation: ProcessResult = {
  exitCode: 1,
  stdout: 'deno-lint: no-debugger: `debugger` statement is not allowed\n',
  stderr: '',
}

const noFiles: ProcessResult = {
  exitCode: 1,
  stdout: 'No files found to lint. Please check your paths and ignore patterns.\n',
  stderr: '',
}

const ignoredPathPanic: ProcessResult = {
  exitCode: 1,
  stdout: 'thread main panicked at: path is expected to be under the root\n',
  stderr: '',
}

const tsgolintFailure: ProcessResult = {
  exitCode: 1,
  stdout: 'Error: Failed to initialize oxlint-tsgolint: executable file not found\n',
  stderr: '',
}

const stillViolating: ProcessResult = { exitCode: 1, stdout: violationLines(2, 'stillbad.ts'), stderr: '' }

const oxlintNotFound: ProcessResult = {
  exitCode: 1,
  stdout: 'ERR_PNPM_NO_BIN  Command "oxlint" not found\n',
  stderr: '',
}

const shim = (program: string, args: readonly string[]): ShimResult => {
  const name = path.basename(args.at(-1) ?? '')
  if (program === 'pnpm') {
    switch (name) {
      case 'clean.ts':
      case 'sh.ts':
      case 'app.vue':
      case 'deep.ts':
      case 'primary.ts':
        return clean
      case 'bad40.ts':
        return violation40
      case 'nofiles.ts':
        return noFiles
      case 'panic.ts':
        return ignoredPathPanic
      case 'slow.ts':
        return 'timeout'
      case 'spawnfail.ts':
        return 'spawn-pnpm'
      case 'tsgolint.ts':
      case 'tsgolint-still.ts': {
        if (args.includes('--type-aware')) return tsgolintFailure
        return name === 'tsgolint.ts' ? clean : stillViolating
      }
      case 'nooxlint.ts':
        return oxlintNotFound
      default:
        return undefined
    }
  }
  if (program === 'deno') {
    const phase = args[0]
    if (name === 'deno-clean.ts') {
      return clean
    }
    if (name === 'check-fail.ts') {
      return phase === 'check' ? denoCheckViolation : clean
    }
    if (name === 'lint-fail.ts') {
      return phase === 'check' ? clean : denoLintViolation
    }
    if (name === 'deno-slow.ts') {
      return 'timeout'
    }
    if (name === 'deno-spawnfail.ts') {
      return 'spawn-deno'
    }
    return undefined
  }
  return undefined
}

interface GuardFsLike {
  readonly exists: (target: string) => Promise<boolean>
  readonly readFirstLine: (target: string) => Promise<string | null>
}

const memFs = (tree: Record<string, string>): GuardFsLike => ({
  exists: (target) => Promise.resolve(target in tree),
  readFirstLine: (target) => {
    const content = tree[target]
    if (content === undefined) {
      return Promise.reject(new Error(`no such file: ${target}`))
    }
    return Promise.resolve(content.split('\n', 1)[0] === '' ? null : content.split('\n', 1)[0])
  },
})

const makeRunner = (): { runner: Runner; records: SpawnRecord[] } => {
  const records: SpawnRecord[] = []
  const runner: Runner = {
    async run(program, args, cwd, env, timeoutMs) {
      const result = await Promise.resolve(shim(program, args))
      records.push({ program, args: [...args], cwd, env, timeoutMs })
      if (result === undefined) {
        throw new Error(`unexpected command: ${program} ${args.join(' ')}`)
      }
      if (result === 'timeout') {
        return { tag: 'timeout' }
      }
      if (result === 'spawn-pnpm' || result === 'spawn-deno') {
        return {
          tag: 'spawn-failure',
          failure: { reason: 'not-found', message: `spawn ${program} failed: NotFound` },
        }
      }
      return { tag: 'result', result }
    },
  }
  return { runner, records }
}

const testEnv = (projectRoot: string): Record<string, string | undefined> => ({
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
  CLAUDE_PROJECT_DIR: projectRoot,
  OXLINT_GUARD_HOOK_TEST_SECRET: 'do-not-leak',
})

const tree = (): Record<string, string> => ({
  [`${PROJECT}/.oxlintrc.json`]: '{}\n',
  [`${PROJECT}/oxlint.config.js`]: 'export default {}\n',
  [`${PROJECT}/src/clean.ts`]: 'export const ok = 1\n',
  [`${PROJECT}/src/bad40.ts`]: 'export const bad = 1\n',
  [`${PROJECT}/src/nofiles.ts`]: 'export const n = 1\n',
  [`${PROJECT}/src/panic.ts`]: 'export const p = 1\n',
  [`${PROJECT}/src/slow.ts`]: 'export const s = 1\n',
  [`${PROJECT}/src/spawnfail.ts`]: 'export const f = 1\n',
  [`${PROJECT}/src/primary.ts`]: 'export const p = 1\n',
  [`${PROJECT}/src/app.vue`]: '<template><div /></template>\n',
  [`${PROJECT}/src/tsgolint.ts`]: 'export const t = 1\n',
  [`${PROJECT}/src/tsgolint-still.ts`]: 'export const t = 1\n',
  [`${PROJECT}/src/nooxlint.ts`]: 'export const n = 1\n',
  [`${PROJECT}/src/deno-clean.ts`]: '#!/usr/bin/env -S deno run\nexport const ok = 1\n',
  [`${PROJECT}/src/check-fail.ts`]: '#!/usr/bin/env deno\nexport const bad = bad\n',
  [`${PROJECT}/src/lint-fail.ts`]: '#!/usr/bin/env deno\ndebugger;\n',
  [`${PROJECT}/src/deno-slow.ts`]: '#!/usr/bin/env deno\nexport const s = 1\n',
  [`${PROJECT}/src/deno-spawnfail.ts`]: '#!/usr/bin/env deno\nexport const f = 1\n',
  [`${PROJECT}/src/sh.ts`]: '#!/bin/sh\necho hi\n',
})

const execute = async (
  raw: string,
  projectRoot: string = PROJECT,
  customTree?: Record<string, string>,
): Promise<{ result: HookResult; records: SpawnRecord[] }> => {
  const { runner, records } = makeRunner()
  const options: GuardOptions = { fs: memFs(customTree ?? tree()), runner, envOverrides: testEnv(projectRoot) }
  const result = await runLintGuard(raw, FOREIGN_CWD, options)
  return { result, records }
}

const payload = (filePath: string, toolName = 'Edit'): string =>
  JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } })

const pnpmRecord = (records: SpawnRecord[]): SpawnRecord => {
  const record = records.find((r) => r.program === 'pnpm')
  assert(record !== undefined, 'expected an oxlint run through pnpm')
  return record
}

const denoRecords = (records: SpawnRecord[]): SpawnRecord[] => records.filter((r) => r.program === 'deno')

const SKILL_HEADER = 'FAILED — INVOKE SKILLS FIRST.'
const TRUNCATION_MARKER = '... [truncated — run the linter manually for full output]'
const SKILL_TAIL = 'Find skills for the ROOT CAUSE above. Invoke them, THEN fix.'

Deno.test('clean oxlint pass is silent with the first primary config', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/clean.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  const record = pnpmRecord(records)
  assertEquals(record.args, [
    'exec',
    'oxlint',
    '-c',
    `${PROJECT}/.oxlintrc.json`,
    '--type-aware',
    '--type-check',
    '-f',
    'unix',
    `${PROJECT}/src/clean.ts`,
  ])
  assertEquals(record.cwd, PROJECT)
  assertEquals(record.timeoutMs, 30_000)
  assertEquals(record.env.OXLINT_GUARD_HOOK_TEST_SECRET, undefined)
})

Deno.test('clean deno pair is silent', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/deno-clean.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  const checks = denoRecords(records)
  assertEquals(checks.length, 2)
  assertEquals(checks[0].args, ['check', '--', `${PROJECT}/src/deno-clean.ts`])
  assertEquals(checks[0].cwd, `${PROJECT}/src`)
  assertEquals(checks[1].args, ['lint', '--', `${PROJECT}/src/deno-clean.ts`])
})

Deno.test('non-edit tool is a silent skip', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/clean.ts`, 'NotebookEdit'))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('payload without file_path is a silent skip', async () => {
  const { result, records } = await execute(JSON.stringify({ tool_name: 'Edit', tool_input: {} }))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('non-JSON stdin is a silent skip', async () => {
  const { result, records } = await execute('not json at all')
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('non-lintable extension is a silent skip', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/README.md`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('missing file is a silent skip', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/absent.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('no oxlint config inside the project root is a silent skip', async () => {
  const isolatedTree: Record<string, string> = { [`${PROJECT}/src/deep.ts`]: 'export const d = 1\n' }
  const { result, records } = await execute(payload(`${PROJECT}/src/deep.ts`), '/isolated', isolatedTree)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('sh-shebang file routes to oxlint', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/sh.ts`))
  assertEquals(result.exitCode, 0)
  pnpmRecord(records)
})

Deno.test('deno-shebang file is guarded without any oxlint config', async () => {
  const { runner, records } = makeRunner()
  const bareTree: Record<string, string> = { [`${PROJECT}/src/deno-clean.ts`]: '#!/usr/bin/env -S deno run\n' }
  const result = await runLintGuard(payload(`${PROJECT}/src/deno-clean.ts`), FOREIGN_CWD, {
    fs: memFs(bareTree),
    runner,
    envOverrides: testEnv(PROJECT),
  })
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(denoRecords(records).length, 2)
})

Deno.test('deno check failure short-circuits lint and names DENO CHECK', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/check-fail.ts`))
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, `⛔ DENO CHECK ${SKILL_HEADER}`)
  assertStringIncludes(result.stderr, SKILL_TAIL)
  assertEquals(denoRecords(records).length, 1)
})

Deno.test('deno lint failure names DENO LINT', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/lint-fail.ts`))
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, `⛔ DENO LINT ${SKILL_HEADER}`)
  assertEquals(denoRecords(records).length, 2)
})

Deno.test('vue file routes to oxlint', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/app.vue`))
  assertEquals(result.exitCode, 0)
  assertEquals(pnpmRecord(records).args.at(-1), `${PROJECT}/src/app.vue`)
})

Deno.test('a config above the project root is never honored', async () => {
  const rootedTree: Record<string, string> = {
    '/elsewhere/.oxlintrc.jsonc': '{}\n',
    [`${PROJECT}/src/deep.ts`]: 'export const d = 1\n',
  }
  const { result, records } = await execute(payload(`${PROJECT}/src/deep.ts`), PROJECT, rootedTree)
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 0)
})

Deno.test('primary config names win over fallback names', async () => {
  const bothTree: Record<string, string> = {
    [`${PROJECT}/.oxlintrc.json`]: '{}\n',
    [`${PROJECT}/oxlint.config.js`]: 'export default {}\n',
    [`${PROJECT}/src/primary.ts`]: 'export const p = 1\n',
  }
  const { result, records } = await execute(payload(`${PROJECT}/src/primary.ts`), PROJECT, bothTree)
  assertEquals(result.exitCode, 0)
  const record = pnpmRecord(records)
  assertEquals(record.args, [
    'exec',
    'oxlint',
    '-c',
    `${PROJECT}/.oxlintrc.json`,
    '--type-aware',
    '--type-check',
    '-f',
    'unix',
    `${PROJECT}/src/primary.ts`,
  ])
})

Deno.test('oxlint violation carries the skills-first diagnostic capped at 30 lines', async () => {
  const { result } = await execute(payload(`${PROJECT}/src/bad40.ts`))
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, `⛔ OXLINT ${SKILL_HEADER}`)
  assertStringIncludes(result.stderr, 'Before fixing anything below, invoke skills that address why these rules fire.')
  assertStringIncludes(result.stderr, 'Already-invoked skills do NOT count. Each failure demands NEW invocations.')
  assertStringIncludes(result.stderr, '--- OXLINT output ---')
  assertStringIncludes(result.stderr, 'bad40.ts:30:1')
  assert(!result.stderr.includes('bad40.ts:31:1'), 'output past 30 lines must be cut')
  assertStringIncludes(result.stderr, TRUNCATION_MARKER)
  assertStringIncludes(result.stderr, SKILL_TAIL)
})

Deno.test('pnpm spawn failure exits 1 with an install hint, not a violation', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/spawnfail.ts`))
  assertEquals(result.exitCode, 1)
  assertStringIncludes(result.stderr, 'pnpm with oxlint as a dev dependency (pnpm add -D oxlint)')
  assert(!result.stderr.includes('INVOKE SKILLS FIRST'), 'an environment problem is not a lint violation')
  assertEquals(records.length, 1)
})

Deno.test('deno spawn failure exits 1 with an install hint', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/deno-spawnfail.ts`))
  assertEquals(result.exitCode, 1)
  assertStringIncludes(result.stderr, 'deno (https://deno.land)')
  assert(!result.stderr.includes('INVOKE SKILLS FIRST'))
  assertEquals(denoRecords(records).length, 1)
})

Deno.test('No files found to lint is a tolerated skip', async () => {
  const { result } = await execute(payload(`${PROJECT}/src/nofiles.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
})

Deno.test('oxlint panic on an ignored path is a tolerated skip', async () => {
  const { result } = await execute(payload(`${PROJECT}/src/panic.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
})

Deno.test('a timed-out linter run is a tolerated skip', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/slow.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 1)
})

Deno.test('missing tsgolint companion retries once without the type-aware flags', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/tsgolint.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(records.length, 2)
  assert(records[0]!.args.includes('--type-aware'))
  assertEquals(records[1]!.args.includes('--type-aware'), false)
  assertEquals(records[1]!.args.includes('--type-check'), false)
})

Deno.test('a retry that still fails reports the plain-run violation', async () => {
  const { result } = await execute(payload(`${PROJECT}/src/tsgolint-still.ts`))
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, SKILL_HEADER)
  assertStringIncludes(result.stderr, 'stillbad.ts:1:1')
})

Deno.test('a missing local oxlint binary exits 1 with the install hint, not a violation', async () => {
  const { result } = await execute(payload(`${PROJECT}/src/nooxlint.ts`))
  assertEquals(result.exitCode, 1)
  assertStringIncludes(result.stderr, 'pnpm add -D oxlint')
  assert(!result.stderr.includes(SKILL_HEADER))
})

Deno.test('a timed-out deno pair is a tolerated skip', async () => {
  const { result, records } = await execute(payload(`${PROJECT}/src/deno-slow.ts`))
  assertEquals(result, { exitCode: 0, stderr: '' })
  assertEquals(denoRecords(records).length, 1)
})

const streamOf = (chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

Deno.test('stdin within the cap reads as content', async () => {
  const stream = streamOf([bytes('hello '), bytes('world')])
  assertEquals(await readStdin(stream), { tag: 'content', content: 'hello world' })
})

Deno.test('stdin past the cap is too-large without buffering the overflow', async () => {
  const stream = streamOf([bytes('a'.repeat(1024)), bytes('b'.repeat(1025))])
  assertEquals(await readStdin(stream, 2048), { tag: 'too-large' })
  const exact = streamOf([bytes('a'.repeat(2048))])
  assertEquals(await readStdin(exact, 2048), { tag: 'content', content: 'a'.repeat(2048) })
})

Deno.test('decodePayload accepts an edit-tool payload', () => {
  assertEquals(decodePayload(payload(`${PROJECT}/src/clean.ts`)), {
    toolName: 'Edit',
    filePath: `${PROJECT}/src/clean.ts`,
  })
})

Deno.test('decodePayload rejects non-objects, arrays, and missing fields', () => {
  assertEquals(decodePayload('[]'), undefined)
  assertEquals(isRecord(null), false)
  assertEquals(isRecord([1]), false)
  assertEquals(isRecord({ ok: true }), true)
  assertEquals(decodePayload(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })), undefined)
  assertEquals(decodePayload(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '' } })), undefined)
})
