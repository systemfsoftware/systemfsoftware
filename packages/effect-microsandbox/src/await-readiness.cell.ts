import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Option, Schedule } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Socket from 'effect/unstable/socket/Socket'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
import type { WaitStrategy } from './MicroVMSpec.schema.js'
import {
  ResolveWaitStrategy,
  resolveWaitStrategy,
  type WaitRequired,
  type WaitSkipped,
} from './resolve-wait-strategy.workflow.js'

const WAIT_TIMEOUT_MS = 30_000
const WAIT_POLL_MS = 250
const LOOPBACK_HOST = '127.0.0.1'

const probeConnect = (hostPort: number) => Effect.option(NodeSocket.makeNet({ host: LOOPBACK_HOST, port: hostPort }))

const dialProbe = (hostPort: number) => Effect.scoped(Effect.map(probeConnect(hostPort), Option.isSome))

const statusOk = (text: string): boolean => /^HTTP\/[\d.]+ 2\d\d/.test(text)

const decoder = new TextDecoder()

const decodeChunk = (chunk: Uint8Array | string): string => typeof chunk === 'string' ? chunk : decoder.decode(chunk)

const exchangeOn = (socket: Socket.Socket, path: string) =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const reader = yield* socket.reader
    yield* writer.write(`GET ${path} HTTP/1.0\r\nHost: ${LOOPBACK_HOST}\r\nConnection: close\r\n\r\n`)
    const chunks = yield* Effect.option(reader.pull)
    return Option.isSome(chunks) && statusOk(decodeChunk(chunks.value[0]))
  })

const httpProbe = (hostPort: number, path: string) =>
  Effect.scoped(
    Effect.flatMap(probeConnect(hostPort), (picked) =>
      Option.match(picked, {
        onNone: () => Effect.succeed(false),
        onSome: (socket) => Effect.map(Effect.option(exchangeOn(socket, path)), Option.getOrElse(() => false)),
      })),
  )

interface LogReader {
  readonly name: string
  readonly logs: () => Promise<ReadonlyArray<{ readonly text: () => string }>>
}

const logProbe = (reader: LogReader, pattern: RegExp) =>
  Effect.map(
    Effect.tryPromise({
      try: () => reader.logs(),
      catch: (cause) => new SandboxBootError({ sandboxName: reader.name, cause }),
    }),
    (entries) => entries.some((entry) => pattern.test(entry.text())),
  )

const awaitProbe = (wait: string, timeoutMs: number, probe: Effect.Effect<boolean, SandboxBootError>) =>
  Effect.asVoid(
    Effect.timeoutOrElse(
      Effect.repeat(probe, {
        schedule: Schedule.spaced(`${WAIT_POLL_MS} millis`),
        until: (satisfied) => satisfied,
      }),
      {
        duration: `${timeoutMs} millis`,
        orElse: () => Effect.fail(new WaitTimeoutError({ wait, timeoutMs })),
      },
    ),
  )

const hostPortFor = (vm: AcquiredVM, guest: number) =>
  Option.map(
    Arr.findFirst(vm.plan.portBindings, (candidate) => candidate.guest === guest),
    (candidate) => candidate.hostPort,
  )

const waitLabel = (strategy: WaitStrategy) =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => `port:${port}`),
    Match.tag('Http', ({ path, port }) => `http:${path}@${port}`),
    Match.tag('Log', ({ pattern }) => `log:${pattern}`),
    Match.exhaustive,
  )

const probeMapped = (vm: AcquiredVM, guestPort: number, probe: (hostPort: number) => Effect.Effect<boolean>) =>
  Option.match(hostPortFor(vm, guestPort), {
    onNone: () => Effect.succeed(false),
    onSome: (hostPort) => probe(hostPort),
  })

const probeFor = (vm: AcquiredVM, strategy: WaitStrategy) =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => probeMapped(vm, port, dialProbe)),
    Match.tag('Http', ({ path, port }) => probeMapped(vm, port, (hostPort) => httpProbe(hostPort, path))),
    Match.tag('Log', ({ pattern }) => logProbe(vm.sandbox, new RegExp(pattern))),
    Match.exhaustive,
  )

const readReadinessCommand = (vm: AcquiredVM) => Effect.succeed(vm)

const writeReadiness = (outcome: Result.Result<WaitRequired | WaitSkipped, never>, vm: AcquiredVM) =>
  Match.value(Result.getOrThrow(outcome)).pipe(
    Match.tag(
      'WaitRequired',
      ({ strategy }) => Effect.as(awaitProbe(waitLabel(strategy), WAIT_TIMEOUT_MS, probeFor(vm, strategy)), vm),
    ),
    Match.tag('WaitSkipped', () => Effect.succeed(vm)),
    Match.exhaustive,
  )

export const awaitReadiness = Sandwich.named('await_readiness')(readReadinessCommand)
  .decode(Sandwich.pure((vm: AcquiredVM) => Result.succeed(new ResolveWaitStrategy({ spec: vm.spec }))))
  .decide(resolveWaitStrategy)
  .encode(Sandwich.pure(Result.succeed))
  .write(writeReadiness)
