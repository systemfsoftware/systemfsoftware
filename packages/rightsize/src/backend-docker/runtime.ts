/**
 * Docker `SandboxRuntime` adapter — every lifecycle, exec, logs, copy and
 * inspect operation over the unix-socket client (behavioral reference:
 * upstream rightsize-node `src/backend-docker/backend.ts` at the fork
 * point, Apache-2.0; the observable semantics are the spec).
 *
 * A `SandboxHandle` here carries no companion mutable state: every operation
 * is a stateless HTTP call against the daemon-assigned container id already
 * on the handle, so there is nothing to look up in a side table.
 *
 * Streams: this backend never allocates a TTY, so `exec`/`logs`/`followLogs`
 * bodies arrive in the demux frame format; the pure demux kernel plus the
 * line assembler turn them into separated stdout/stderr (exec) and ordered
 * no-duplicate lines (logs/follow). Exec's exit code comes from
 * `GET /exec/{id}/json` — the exit code is a verdict, never an exception
 * (F3). `followLogs`'s close handle stops delivery and never flushes a
 * trailing fragment; docker's stream ends cleanly on its own once the
 * workload stops, unlike msb's `logs -f`, so no watchdog is needed here.
 *
 * `docker cp` shells out exactly where upstream does (see
 * `cli.shellout.ts`); a nonzero exit surfaces the tool's own stderr.
 *
 * @since 0.1.0
 */
import { Effect, Option, Schema as S } from 'effect'
import { type ContainerSpec, type ExecRequest, type ExecResult } from '../model/container-spec.js'
import { BackendError, PortBindConflictError } from '../model/errors.js'
import {
  type ContainerInspect,
  type FollowHandle,
  type SandboxHandle,
  type SandboxRuntimeService,
  type VirtualNetworksService,
} from '../runtime/runtime.js'
import { DockerCli, runDockerCli } from './cli.js'
import type { DockerClient, DockerStreamResponse } from './client.js'
import { buildCreateBody } from './container-create.js'
import { type Demuxer, demuxMultiplexed, type DemuxOutput, push } from './frames.js'
import { createLineAssembler, feedLines, flushLines, type LineAssembler } from './lines.js'
import { connectContainerToNetwork } from './networks.js'
import { isPortBindConflictMessage } from './port-conflict.js'
import { splitRepoTag } from './repotag.js'
import { decodeCollectionIds, decodeResponseBody } from './response.js'
import { ContainerCreateResponse, ContainerInspectResponse } from './wire/container.js'
import { ExecCreateRequest, ExecCreateResponse, ExecInspectResponse, ExecStartRequest } from './wire/exec.js'
import { encodeLogsQuery } from './wire/logs.js'

const STOP_TIMEOUT_SECS = 10
// `docker cp` of a directory scales with its contents, not a fixed small
// payload like the other unary daemon calls this backend makes.
const COPY_TIMEOUT_MS = 120_000

const encodeQueryValue = (s: string): string => encodeURIComponent(s)

/** The exact-match name filter for `GET /containers/json?filters=…` (`^/<name>$` anchors an exact match — Docker's name filter is substring-by-default). */
const nameFilterQuery = (name: string): string => encodeURIComponent(JSON.stringify({ name: [`^/${name}$`] }))

