import { layer as microVMLayer, MicroVM, MicroVMSpec } from '@systemfsoftware/effect-microsandbox'
import type { MicroVMError } from '@systemfsoftware/effect-microsandbox'
import { Context, Deferred, Effect, Fiber, HashMap, Layer, Option, Schema } from 'effect'
import { Sandbox } from 'microsandbox'
import assert from 'node:assert'
import { existsSync } from 'node:fs'

const recordGone = (name: string): Effect.Effect<boolean> =>
  Effect.promise(() =>
    Sandbox.get(name).then(
      () => false,
      () => true,
    )
  )

const alpineSpec = Schema.decodeEffect(MicroVMSpec)({
  image: 'alpine:3.20',
  env: {},
  ports: [8080],
  mounts: [],
})

const portlessSpec = Schema.decodeEffect(MicroVMSpec)({
  image: 'alpine:3.20',
  env: {},
  ports: [],
  mounts: [],
})

// J1 — scoped boot: exec round-trip, loopback port mapping, record cleanup.
const j1 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J1: scoped boot, exec, mapped port, record cleanup')
    const spec = yield* alpineSpec
    const svc = yield* MicroVM
    const vm = yield* svc.start(spec)
    const out = yield* vm.exec('echo', ['hello'])
    assert.equal(out.code, 0)
    assert.ok(out.stdout.includes('hello'), 'guest must echo the exec payload')
    const hostPort = HashMap.get(vm.mappedPorts, 8080)
    assert.ok(
      Option.isSome(hostPort) && hostPort.value > 0,
      'guest port 8080 must map to a positive host port',
    )
    return vm.name
  }).pipe(Effect.provide(microVMLayer)),
)

// J2 — interrupt: a Deferred signals boot completion; interrupting the fiber
// returns only after the release finalizer finished, and the record is gone.
const j2 = Effect.gen(function*() {
  yield* Effect.logInfo('[smoke] J2: interrupting booted VM, awaiting finalizer')
  const spec = yield* portlessSpec
  const booted = yield* Deferred.make<string>()
  const fiber = yield* Effect.forkChild(
    Effect.scoped(
      Effect.gen(function*() {
        const svc = yield* MicroVM
        const vm = yield* svc.start(spec)
        yield* Deferred.succeed(booted, vm.name)
        return yield* Effect.never
      }).pipe(Effect.provide(microVMLayer)),
    ),
  )
  const name = yield* Deferred.await(booted)
  yield* Fiber.interrupt(fiber)
  return name
})

// J3 — Layer reuse: one layer build serves two sequential VM lifecycles.
const j3 = Effect.scoped(
  Effect.gen(function*() {
    yield* Effect.logInfo('[smoke] J3: one layer build, two sequential VM lifecycles')
    const spec = yield* alpineSpec
    const context = yield* Layer.build(microVMLayer)
    const svc = Context.get(context, MicroVM)
    const first = yield* Effect.scoped(
      Effect.flatMap(svc.start(spec), (vm) => vm.exec('echo', ['first'])),
    )
    assert.equal(first.code, 0)
    assert.ok(first.stdout.includes('first'))
    const second = yield* Effect.scoped(
      Effect.flatMap(svc.start(spec), (vm) => vm.exec('echo', ['second'])),
    )
    assert.equal(second.code, 0)
    assert.ok(second.stdout.includes('second'))
  }),
)

const main: Effect.Effect<void, MicroVMError | Schema.SchemaError> = Effect.gen(function*() {
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
})

void Effect.runPromise(main)
