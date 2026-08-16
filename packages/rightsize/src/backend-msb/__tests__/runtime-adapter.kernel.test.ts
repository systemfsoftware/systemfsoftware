/**
 * Runtime-adapter tests — the boot classification/retry matrix and the
 * exec/logs/follow/copy/inspect surfaces, all driven by a scripted
 * `CommandRunner` double (recorded argv + scripted `ls`/`logs`/`exec`
 * responses, clock budgets shrunk through `MsbRuntimeOptions`). No real msb
 * binary and no microVM anywhere in this suite.
 */
import { PassThrough } from 'node:stream'

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import type { ContainerSpec, ExecResult } from '../../model/container-spec.schema.js'
import { BackendError, PortBindConflictError } from '../../model/errors.js'
import type { CliChild, CommandRunnerService } from '../command-runner.js'
import {
  createMsbBackendState,
  createMsbRuntime,
  defaultMsbRuntimeOptions,
  type MsbRuntimeOptions,
} from '../runtime.adapter.js'

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

const baseSpec = (): ContainerSpec => ({
  name: 'rz-test-1',
  image: 'redis:8.6-alpine',
  env: [],
  ports: [],
  mounts: [],
  aliases: [],
  runId: 'test',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})

const result = (exitCode: number, stdout = '', stderr = ''): ExecResult => ({ exitCode, stdout, stderr })

/** A fake child whose streams carry `lines`; streams end + exit resolves only on kill. */
function aliveChild(lines: readonly string[] = []): CliChild {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  for (const line of lines) {
    stdout.write(`${line}\n`)
  }
  const { promise, resolve } = Promise.withResolvers<number | null>()
  return {
    exited: promise,
    stdout,
    stderr,
    stdin: new PassThrough(),
    kill: () => {
      stdout.end()
      stderr.end()
      resolve(null)
    },
  }
}

/** A fake child that already exited with `code` and the stderr a failed early boot would print. */
/** Resolves `compute` on the next microtask — a real fs/pipe boundary in miniature. */
function later<T>(compute: () => T): Promise<T> {
  const { promise, resolve } = Promise.withResolvers<T>()
  queueMicrotask(() => resolve(compute()))
  return promise
}

function exitedChild(lines: readonly string[], code: number): CliChild {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  for (const line of lines) {
    stderr.write(`${line}\n`)
  }
  const { promise, resolve } = Promise.withResolvers<number | null>()
  stdout.end()
  stderr.end()
  resolve(code)
  return { exited: promise, stdout, stderr, stdin: new PassThrough(), kill: () => resolve(null) }
}

interface RunnerScript {
  /** The names `msb ls` reports as Running — pre-seeded so every poll is deterministic. */
  running: string[]
  /** The text a `msb logs` call replays. */
  logText: string
  /** The stderr of the FIRST `msb run` spawn (empty = the attached child stays alive). */
  firstRunFailure?: readonly string[] | undefined
  /** When set, EVERY `msb run` spawn exits with these lines. */
  alwaysRunFailure?: readonly string[] | undefined
  /** Exec results by command tail; unmatched exec exits 0. */
  exec?: Record<string, ExecResult> | undefined
}

type ScriptedRunner = CommandRunnerService & { readonly invocations: Array<readonly string[]> }

/** The scripted runner double: records every argv, answers from the script. */
function scriptedRunner(script: RunnerScript): ScriptedRunner {
  const invocations: Array<readonly string[]> = []
  const respond = (args: readonly string[]): ExecResult => {
    invocations.push(args)
    if (args[0] === 'ls') {
      return result(0, JSON.stringify(script.running.map((name) => ({ name, status: 'Running', image: 'x:1' }))))
    }
    if (args[0] === 'logs') {
      return result(0, script.logText)
    }
    if (args[0] === 'exec') {
      const tail = args.slice(args.indexOf('--') + 1).join(' ')
      return script.exec?.[tail] ?? result(0, 'ok')
    }
    if (args[0] === 'image' && args[1] === 'remove') {
      return result(0)
    }
    return result(0)
  }
  let firstRunConsumed = false
  return {
    invocations,
    // A genuinely async edge (queued microtask), so the poll loop yields
    // BEFORE an answer is observed — the adopted exit-signal .then has run
    // by the time the first ls answer arrives, exactly like a real spawned
    // child's close-vs-poll ordering.
    invoke: (args) => Effect.promise(() => later(() => respond(args))),
    invokePromise: (args) => later(() => respond(args)),
    fetchStdoutExact: (args) =>
      Effect.promise(() =>
        later(() => {
          invocations.push(args)
          return script.logText
        })
      ),
    spawn: (args) =>
      Effect.sync(() => {
        invocations.push(args)
        if (args[0] === 'run') {
          if (script.alwaysRunFailure !== undefined) {
            return exitedChild(script.alwaysRunFailure, 1)
          }
          if (script.firstRunFailure !== undefined && !firstRunConsumed) {
            firstRunConsumed = true
            // The first poll can never win: running stays empty until the
            // retried boot's spawn, so the failed attempt MUST be observed.
            return exitedChild(script.firstRunFailure, 1)
          }
          // The retry boot after a consumed failure finds Running.
          if (firstRunConsumed) {
            script.running = ['rz-test-1']
          }
        }
        return aliveChild(['booting'])
      }),
    spawnSync: () => {},
  }
}

