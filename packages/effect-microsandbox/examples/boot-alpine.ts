import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Deferred, Effect, Fiber } from 'effect'
import { Sandbox } from 'microsandbox'
import assert from 'node:assert'
import { existsSync } from 'node:fs'

const recordGone = (name: string): Effect.Effect<boolean> =>
  Effect.match(
    Effect.tryPromise({ try: () => Sandbox.get(name), catch: () => undefined }),
    { onFailure: () => true, onSuccess: () => false },
  )

const alpine = MicroVM.spec('alpine:3.20').withExposedPorts([8080])
const portless = MicroVM.spec('alpine:3.20')

const j1 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J1: scoped boot, mapped port, record cleanup')
    const spec = alpine.withEnv({ SMOKE_JOURNEY: 'j1' })
    const vm = yield* spec.scoped
    const pinged = yield* vm.ping
    assert.ok(pinged, 'ping must return true')
    const out = yield* vm.exec('echo', ['hello'])
    assert.equal(out.code, 0)
    assert.ok(out.stdout.includes('hello'), 'guest must echo the exec payload')
    const hostPort = yield* vm.port(8080)
    assert.ok(hostPort > 0, 'guest port 8080 must map to a positive host port')
    const url = yield* vm.url(8080, '/ping')
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
      Effect.flatMap(spec.scoped, (vm) => vm.exec('echo', ['first'])),
    )
    assert.equal(first.code, 0)
    assert.ok(first.stdout.includes('first'))
    const second = yield* Effect.scoped(
      Effect.flatMap(spec.scoped, (vm) => vm.exec('echo', ['second'])),
    )
    assert.equal(second.code, 0)
    assert.ok(second.stdout.includes('second'))
  }),
)

const main = Effect.gen(
  function*() {
    if (process.platform === 'linux' && !existsSync('/dev/kvm')) {
      yield* Effect.logInfo('[smoke] no /dev/kvm — skipping (virtualization-required journey)')
      return
    }
    const j1Name = yield* j1
    assert.ok(yield* recordGone(j1Name), 'scope close must destroy the sandbox record')
    const j2Name = yield* j2
    assert.ok(yield* recordGone(j2Name), 'interrupted scope must destroy the sandbox record')
    yield* j3
    yield* Effect.logInfo('[smoke] all journeys green')
  },
)

NodeRuntime.runMain(Effect.provide(main, nodeServicesLayer))
