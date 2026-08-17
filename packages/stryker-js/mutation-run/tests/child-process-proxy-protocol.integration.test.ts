/**
 * The child-process proxy protocol, round-tripped through the real forked
 * worker. The bootstrap gate only observes the `Ready` handshake: a
 * regression in the `Call` path can slip past it entirely. The shipped
 * doCall regression (fixed 2026-08-17) read the member out of the subject
 * and called the local binding, so every subject method ran with
 * `this === undefined` and failed on its first field access — a suite that
 * never dispatches a real `Call` could not see it. This gate forks the built
 * entry exactly like the parent, drives the full `Ready -> Init ->
 * Initialized -> Call -> CallResult` sequence against a fixture subject
 * whose members are all receiver-derived, and demands the exact values back:
 * a dropped receiver turns into a visible `CallRejection` (`TypeError:
 * Cannot read properties of undefined ...`) instead of the expected result.
 *
 * The fork target is read out of the built parent chunk — the emitted
 * `childProcess.fork(fileURLToPath(new URL(..., import.meta.url)))` literal
 * IS the parent's resolution; nothing is hard-coded here, so a rename of the
 * entry is followed automatically. The dist must exist, or the gate fails
 * loudly.
 *
 * The child's init opens a real TCP connection to the logging server address
 * carried in the Init message (`LoggingClient.openConnection`), so this test
 * stands up a `node:net` server on an ephemeral port and hands the child
 * that port — without it the child's init rejects and the gate would fail
 * for the wrong reason.
 */
import { fail } from 'node:assert'
import childProcess from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

import type { Json } from 'effect/Schema'
import type { CallMessage, InitMessage, ParentMessage } from '../src/worker-pool/message-protocol.js'
import { ParentMessageKind, WorkerMessageKind } from '../src/worker-pool/message-protocol.js'
import { ParentMessageSchema, WorkerMessageSchema } from '../src/worker-pool/message-protocol.schema.js'

/**
 * The gate drives the wire through the very codecs the two halves build, so a
 * format disagreement fails here rather than only inside a forked child.
 */
const encodeWorkerMessage = S.encodeSync(S.fromJsonString(WorkerMessageSchema))
const decodeParentMessage = S.decodeSync(S.fromJsonString(ParentMessageSchema))

const Feature = makeFeature({ it, layer })

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))

/**
 * The parent's fork call as emitted into a built chunk:
 * `childProcess.fork(fileURLToPath(new URL("./<entry>.mjs", import.meta.url)), ...)`.
 */
