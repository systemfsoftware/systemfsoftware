import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Deferred, Effect, Fiber, Match, Ref } from 'effect'
import type * as Scope from 'effect/Scope'
import { Sandbox } from 'microsandbox'
import assert from 'node:assert'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const sandboxPrefix = 'effect-microsandbox-'

const recordGone = (name: string): Effect.Effect<boolean> =>
  Effect.match(
    Effect.tryPromise({ try: () => Sandbox.get(name), catch: () => undefined }),
    { onFailure: () => true, onSuccess: () => false },
  )

const alpine = MicroVM.spec('alpine:3.20').withExposedPorts([8080])
const portless = MicroVM.spec('alpine:3.20')

const randomToken = (): string => randomBytes(16).toString('hex')

/**
 * Byte-exact expectation for `yes "$SEED" | head -c <size>`: busybox `yes` writes
 * `SEED\n` forever and `head -c` truncates that stream to exactly `size` bytes.
 */
const yesOutput = (seed: string, size: number): Buffer => {
  const line = Buffer.from(`${seed}\n`)
  const out = Buffer.alloc(size)
  for (let offset = 0; offset < size; offset += line.length) line.copy(out, offset)
  return out
}

const assertBytes = (label: string, actual: Uint8Array, expected: Uint8Array): void => {
  assert.equal(actual.length, expected.length, `${label}: byte length`)
  assert.equal(Buffer.compare(actual, expected), 0, `${label}: bytes must match`)
}

const portOf = (server: Server): number => {
  const address = server.address()
  return address === null || typeof address === 'string' ? 0 : address.port
}

interface HostListener {
  readonly requests: Ref.Ref<number>
  readonly url: string
}

type HostReply = (request: IncomingMessage, response: ServerResponse, server: Server) => void

const openListener = (reply: HostReply): Effect.Effect<HostListener, never, Scope.Scope> =>
  Effect.gen(function*() {
    const requests = yield* Ref.make(0)
    const server = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new Promise<Server>((resolve, reject) => {
            const server = createServer((request, response) => {
              Effect.runSync(Ref.update(requests, (count) => count + 1))
              reply(request, response, server)
            })
            server.once('error', reject)
            server.listen(0, '127.0.0.1', () => {
              server.unref()
              resolve(server)
            })
          }),
        catch: (cause) => new Error('host listener failed to bind', { cause }),
      }).pipe(Effect.orDie),
      (server) =>
        Effect.sync(() => {
          server.closeAllConnections()
          server.close()
        }),
    )
    return { requests, url: `http://host.microsandbox.internal:${portOf(server)}/` }
  })

const exitCodeOf = (completion: MicroVM.JobCompletion): number =>
  Match.value(completion.status).pipe(
    Match.tag('JobExited', (exited) => exited.code),
    Match.tag('JobSignaled', () => assert.fail('expected JobExited, got JobSignaled')),
    Match.exhaustive,
  )

const assertFetchFailed = (label: string, completion: MicroVM.JobCompletion): void => {
  assert.notEqual(exitCodeOf(completion), 0, `${label}: a failed fetch must exit with a non-zero code`)
}

const assertSignaled = (label: string, completion: MicroVM.JobCompletion): void => {
  const verdict = Match.value(completion.status).pipe(
    Match.tag('JobSignaled', () => 'signaled'),
    Match.tag('JobExited', (exited) => `exited with ${exited.code}`),
    Match.exhaustive,
  )
  assert.equal(verdict, 'signaled', `${label}: a signal death must classify as JobSignaled`)
}

const listSandboxPage = (cursor: string | undefined) =>
  Effect.tryPromise({
    try: () => (cursor === undefined ? Sandbox.list() : Sandbox.listWith((list) => list.cursor(cursor))),
    catch: (cause) => new Error('sandbox listing failed', { cause }),
  }).pipe(Effect.orDie)

const sandboxNamesFrom = (cursor: string | undefined): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function*() {
    const page = yield* listSandboxPage(cursor)
    const names = page.sandboxes.map((sandbox) => sandbox.name)
    const rest = yield* Effect.suspend(() =>
      page.nextCursor === undefined
        ? Effect.succeed<ReadonlyArray<string>>([])
        : sandboxNamesFrom(page.nextCursor)
    )
    return [...names, ...rest]
  })

const assertNoLeftovers = (label: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const names = yield* sandboxNamesFrom(undefined)
    const leftovers = names.filter((name) => name.startsWith(sandboxPrefix))
    assert.deepStrictEqual(leftovers, [], `${label}: no ${sandboxPrefix}* sandbox may remain`)
  })

