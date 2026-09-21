import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { Context, Effect, HashMap, Layer, Match, Option, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as Scope from 'effect/Scope'
import * as Socket from 'effect/unstable/socket/Socket'
import type { Sandbox } from 'microsandbox'
import { acquire } from './internal/SandboxEngine.js'
import type { AcquiredVM } from './internal/SandboxEngine.js'
import { ExecError, SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
import type { MicroVMError } from './MicroVMError.schema.js'
import type { MicroVMSpec, WaitStrategy } from './MicroVMSpec.schema.js'

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface LogLine {
  readonly source: string
  readonly text: string
}

export interface RunningVM {
  readonly name: string
  readonly mappedPorts: HashMap.HashMap<number, number>
  readonly exec: (cmd: string, args?: ReadonlyArray<string>) => Effect.Effect<ExecResult, ExecError>
  readonly logs: Stream.Stream<LogLine, SandboxBootError>
  readonly ping: Effect.Effect<boolean>
}

/**
 * The MicroVM service: starts Scope-managed microVM sandboxes from pure
 * `MicroVMSpec` data, applying the spec's wait strategy before the
 * acquired handle is returned. `spec.ports` publishes host loopback ports
 * only.
 */
export class MicroVM extends Context.Service<MicroVM, {
  readonly start: (spec: MicroVMSpec) => Effect.Effect<RunningVM, MicroVMError, Scope.Scope>
}>()('MicroVM') {}

const describeCause = (cause: unknown): string => cause instanceof Error ? cause.message : 'non-error rejection'

const execOf =
  (sandbox: Sandbox) => (cmd: string, args: ReadonlyArray<string> = []): Effect.Effect<ExecResult, ExecError> => {
    const argv = [cmd, ...args]
    return Effect.map(
      Effect.tryPromise({
        try: () => sandbox.exec(cmd, [...args]),
        catch: (cause) => new ExecError({ argv, reason: describeCause(cause) }),
      }),
      (output): ExecResult => ({ code: output.status.code, stdout: output.stdout(), stderr: output.stderr() }),
    )
  }

const logsOf = (sandbox: Sandbox): Stream.Stream<LogLine, SandboxBootError> =>
  Stream.flatMap(
    Stream.fromEffect(
      Effect.tryPromise({
        try: () => sandbox.logStream({ follow: true }),
        catch: (cause) => new SandboxBootError({ sandboxName: sandbox.name, reason: describeCause(cause) }),
      }),
    ),
    (logStream) =>
      Stream.fromAsyncIterable(logStream, (cause) =>
        new SandboxBootError({ sandboxName: sandbox.name, reason: describeCause(cause) })),
  ).pipe(
    Stream.map((entry): LogLine => ({ source: entry.source, text: entry.text() })),
  )

const probeConnect = (
  hostPort: number,
): Effect.Effect<Option.Option<Socket.Socket>, never, Scope.Scope> =>
  Effect.map(
    Effect.option(Layer.build(NodeSocket.layerNet({ host: '127.0.0.1', port: hostPort }))),
    Option.map((context) => Context.get(context, Socket.Socket)),
  )

const dialProbe = (hostPort: number): Effect.Effect<boolean> =>
  Effect.scoped(Effect.map(probeConnect(hostPort), Option.isSome))

const statusOk = (text: string): boolean => /^HTTP\/[\d.]+ 2\d\d/.test(text)

const decoder = new TextDecoder()

const decodeChunk = (chunk: Uint8Array | string): string => typeof chunk === 'string' ? chunk : decoder.decode(chunk)

const exchangeOn = (
  socket: Socket.Socket,
  path: string,
): Effect.Effect<boolean, Socket.SocketError, Scope.Scope> =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const reader = yield* socket.reader
    yield* writer.write(`GET ${path} HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    const chunks = yield* Effect.option(reader.pull)
    return Option.isSome(chunks) && statusOk(decodeChunk(chunks.value[0]))
  })

const httpProbe = (hostPort: number, path: string): Effect.Effect<boolean> =>
  Effect.scoped(
    Effect.flatMap(probeConnect(hostPort), (picked) =>
      Option.match(picked, {
        onNone: () => Effect.succeed(false),
        onSome: (socket) => Effect.map(Effect.option(exchangeOn(socket, path)), Option.getOrElse(() => false)),
      })),
  )

const logProbe = (sandbox: Sandbox, pattern: RegExp): Effect.Effect<boolean> =>
  Effect.map(
    Effect.option(Effect.promise(() => sandbox.logs())),
    (entries) => Option.isSome(entries) && entries.value.some((entry) => pattern.test(entry.text())),
  )

const WAIT_TIMEOUT_MS = 30_000
const WAIT_POLL_MS = 250

const awaitProbe = (
  wait: string,
  timeoutMs: number,
  probe: Effect.Effect<boolean>,
): Effect.Effect<void, WaitTimeoutError> =>
  Effect.suspend(() => {
    let remaining = Math.max(1, Math.floor(timeoutMs / WAIT_POLL_MS))
    let satisfied = false
    return Effect.whileLoop({
      while: () => !satisfied && remaining > 0,
      body: () =>
        Effect.andThen(
          Effect.map(probe, (result) => {
            if (result) satisfied = true
          }),
          Effect.sleep(`${WAIT_POLL_MS} millis`),
        ),
      step: () => {
        remaining -= 1
      },
    }).pipe(
      Effect.andThen(
        Effect.suspend(() => satisfied ? Effect.void : Effect.fail(new WaitTimeoutError({ wait, timeoutMs }))),
      ),
    )
  })

const hostPortFor = (vm: AcquiredVM, guest: number): number | undefined => {
  const binding = vm.plan.portBindings.find((candidate) => candidate.guest === guest)
  return binding?.hostPort
}

const waitLabel = (strategy: WaitStrategy): string =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => `port:${port}`),
    Match.tag('Http', ({ path, port }) => `http:${path}@${port}`),
    Match.tag('Log', ({ pattern }) => `log:${pattern}`),
    Match.exhaustive,
  )

const probeFor = (vm: AcquiredVM, strategy: WaitStrategy): Effect.Effect<boolean> =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => {
      const hostPort = hostPortFor(vm, port)
      return hostPort === undefined ? Effect.succeed(false) : dialProbe(hostPort)
    }),
    Match.tag('Http', ({ path, port }) => {
      const hostPort = hostPortFor(vm, port)
      return hostPort === undefined ? Effect.succeed(false) : httpProbe(hostPort, path)
    }),
    Match.tag('Log', ({ pattern }) => logProbe(vm.sandbox, new RegExp(pattern))),
    Match.exhaustive,
  )

const defaultStrategy = (spec: MicroVMSpec): WaitStrategy => ({ _tag: 'Port', port: spec.ports[0] ?? 1 })

const portWait = (spec: MicroVMSpec): WaitStrategy | undefined =>
  spec.ports.length === 0 ? undefined : defaultStrategy(spec)

const waits = (spec: MicroVMSpec): WaitStrategy | undefined => spec.waitStrategy ?? portWait(spec)

const startWith = (fs: FileSystem.FileSystem) => (spec: MicroVMSpec) =>
  Effect.gen(function*() {
    const vm = yield* acquire(spec, fs)
    const strategy = waits(spec)
    if (strategy !== undefined) {
      yield* awaitProbe(waitLabel(strategy), WAIT_TIMEOUT_MS, probeFor(vm, strategy))
    }
    return {
      name: vm.plan.name,
      mappedPorts: HashMap.fromIterable(
        vm.plan.portBindings.map((binding) => [binding.guest, binding.hostPort] as const),
      ),
      exec: execOf(vm.sandbox),
      logs: logsOf(vm.sandbox),
      ping: Effect.map(Effect.option(Effect.promise(() => vm.sandbox.ping())), Option.isSome),
    }
  })

export const layer: Layer.Layer<MicroVM> = Layer.effect(
  MicroVM,
  Effect.map(FileSystem.FileSystem, (fs) => ({ start: startWith(fs) })),
).pipe(Layer.provide(nodeFileSystemLayer))