const quickOptions = (): MsbRuntimeOptions => ({
  ...defaultMsbRuntimeOptions(),
  readinessPollMs: 1,
  stateDbRetryDelayMs: 1,
  installLockRetryDelayMs: 1,
  installLockRetryBudgetMs: 40,
  agentEndpointRetryDelayMs: 1,
  agentEndpointRetryBudgetMs: 50,
  attachedProcStopTimeoutMs: 50,
})

const CACHE_LINES = [
  'error: image error: cache error at /tmp/.microsandbox/cache/layers/sha256_deadbeef.tar.gz: No such file or directory (os error 2)',
]
const DB_LINES = ['error: database error: Execution Error: error returned from database: (code: 1) already exists']
const LOCK_LINES = [
  'error: runtime error: microsandbox install operation is in progress until 2026-08-01 19:26:19.025098100',
]

const makeRunner = (runner: ScriptedRunner) => {
  const state = createMsbBackendState()
  const runtime = createMsbRuntime(runner, state, quickOptions())
  return { state, service: runtime.service }
}

// ---------------------------------------------------------------------------
// Boot + retry matrix
// ---------------------------------------------------------------------------

describe('attached boot', () => {
  it('Should_RegisterRunning_When_LsReportsNameRunning', () => {
    const runner = scriptedRunner({ running: ['rz-test-1'], logText: '' })
    const { state, service } = makeRunner(runner)
    const handle = Effect.runSync(service.create(baseSpec()))
    return expect(Effect.runPromise(service.start(handle))).resolves.toBeUndefined().then(() => {
      expect(state.startedNames.has('rz-test-1')).toBe(true)
      expect(runner.invocations.find((args) => args[0] === 'run')).toEqual([
        'run',
        '--name',
        'rz-test-1',
        'redis:8.6-alpine',
      ])
    })
  })

  it('Should_HealCacheCorruption_When_FirstBootFailsWithCacheError', () => {
    const runner = scriptedRunner({ running: [], logText: '', firstRunFailure: CACHE_LINES })
    const { state, service } = makeRunner(runner)
    const handle = { id: 'rz-test-1', spec: baseSpec() }
    return expect(Effect.runPromise(service.start(handle))).resolves.toBeUndefined().then(() => {
      expect(state.startedNames.has('rz-test-1')).toBe(true)
      expect(runner.invocations.filter((args) => args[0] === 'image' && args[1] === 'remove')).toEqual([
        ['image', 'remove', 'redis:8.6-alpine'],
      ])
    })
  })

  it('Should_RetryStateDb_When_FirstBootHitsDatabaseError', () => {
    const runner = scriptedRunner({ running: [], logText: '', firstRunFailure: DB_LINES })
    const { service } = makeRunner(runner)
    const handle = { id: 'rz-test-1', spec: baseSpec() }
    return expect(Effect.runPromise(service.start(handle))).resolves.toBeUndefined().then(() => {
      expect(runner.invocations.filter((args) => args[0] === 'run')).toHaveLength(2)
    })
  })

  it('Should_FailPortBind_When_FirstBootPrintsPortInUse', () => {
    const runner = scriptedRunner({ running: [], logText: '', firstRunFailure: ['error: port is already allocated'] })
    const { service } = makeRunner(runner)
    const handle = { id: 'rz-test-1', spec: baseSpec() }
    return expect(Effect.runPromise(service.start(handle))).rejects.toBeInstanceOf(PortBindConflictError)
  })

  it('Should_GiveUpInstallLock_When_BudgetLapses', () => {
    const runner = scriptedRunner({ running: [], logText: '', alwaysRunFailure: LOCK_LINES })
    const { service } = makeRunner(runner)
    const handle = { id: 'rz-test-1', spec: baseSpec() }
    return expect(Effect.runPromise(service.start(handle))).rejects.toBeInstanceOf(BackendError).then(() => {
      expect(runner.invocations.filter((args) => args[0] === 'run').length).toBeGreaterThan(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Exec + follow + inspect + copy
// ---------------------------------------------------------------------------

describe('exec', () => {
  it('Should_RetryExec_When_StderrCarriesAgentEndpointNotReady', () => {
    const runner = scriptedRunner({
      running: ['rz-test-1'],
      logText: '',
      exec: {
        'sh -c true': result(1, '', 'error: agent client error: connect \\pipe 2'),
      },
    })
    const { service } = makeRunner(runner)
    const handle = { id: 'rz-test-1', spec: baseSpec() }
    const program = service.exec(handle, { command: ['sh', '-c', 'true'], env: [] })
    return expect(Effect.runPromise(program)).resolves.toMatchObject({ exitCode: 1 }).then(() => {
      const execs = runner.invocations.filter((args) => args[0] === 'exec')
      // The agent-endpoint-not-ready framing is RETRIED, not surfaced; the
      // budget-exhausted LAST attempt's result is what the caller sees.
      expect(execs.length).toBeGreaterThan(1)
      expect(execs[0]).toEqual(['exec', 'rz-test-1', '--', 'sh', '-c', 'true'])
    })
  })
})