const j1 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J1: scoped boot, mapped port, record cleanup')
    const spec = alpine.withEnv({ SMOKE_JOURNEY: 'j1' })
    const vm = yield* spec.scoped
    const pinged = yield* MicroVM.ping(vm)
    assert.ok(pinged, 'ping must return true')
    const out = yield* MicroVM.exec(vm, 'echo', ['hello'])
    assert.equal(out.code, 0)
    assert.ok(out.stdout.includes('hello'), 'guest must echo the exec payload')
    const hostPort = yield* MicroVM.port(vm, 8080)
    assert.ok(hostPort > 0, 'guest port 8080 must map to a positive host port')
    const url = yield* MicroVM.url(vm, 8080, '/ping')
    assert.equal(url, `http://127.0.0.1:${hostPort}/ping`)
    return vm.name
  }),
)

const j2 = Effect.gen(function*() {
  yield* Effect.logInfo('[smoke] J2: interrupting booted VM, awaiting finalizer')
  const spec = portless
  const booted = yield* Deferred.make<string>()
  const fiber = yield* Effect.forkChild(
    Effect.scoped(
      Effect.flatMap(spec.scoped, (vm) => Deferred.succeed(booted, vm.name).pipe(Effect.andThen(Effect.never))),
    ),
  )
  const name = yield* Deferred.await(booted)
  yield* Fiber.interrupt(fiber)
  return name
})

const j3 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J3: one layer build, two sequential VM lifecycles')
    const spec = alpine.withEnv({ SMOKE_JOURNEY: 'j3' })
    const first = yield* Effect.scoped(
      Effect.flatMap(spec.scoped, (vm) => vm.pipe(MicroVM.exec('echo', ['first']))),
    )
    assert.equal(first.code, 0)
    assert.ok(first.stdout.includes('first'))
    const second = yield* Effect.scoped(
      Effect.flatMap(spec.scoped, (vm) => vm.pipe(MicroVM.exec('echo', ['second']))),
    )
    assert.equal(second.code, 0)
    assert.ok(second.stdout.includes('second'))
  }),
)

const j4 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J4: dual parity, unmapped-port refusal, driver encapsulation, escape-hatch cause')
    const vm = yield* alpine.withEnv({ SMOKE_JOURNEY: 'j4' }).scoped
    const portFirst = yield* MicroVM.port(vm, 8080)
    const portLast = yield* vm.pipe(MicroVM.port(8080))
    assert.equal(portFirst, portLast)
    const urlFirst = yield* MicroVM.url(vm, 8080, '/ping')
    const urlLast = yield* vm.pipe(MicroVM.url(8080, '/ping'))
    assert.equal(urlFirst, urlLast)
    const refusal = yield* Effect.flip(MicroVM.port(vm, 9999))
    const refusedGuest = Match.value(refusal).pipe(
      Match.tag('PortAllocationError', (error) => error.guestPort),
      Match.exhaustive,
    )
    assert.equal(refusedGuest, 9999)
    assert.ok(!('sandbox' in vm), 'native driver must not be reachable from the handle surface')
    const echoed = yield* MicroVM.use(vm, async (sandbox) => sandbox.name)
    assert.equal(echoed, vm.name)
    const defect = new Error('smoke escape-hatch defect')
    const useRefusal = yield* Effect.flip(MicroVM.use(vm, () => Promise.reject(defect)))
    const preserved = Match.value(useRefusal).pipe(
      Match.tag('SandboxBootError', (error) => error.cause),
      Match.exhaustive,
    )
    assert.equal(preserved, defect)
  }),
)

const payloadSize = 2 * 1024 * 1024

const j5 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J5: job stdout payload, host-random seed, byte-exact')
    const seed = randomToken()
    const completion = yield* MicroVM.job('alpine:3.20', ['sh', '-c', `yes "$SEED" | head -c ${payloadSize}`])
      .withEnv({ SEED: seed })
      .run
    assert.equal(exitCodeOf(completion), 0, 'payload job must exit 0')
    assertBytes('J5 stdout', completion.stdout, yesOutput(seed, payloadSize))
    assert.equal(completion.stderr.length, 0, 'payload job must leave stderr empty')
  }),
)

const j6 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J6: job stderr payload with exit 42')
    const seed = randomToken()
    const completion = yield* MicroVM.job('alpine:3.20', [
      'sh',
      '-c',
      `yes "$SEED" | head -c ${payloadSize} >&2; exit 42`,
    ])
      .withEnv({ SEED: seed })
      .run
    assert.equal(exitCodeOf(completion), 42, 'workload must report exit 42')
    assertBytes('J6 stderr', completion.stderr, yesOutput(seed, payloadSize))
    assert.equal(completion.stdout.length, 0, 'stderr payload must not reach stdout')
  }),
)