const FORK_TARGET_PATTERN =
  /(?:childProcess\s*\.\s*)?fork\s*\(\s*fileURLToPath\s*\(\s*new URL\s*\(\s*(["'])(\.\/[^"']+\.mjs)\1\s*,\s*import\.meta\.url\s*\)\s*\)/g

/**
 * Upper bound on the whole protocol: Ready, the Init/Initialized exchange and
 * every Call must complete inside this window, or the gate fails loudly. Real
 * time is deliberate here — fake timers cannot drive the clock of a forked
 * OS process; only the child itself can deliver `message`/`close`, and the
 * deadline turns a hang into the `timedOut` verdict the scenario acts on.
 */
const PROTOCOL_TIMEOUT_MS = 10_000

/** The fixture subject the Init message names, and its module as a file URL. */
const FIXTURE_NAMED_EXPORT = 'ProtocolRoundTripSubject'
const FIXTURE_MODULE_URL = new URL(
  './__fixtures__/protocol-round-trip-subject.mjs',
  import.meta.url,
).href

/**
 * The Calls this gate dispatches once the subject is initialized. `add` and
 * `describe` are receiver-dependent (constructor state / a second method on
 * `this`), so a dropped receiver cannot produce the expected answers; `stamp`
 * is a plain data member, exercising `doCall`'s raw pass-through branch;
 * `touch` returns nothing, which is the reply shape whose result member cannot
 * exist on the wire at all; and `merge` carries an argument shaped like the real
 * payloads - a plain object with an `undefined` optional member. That last one is
 * the case this gate did not have, and its absence is why a protocol declaring
 * the slot as a JSON *value* passed here and then crashed every real dry run:
 * `JSON.stringify` drops such a member, a JSON-value schema rejects it.
 */
const CALLS: ReadonlyArray<{
  readonly correlationId: number
  readonly methodName: string
  readonly args: unknown[]
}> = [
  { correlationId: 0, methodName: 'add', args: [2] },
  { correlationId: 1, methodName: 'describe', args: [] },
  { correlationId: 2, methodName: 'stamp', args: [] },
  { correlationId: 3, methodName: 'touch', args: [] },
  { correlationId: 4, methodName: 'merge', args: [{ mutate: 'src', ignore: undefined }] },
]

const collectMjsFiles = async (dir: string): Promise<readonly string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: Array<string> = []
  for (const entry of entries) {
    const fullPath = resolvePath(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMjsFiles(fullPath)))
    } else if (entry.name.endsWith('.mjs')) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Resolves the entry the parent actually forks, by reading the fork literal
 * out of the built parent chunk — the same module the parent executes and the
 * same resolution it performs at runtime. There is exactly one such call in
 * the whole bundle (checker and test-runner workers are subject modules
 * loaded by named export from a runtime-selected module path via
 * `ChildProcessProxy.create`, never forked).
 */
const resolveForkedEntry = async (): Promise<string> => {
  let chunks: readonly string[]
  try {
    chunks = await collectMjsFiles(DIST_DIR)
  } catch {
    throw new Error(
      `The built worker entry is missing: ${DIST_DIR} does not exist. This gate deliberately forks the BUILT artifact — the regression it guards only exists in the emitted module layout — so run pnpm --filter @systemfsoftware/stryker-js-mutation-run build first. A gate that skips when dist is absent is not a gate.`,
    )
  }
  const targets = new Set<string>()
  for (const chunkPath of chunks) {
    const chunk = await readFile(chunkPath, 'utf8')
    for (const match of chunk.matchAll(FORK_TARGET_PATTERN)) {
      const target = match[2]
      if (target !== undefined) {
        targets.add(target)
      }
    }
  }
  if (targets.size !== 1) {
    const found = [...targets].join(', ') || 'none'
    throw new Error(
      `Could not locate the worker fork call in the built chunks (found ${targets.size} candidate(s): ${found}). Expected exactly one childProcess.fork(fileURLToPath(new URL("./<entry>.mjs", import.meta.url)), ...) under ${DIST_DIR}. Rebuild with pnpm --filter @systemfsoftware/stryker-js-mutation-run build; if the bundler changed the emitted call shape, adjust FORK_TARGET_PATTERN in this test.`,
    )
  }
  const [target] = [...targets]
  if (target === undefined) {
    throw new Error(
      `Internal error: the fork-target set was validated to hold exactly one entry but yielded none under ${DIST_DIR}.`,
    )
  }
  const entryPath = resolvePath(DIST_DIR, target.slice(2))
  if (!existsSync(entryPath)) {
    throw new Error(
      `The fork target ${entryPath} is named by the built parent chunk but does not exist. The emitted entry map and the parent disagree — rebuild with pnpm --filter @systemfsoftware/stryker-js-mutation-run build.`,
    )
  }
  return entryPath
}

/** Terminates the forked child and waits for its actual exit — no leaked processes. */
const killAndReap = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  // Await the real exit signal, not a guessed delay: SIGTERM delivery is a
  // macrotask, so the `once` registration below cannot miss a termination
  // that happens in the same tick as the check above.
  await once(child, 'exit')
}

/** Binds a `node:net` server to an ephemeral port and reports the port. */
const listenOnEphemeralPort = (server: Server): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error(`The logging server bound to an unexpected address: ${typeof address}`))
      } else {
        resolve(address.port)
      }
    })
  })

const closeServer = (server: Server): Promise<void> => new Promise<void>((resolve) => server.close(() => resolve()))