/** One `docker <args>` shell-out as an Effect, surfacing the tool's stderr on failure. */
const cliEffect = (args: readonly string[], description: string): Effect.Effect<void, BackendError> =>
  Effect.tryPromise({
    try: () =>
      runDockerCli(args, COPY_TIMEOUT_MS).then((result) => {
        if (result.exitCode !== 0) {
          throw BackendError.make({
            message: `${description} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
          })
        }
      }),
    catch: (err) =>
      S.is(BackendError)(err)
        ? err
        : BackendError.make({
          message: `${description} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        }),
  })

/** The wire body for one exec-create request. */
const execCreateBody = (request: ExecRequest): string =>
  JSON.stringify(
    S.encodeSync(ExecCreateRequest)({
      AttachStdout: true,
      AttachStderr: true,
      Cmd: [...request.command],
      WorkingDir: request.workingDir,
      Env: request.env.length > 0 ? request.env.map(([k, v]) => `${k}=${v}`) : undefined,
    }),
  )

/** The wire body for `POST /exec/{id}/start` — this backend always attaches. */
const execStartBody = (): string => JSON.stringify(S.encodeSync(ExecStartRequest)({ Detach: false }))

/** The wire body for `POST /containers/create`. */
const createRequestBody = (spec: ContainerSpec): string => JSON.stringify(buildCreateBody(spec))

/** One demux output routed into stdout/stderr sinks: raw-mode chunks (no TTY) and stdout frames go to stdout. */
const appendDemuxOutput = (stdoutChunks: Buffer[], stderrChunks: Buffer[], output: DemuxOutput): void => {
  if (output.tag !== 'frame') {
    stdoutChunks.push(Buffer.from(output.payload))
    return
  }
  if (output.streamType === 'stdout') {
    stdoutChunks.push(Buffer.from(output.payload))
  } else if (output.streamType === 'stderr') {
    stderrChunks.push(Buffer.from(output.payload))
  }
}

/**
 * Drains a demuxed daemon stream to its natural end, handing each output to
 * `onOutput` as it completes. Raw-mode chunks (a daemon/podman divergence
 * where the body is one combined byte stream) are passed through untouched —
 * the demux kernel routes them as `raw` outputs.
 */
const drainStream = (
  response: DockerStreamResponse,
  onOutput: (output: DemuxOutput) => void,
): Effect.Effect<void, BackendError> => {
  let demuxer: Demuxer = demuxMultiplexed()
  const iterator: AsyncIterator<Buffer> = response.body[Symbol.asyncIterator]()
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  let finished = false
  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    resolve()
  }
  const step = (): void => {
    iterator.next().then(
      (result: IteratorResult<Buffer>) => {
        if (result.done) {
          finish()
          return
        }
        const [next, outputs] = push(demuxer, result.value)
        demuxer = next
        for (const output of outputs) {
          onOutput(output)
        }
        step()
      },
      (error: unknown) => {
        reject(
          BackendError.make({
            message: `reading a streaming response from the Docker daemon failed: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          }),
        )
      },
    )
  }
  step()
  return Effect.tryPromise({
    try: () => promise,
    catch: (err) =>
      S.is(BackendError)(err)
        ? err
        : BackendError.make({
          message: `draining the daemon stream failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        }),
  })
}

/** Executes one non-detached exec: create → start (streamed) → inspect the exit-code verdict. */
const execEffect = (
  client: DockerClient,
  handle: SandboxHandle,
  request: ExecRequest,
): Effect.Effect<ExecResult, BackendError> =>
  Effect.gen(function*() {
    const created = yield* client.request('POST', `/containers/${handle.id}/exec`, execCreateBody(request))
    if (created.status >= 400) {
      return yield* BackendError.make({
        message:
          `docker could not create an exec for container ${handle.id} (HTTP ${created.status}): ${created.body.toString()}`,
      })
    }
    const execId = (yield* decodeResponseBody(ExecCreateResponse, 'execCreate')(created.body.toString())).Id

    const start = yield* client.requestStream('POST', `/exec/${execId}/start`, execStartBody())
    if (start.status >= 400) {
      return yield* BackendError.make({
        message: `docker could not start exec ${execId} for container ${handle.id} (HTTP ${start.status})`,
      })
    }

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    yield* drainStream(start, (output) => {
      appendDemuxOutput(stdoutChunks, stderrChunks, output)
    })

    const inspected = yield* client.request('GET', `/exec/${execId}/json`)
    const inspectDecoded = yield* decodeResponseBody(ExecInspectResponse, 'execInspect')(inspected.body.toString())

    return {
      exitCode: inspectDecoded.ExitCode,
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: Buffer.concat(stderrChunks).toString(),
    }
  })

/** Drains one logs-style stream through the line assembler, delivering one callback per completed line plus the tail once. */
const drainLogLines = (
  response: DockerStreamResponse,
  onLine: (line: string) => void,
): Effect.Effect<void, BackendError> =>
  Effect.gen(function*() {
    let assembler: LineAssembler = createLineAssembler()
    yield* drainStream(response, (output) => {
      const [next, lines] = feedLines(assembler, Buffer.from(output.payload).toString())
      assembler = next
      for (const line of lines) {
        onLine(line)
      }
    })
    const [, tail] = flushLines(assembler)
    if (tail !== undefined) {
      onLine(tail)
    }
  })

const pullIfMissing = (
  client: DockerClient,
  image: string,
  knownPresent: Set<string>,
): Effect.Effect<void, BackendError> =>
  Effect.gen(function*() {
    // One inspect per ref per runtime instance: the memo skips the daemon
    // round trip for every later create of a known-present image (the
    // port-conflict retry loop re-creates per attempt). A create failure
    // naming the image as missing drops the entry so the next attempt
    // re-inspects.
    if (knownPresent.has(image)) {
      return
    }
    const inspect = yield* client.request('GET', `/images/${encodeQueryValue(image)}/json`)
    if (inspect.status === 200) {
      knownPresent.add(image)
      return
    }
    const [repo, tag] = splitRepoTag(image)
    const pullPath = `/images/create?fromImage=${encodeQueryValue(repo)}&tag=${encodeQueryValue(tag)}`
    const resp = yield* client.request('POST', pullPath)
    if (resp.status >= 400) {
      return yield* BackendError.make({
        message: `docker could not pull image '${image}' (HTTP ${resp.status}): ${resp.body.toString()}`,
      })
    }
    knownPresent.add(image)
  })

const createEffect = (
  client: DockerClient,
  networks: VirtualNetworksService,
  spec: ContainerSpec,
  knownPresent: Set<string>,
): Effect.Effect<SandboxHandle, BackendError> =>
  Effect.gen(function*() {
    yield* pullIfMissing(client, spec.image, knownPresent)
    const resp = yield* client.request(
      'POST',
      `/containers/create?name=${encodeQueryValue(spec.name)}`,
      createRequestBody(spec),
    )
    if (resp.status >= 400) {
      // A failed create may name a vanished image (external removal mid-run):
      // drop the memo so the next attempt re-inspects instead of trusting it.
      knownPresent.delete(spec.image)
      return yield* BackendError.make({
        message: `docker could not create container '${spec.name}' (HTTP ${resp.status}): ${resp.body.toString()}`,
      })
    }
    const id = (yield* decodeResponseBody(ContainerCreateResponse, 'containerCreate')(resp.body.toString())).Id

    if (spec.networkId !== undefined) {
      yield* networks.ensureNetwork(spec.networkId)
      yield* connectContainerToNetwork(client, id, spec.networkId, spec.aliases)
    }

    return { id, spec }
  })

/**
 * Reads a follow-logs body to its end, delivering lines; stops on
 * `closeRequested`, never flushes past it. Any stream error just ends
 * delivery — best-effort streaming (docker's own stream ends cleanly once
 * the workload stops, so no watchdog is needed here). The returned `done`
 * promise settles exactly when delivery has stopped.
 */
const followLogsReader = (
  response: DockerStreamResponse,
  consumer: (line: string) => void,
  closeRequested: () => boolean,
): { readonly done: Promise<void> } => {
  let demuxer: Demuxer = demuxMultiplexed()
  let assembler: LineAssembler = createLineAssembler()
  const iterator: AsyncIterator<Buffer> = response.body[Symbol.asyncIterator]()
  const { promise, resolve } = Promise.withResolvers<void>()
  let finished = false
  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    resolve()
  }

  const deliver = (output: DemuxOutput): void => {
    const [next, lines] = feedLines(assembler, Buffer.from(output.payload).toString())
    assembler = next
    for (const line of lines) {
      if (closeRequested()) {
        return
      }
      consumer(line)
    }
  }

  const step = (): void => {
    if (closeRequested()) {
      finish()
      return
    }
    iterator.next().then(
      (result: IteratorResult<Buffer>) => {
        if (result.done) {
          if (!closeRequested()) {
            // stop delivery, never flush — an explicit close beat the stream to its own end.
            const [, tail] = flushLines(assembler)
            if (tail !== undefined) {
              consumer(tail)
            }
          }
          finish()
          return
        }
        if (!closeRequested()) {
          const [next, outputs] = push(demuxer, result.value)
          demuxer = next
          for (const output of outputs) {
            deliver(output)
          }
        }
        step()
      },
      () => {
        // Best-effort: a stream error just ends delivery.
        finish()
      },
    )
  }
  step()
  return { done: promise }
}

/**
 * The docker `SandboxRuntime` service over one client + one networks service
 * (the same networks helper `create` consults must be the one the layer
 * provides, so ensure/remove caching stays coherent within a process).
 */
export const makeDockerRuntime = (client: DockerClient, networks: VirtualNetworksService): SandboxRuntimeService => {
  /** Refs already confirmed present on this daemon — one inspect per ref. */
  const knownPresent = new Set<string>()
  return {
    name: 'docker',
    capabilities: {
      hardwareIsolated: false,
      checkpoint: true,
      checkpointRestartsWorkload: false,
      supportsNativeNetworks: true,
      healthInspection: true,
    },
    create: (spec: ContainerSpec) => createEffect(client, networks, spec, knownPresent),
    start: (handle: SandboxHandle) =>
      Effect.gen(function*() {
        const resp = yield* client.request('POST', `/containers/${handle.id}/start`)
        if (resp.status === 204 || resp.status === 304) {
          return // 304 = already started; treated as success like the daemon intends.
        }
        const message = resp.body.toString()
        if (resp.status === 500 && isPortBindConflictMessage(message)) {
          return yield* PortBindConflictError.make({
            message: `docker could not bind a host port for ${handle.id}: ${message}`,
          })
        }
        return yield* BackendError.make({
          message: `docker could not start container ${handle.id} (HTTP ${resp.status}): ${message}`,
        })
      }),
    stop: (handle: SandboxHandle) =>
      // Best-effort: teardown callers swallow failures, and 304/already-stopped is success.
      client.request('POST', `/containers/${handle.id}/stop?t=${STOP_TIMEOUT_SECS}`).pipe(Effect.asVoid, Effect.ignore),
    remove: (handle: SandboxHandle) =>
      // Best-effort removal; teardown callers swallow failures.
      client.request('DELETE', `/containers/${handle.id}?force=true`).pipe(Effect.asVoid, Effect.ignore),
    exec: (handle: SandboxHandle, request: ExecRequest) => execEffect(client, handle, request),
    logs: (handle: SandboxHandle) =>
      Effect.gen(function*() {
        const path = `/containers/${handle.id}/logs?${
          encodeLogsQuery({ stdout: true, stderr: true, follow: false, tail: 1000 })
        }`
        const response = yield* client.requestStream('GET', path)
        if (response.status >= 400) {
          return yield* BackendError.make({
            message: `docker could not fetch logs for container ${handle.id} (HTTP ${response.status})`,
          })
        }
        const lines: string[] = []
        yield* drainLogLines(response, (line) => lines.push(`${line}\n`))
        return lines.join('')
      }),
    followLogs: (handle: SandboxHandle, consumer: (line: string) => void) =>
      Effect.gen(function*() {
        const path = `/containers/${handle.id}/logs?${
          encodeLogsQuery({ stdout: true, stderr: true, follow: true, tail: 'all' })
        }`
        const response = yield* client.requestStream('GET', path)
        if (response.status >= 400) {
          return yield* BackendError.make({
            message: `docker could not follow logs for container ${handle.id} (HTTP ${response.status})`,
          })
        }

        let closeRequested = false
        const reader = followLogsReader(response, consumer, () => closeRequested)

        const close: FollowHandle = {
          close: Effect.sync(() => {
            closeRequested = true
            try {
              response.body.destroy()
            } catch {
              // Best-effort close: the stream may already be gone.
            }
          }).pipe(Effect.andThen(Effect.promise(() => reader.done))),
        }
        return close
      }),
    copyToContainer: (handle: SandboxHandle, hostPath: string, containerPath: string) =>
      cliEffect(DockerCli.copyIn(hostPath, handle.id, containerPath), `docker cp into ${handle.id}:${containerPath}`),
    copyFromContainer: (handle: SandboxHandle, containerPath: string, hostPath: string) =>
      cliEffect(DockerCli.copyOut(handle.id, containerPath, hostPath), `docker cp from ${handle.id}:${containerPath}`),
    inspect: (handle: SandboxHandle) =>
      Effect.gen(function*() {
        const resp = yield* client.request('GET', `/containers/${handle.id}/json`)
        if (resp.status === 404) {
          const result: ContainerInspect = { exists: false, running: false, health: undefined }
          return result
        }
        if (resp.status >= 400) {
          return yield* BackendError.make({
            message: `docker could not inspect container ${handle.id} (HTTP ${resp.status}): ${resp.body.toString()}`,
          })
        }
        const decoded = yield* decodeResponseBody(ContainerInspectResponse, 'containerInspect')(resp.body.toString())
        const healthStatus = decoded.State.Health?.Status
        const result: ContainerInspect = {
          exists: true,
          running: decoded.State.Running,
          health: healthStatus === 'healthy' || healthStatus === 'unhealthy' || healthStatus === 'starting'
            ? healthStatus
            : undefined,
        }
        return result
      }),
    removeByName: (name: string) =>
      Effect.gen(function*() {
        const filters = nameFilterQuery(name)
        const listed = yield* client.request('GET', `/containers/json?all=true&filters=${filters}`).pipe(Effect.option)
        if (Option.isNone(listed)) {
          return // best-effort: nothing to remove if even listing fails.
        }
        if (listed.value.status !== 200) {
          return
        }
        const ids = yield* decodeCollectionIds(listed.value.body.toString())
        if (ids.length === 0) {
          return
        }
        yield* client.request('DELETE', `/containers/${ids[0]}?force=true`).pipe(Effect.ignore)
      }),
    findRunning: (spec: ContainerSpec) =>
      Effect.gen(function*() {
        const filters = nameFilterQuery(spec.name)
        const listed = yield* client.request('GET', `/containers/json?filters=${filters}`).pipe(Effect.option)
        if (Option.isNone(listed)) {
          return undefined
        }
        if (listed.value.status !== 200) {
          return undefined
        }
        const ids = yield* decodeCollectionIds(listed.value.body.toString())
        if (ids.length === 0) {
          return undefined
        }
        const id = ids[0]
        if (id === undefined) {
          return undefined
        }
        return { id, spec }
      }),
  }
}