const j7 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J7: one-shot host resource, replay cannot reproduce the token')
    const body = `${randomToken()}\n`
    const listener = yield* openListener((_request, response, server) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end(body, () => {
        server.close()
      })
    })
    const first = yield* MicroVM.job('alpine:3.20', ['wget', '-T', '5', '-qO-', listener.url])
      .withHostAccess(true)
      .run
    assert.equal(exitCodeOf(first), 0, 'opted-in job must fetch the one-shot body')
    assertBytes('J7 one-shot body', first.stdout, Buffer.from(body))
    const replay = yield* MicroVM.job('alpine:3.20', ['wget', '-T', '5', '-qO-', listener.url])
      .withHostAccess(true)
      .run
    assertFetchFailed('J7 replay', replay)
    assert.equal(Buffer.from(replay.stdout).includes(body), false, 'replay must not reproduce the token')
  }),
)

const j8 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J8: host-opted fetch equals stdout with exit 0')
    const body = `${randomToken()}\n`
    const listener = yield* openListener((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end(body)
    })
    const completion = yield* MicroVM.job('alpine:3.20', ['wget', '-T', '5', '-qO-', listener.url])
      .withHostAccess(true)
      .run
    assert.equal(exitCodeOf(completion), 0, 'host-opted fetch must exit 0')
    assertBytes('J8 host body', completion.stdout, Buffer.from(body))
    assert.ok((yield* Ref.get(listener.requests)) >= 1, 'guest must reach the host listener')
  }),
)

const j9 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J9: identical argv without opt-in stays off the host')
    const body = `${randomToken()}\n`
    const listener = yield* openListener((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end(body)
    })
    const completion = yield* MicroVM.job('alpine:3.20', ['wget', '-T', '5', '-qO-', listener.url]).run
    assertFetchFailed('J9 denied', completion)
    assert.equal(Buffer.from(completion.stdout).includes(body), false, 'denied guest must not receive the body')
    assert.equal(yield* Ref.get(listener.requests), 0, 'denied guest must not reach the host listener')
  }),
)

const j10 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J10: withWorkdir pins the default workload cwd')
    const completion = yield* MicroVM.job('alpine:3.20', ['pwd']).withWorkdir('/etc').run
    assert.equal(exitCodeOf(completion), 0, 'pwd must exit 0')
    assertBytes('J10 pwd', completion.stdout, Buffer.from('/etc\n'))
  }),
)

const j11 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J11: signal deaths classify as JobSignaled')
    const terminated = yield* MicroVM.job('alpine:3.20', ['sh', '-c', 'kill -TERM $$']).run
    assertSignaled('J11 SIGTERM', terminated)
    const killed = yield* MicroVM.job('alpine:3.20', ['sh', '-c', 'kill -KILL $$']).run
    assertSignaled('J11 SIGKILL', killed)
  }),
)

const j12 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J12: interrupt a host-opted job after its first request')
    const reached = yield* Deferred.make<void>()
    const listener = yield* openListener((_request, response) => {
      response.end('reached\n', () => {
        Effect.runSync(Deferred.succeed(reached, undefined))
      })
    })
    const fiber = yield* Effect.forkChild(
      Effect.scoped(
        MicroVM.job('alpine:3.20', ['sh', '-c', `wget -T 5 -qO- ${listener.url}; sleep 300`])
          .withHostAccess(true)
          .run,
      ),
    )
    yield* Deferred.await(reached)
    yield* Fiber.interrupt(fiber)
    yield* assertNoLeftovers('J12')
  }),
)

const j13 = Effect.gen(function*() {
  yield* Effect.logInfo('[smoke] J13: end of journeys, no sandbox left behind')
  yield* assertNoLeftovers('J13')
})

const main = Effect.gen(
  function*() {
    const j1Name = yield* j1
    assert.ok(yield* recordGone(j1Name), 'scope close must destroy the sandbox record')
    const j2Name = yield* j2
    assert.ok(yield* recordGone(j2Name), 'interrupted scope must destroy the sandbox record')
    yield* j3
    yield* j4
    yield* j5
    yield* j6
    yield* j7
    yield* j8
    yield* j9
    yield* j10
    yield* j11
    yield* j12
    yield* j13
    yield* Effect.logInfo('[smoke] all journeys green')
  },
)

NodeRuntime.runMain(Effect.provide(main, nodeServicesLayer))