/**
 * A failed wait: the child closed, the fork errored, or a phase deadline
 * expired. Raised by the inbox and turned into a typed verdict by the driver,
 * so the scenario's failure message carries the child's output.
 */
class ProtocolFailure extends Error {
  constructor(
    readonly failureKind: 'closed' | 'errored' | 'timedOut',
    message: string,
    readonly exitCode?: number | null,
    readonly signal?: NodeJS.Signals | null,
    readonly error?: Error,
  ) {
    super(message)
    this.name = 'ProtocolFailure'
  }
}

interface Waiter {
  readonly matches: (message: ParentMessage) => boolean
  readonly resolve: (message: ParentMessage) => void
  readonly reject: (failure: ProtocolFailure) => void
  readonly timer: NodeJS.Timeout
}

type ProtocolVerdict =
  | {
    readonly kind: 'completed'
    readonly entry: string
    readonly pid: number | undefined
    readonly outcomes: ReadonlyArray<{
      readonly correlationId: number
      readonly methodName: string
      readonly result: unknown
    }>
  }
  | {
    readonly kind: 'initRejected'
    readonly entry: string
    readonly pid: number | undefined
    readonly error: string
    readonly stdout: string
    readonly stderr: string
  }
  | {
    readonly kind: 'callRejection'
    readonly entry: string
    readonly pid: number | undefined
    readonly methodName: string
    readonly error: string
    readonly stdout: string
    readonly stderr: string
  }
  | {
    readonly kind: 'closed'
    readonly entry: string
    readonly pid: number | undefined
    readonly exitCode: number | null
    readonly signal: NodeJS.Signals | null
    readonly stdout: string
    readonly stderr: string
  }
  | {
    readonly kind: 'timedOut'
    readonly entry: string
    readonly pid: number | undefined
    readonly waitingFor: string
    readonly stdout: string
    readonly stderr: string
  }
  | {
    readonly kind: 'errored'
    readonly entry: string
    readonly pid: number | undefined
    readonly error: Error
    readonly stdout: string
    readonly stderr: string
  }

/**
 * Forks the resolved entry exactly like the parent (`src/worker-pool/
 * child-process-proxy.ts`): same fork options, same env shape. Then drives
 * the full protocol — Ready, Init (with a real ephemeral logging port), the
 * Initialized handshake, and one Call per CALLS entry — and ALWAYS kills and
 * reaps the child and closes the logging server before settling, on every
 * path. Every wait is bounded by PROTOCOL_TIMEOUT_MS, so a hang fails loudly
 * rather than hanging the suite.
 */
const runProtocolRoundTrip = async (): Promise<ProtocolVerdict> => {
  const entry = await resolveForkedEntry()
  let child: ChildProcess | undefined
  let stdout = ''
  let stderr = ''
  const loggingServer = createServer()
  try {
    const loggingServerPort = await listenOnEphemeralPort(loggingServer)
    child = childProcess.fork(entry, {
      silent: true,
      execArgv: [],
      env: { STRYKER_MUTATOR_WORKER: '0', ...process.env },
    })
    const pid = child.pid
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    // A tiny FIFO over the child's IPC channel: messages that no current wait
    // matches are buffered, and each wait either takes a buffered message or
    // registers its own waiter. A child close/error fails every waiter, and
    // every waiter carries its own timeout, so nothing can hang the suite.
    const pending: ParentMessage[] = []
    const waiters: Waiter[] = []
    let terminal: ProtocolFailure | undefined
    const failAll = (failure: ProtocolFailure): void => {
      terminal = failure
      const active = waiters.splice(0, waiters.length)
      for (const waiter of active) {
        clearTimeout(waiter.timer)
        waiter.reject(failure)
      }
    }
    child.on('message', (raw: unknown) => {
      const message = decodeParentMessage(String(raw))
      const waiterIndex = waiters.findIndex((waiter) => waiter.matches(message))
      if (waiterIndex !== -1) {
        const [waiter] = waiters.splice(waiterIndex, 1)
        if (waiter !== undefined) {
          clearTimeout(waiter.timer)
          waiter.resolve(message)
        }
        return
      }
      pending.push(message)
    })
    child.once('close', (code, signal) => {
      failAll(
        new ProtocolFailure(
          'closed',
          `The forked child closed without completing the protocol (exit code ${code}, signal ${signal ?? 'none'}).`,
          code,
          signal,
        ),
      )
    })
    child.once('error', (error) => {
      failAll(new ProtocolFailure('errored', `The forked child errored: ${error.message}`, undefined, undefined, error))
    })

    const deadline = Date.now() + PROTOCOL_TIMEOUT_MS
    const waitFor = (
      phase: string,
      matches: (message: ParentMessage) => boolean,
    ): Promise<ParentMessage> => {
      const bufferedIndex = pending.findIndex(matches)
      if (bufferedIndex !== -1) {
        const [buffered] = pending.splice(bufferedIndex, 1)
        if (buffered !== undefined) {
          return Promise.resolve(buffered)
        }
      }
      if (terminal !== undefined) {
        return Promise.reject(terminal)
      }
      return new Promise<ParentMessage>((resolve, reject) => {
        const timeoutMs = Math.max(0, deadline - Date.now())
        const waiter: Waiter = {
          matches,
          resolve,
          reject,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter)
            if (index !== -1) waiters.splice(index, 1)
            reject(new ProtocolFailure('timedOut', `Timed out while waiting for ${phase} (budget ${timeoutMs}ms).`))
          }, timeoutMs),
        }
        waiters.push(waiter)
      })
    }

    await waitFor('the Ready handshake', (message) => message.kind === ParentMessageKind.Ready)

    // The minimum Init that decodes against InitMessageSchema: options and
    // fileDescriptions are the empty-object decode (every option is defaulted),
    // no plugins to load, and the logging server address points at the server
    // this test is listening on.
    const initMessage: InitMessage = {
      kind: WorkerMessageKind.Init,
      loggingServerAddress: { port: loggingServerPort },
      options: S.decodeSync(StrykerOptionsSchema)({}),
      fileDescriptions: {},
      pluginModulePaths: [],
      workingDirectory: fileURLToPath(new URL('../', import.meta.url)),
      namedExport: FIXTURE_NAMED_EXPORT,
      modulePath: FIXTURE_MODULE_URL,
    }
    child.send(serializeMessage(initMessage))

    const initReply = await waitFor(
      'the Initialized handshake',
      (message) => message.kind === ParentMessageKind.Initialized || message.kind === ParentMessageKind.InitError,
    )
    if (initReply.kind === ParentMessageKind.InitError) {
      return { kind: 'initRejected', entry, pid, error: initReply.error, stdout, stderr }
    }

    const outcomes: Array<{
      readonly correlationId: number
      readonly methodName: string
      readonly result: unknown
    }> = []
    for (const { correlationId, methodName, args } of CALLS) {
      const callMessage: CallMessage = { args, correlationId, kind: WorkerMessageKind.Call, methodName }
      child.send(serializeMessage(callMessage))
      const reply = await waitFor(
        `a CallResult for "${methodName}"`,
        (message) => 'correlationId' in message && message.correlationId === correlationId,
      )
      if (reply.kind === ParentMessageKind.CallRejection) {
        return { kind: 'callRejection', entry, pid, methodName, error: reply.error, stdout, stderr }
      }
      if (reply.kind !== ParentMessageKind.CallResult) {
        return {
          kind: 'errored',
          entry,
          pid,
          error: new Error(`Received ${JSON.stringify(reply)} instead of a CallResult for "${methodName}".`),
          stdout,
          stderr,
        }
      }
      outcomes.push({ correlationId, methodName, result: reply.result })
    }
    return { kind: 'completed', entry, pid, outcomes }
  } catch (failure) {
    if (child !== undefined && failure instanceof ProtocolFailure) {
      switch (failure.failureKind) {
        case 'closed':
          return {
            kind: 'closed',
            entry,
            pid: child.pid,
            exitCode: failure.exitCode ?? null,
            signal: failure.signal ?? null,
            stdout,
            stderr,
          }
        case 'errored':
          return {
            kind: 'errored',
            entry,
            pid: child.pid,
            error: failure.error ?? new Error(failure.message),
            stdout,
            stderr,
          }
        case 'timedOut':
          return {
            kind: 'timedOut',
            entry,
            pid: child.pid,
            waitingFor: failure.message,
            stdout,
            stderr,
          }
      }
    }
    throw failure
  } finally {
    if (child !== undefined) {
      await killAndReap(child)
    }
    await closeServer(loggingServer)
  }
}

/** Encodes a worker message with the very codec the parent sends through. */
const serializeMessage = (message: InitMessage | CallMessage): string => encodeWorkerMessage(message)

const verdictDiagnostic = (verdict: Exclude<ProtocolVerdict, { kind: 'completed' }>): string => {
  const lines = [
    'The forked worker protocol did not round-trip a Call.',
    `Forked entry: ${verdict.entry}`,
    `Child pid: ${String(verdict.pid)}`,
  ]
  switch (verdict.kind) {
    case 'initRejected':
      lines.push('The child rejected the Init message instead of initializing:', verdict.error)
      break
    case 'callRejection':
      lines.push(
        `The child rejected the Call for "${verdict.methodName}" instead of returning a result:`,
        verdict.error,
      )
      break
    case 'closed':
      lines.push(
        `The child closed without completing the protocol (exit code ${verdict.exitCode ?? 'null'}, signal ${
          verdict.signal ?? 'null'
        }).`,
      )
      break
    case 'timedOut':
      lines.push(`The protocol stalled while waiting for "${verdict.waitingFor}" within ${PROTOCOL_TIMEOUT_MS}ms.`)
      break
    case 'errored':
      lines.push(`The protocol errored: ${verdict.error.message}`)
      break
  }
  lines.push(
    `Captured stdout: ${JSON.stringify(verdict.stdout)}`,
    `Captured stderr: ${JSON.stringify(verdict.stderr)}`,
    'Diagnosis: most likely the Call dispatch dropped the subject receiver (the `subjectMember(...args)`',
    'form of doCall). A bare call of the extracted member runs it with `this === undefined`, so the',
    'subject fails on its first field access in the child — visible above as the TypeError text of a',
    'CallRejection (or InitError) — and the parent proxy would surface the same failure to every',
    'receiver-dependent subject method.',
  )
  return lines.join('\n')
}

Feature('The child-process proxy protocol')
  .body(({ scenario }) => {
    scenario(
      'Should_RoundTripReceiverBoundCalls_When_DrivenThroughTheForkedProtocol',
      Gherkin.Do.pipe(
        When(
          'the built worker entry is forked, initialized with the fixture subject, and driven through the full protocol',
        )(
          'verdict',
          () => Effect.tryPromise(() => runProtocolRoundTrip()),
        ),
        Then('every call returns exactly the value its receiver-derived computation produces')((s) => {
          if (s.verdict.kind !== 'completed') {
            fail(verdictDiagnostic(s.verdict))
          }
          expect(s.verdict.outcomes).toEqual([
            { correlationId: 0, methodName: 'add', result: 42 },
            { correlationId: 1, methodName: 'describe', result: 'from-constructor:20' },
            { correlationId: 2, methodName: 'stamp', result: 'from-constructor' },
            // A void method: `null` is how JSON says "no value". An absent key
            // cannot say it - the encoder would omit the member and the decoder
            // could not tell absence from a present `undefined`, which is the
            // round-trip law's own counterexample.
            { correlationId: 3, methodName: 'touch', result: null },
            // A real payload shape: the `undefined` member is gone by the time the
            // child sees the object, because that is what `JSON.stringify` does with
            // it. The protocol has to accept the value the sender holds and carry
            // what the wire can - not reject the sender for holding it.
            { correlationId: 4, methodName: 'merge', result: { keys: ['mutate'], base: 40 } },
          ])
        }),
      ),
    )
  })
