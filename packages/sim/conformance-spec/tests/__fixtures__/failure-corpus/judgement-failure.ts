import { Conformance } from '@systemfsoftware/conformance-spec'
import type { RecordedRun } from '@systemfsoftware/vitest/failure'
import { Context, Effect, Layer, Match, Ref } from 'effect'
import { LockCommand, lockModel } from '../lock.model.js'
import type { CorpusFixture } from './record.js'

export const defectFile = 'packages/sim/conformance-spec/tests/__fixtures__/failure-corpus/judgement-failure.ts'

interface LockHandle {
  readonly tryAcquire: (key: string) => Effect.Effect<boolean>
  readonly release: (key: string) => Effect.Effect<void>
}

class Locks extends Context.Service<Locks, LockHandle>()('@systemfsoftware/conformance-spec/tests/corpus/Locks') {}

const twoStepLock: Layer.Layer<Locks> = Layer.effect(
  Locks,
  Effect.gen(function*() {
    const holder = yield* Ref.make<string | undefined>(undefined)
    return {
      tryAcquire: (key: string) =>
        Effect.gen(function*() {
          const current = yield* Ref.get(holder)
          if (current !== undefined) return false
          yield* Ref.set(holder, key)
          return true
        }),
      release: () => Effect.as(Ref.set(holder, undefined), undefined),
    }
  }),
)

const run = (command: LockCommand): Effect.Effect<boolean | void, never, Locks> =>
  Effect.gen(function*() {
    const lock = yield* Locks
    return yield* Match.value(command).pipe(
      Match.tag('TryAcquire', (acquire) => lock.tryAcquire(acquire.key)),
      Match.tag('Release', (letGo) => lock.release(letGo.key)),
      Match.exhaustive,
    )
  })

const specification = {
  commands: LockCommand,
  model: lockModel,
  run,
  fibers: 2,
  operations: 2,
}

export const rejectedReport: Effect.Effect<
  Conformance.Report<LockCommand, boolean | void>,
  Conformance.ModelError
> = Conformance.linearizable(twoStepLock, specification)

const program: RecordedRun<void, Conformance.ModelError> = (checks) =>
  Effect.gen(function*() {
    const report = yield* rejectedReport
    yield* checks.expect(report).toMatchObject({ _tag: 'Pass' })
  })

export const judgementFailure: CorpusFixture<Conformance.ModelError> = {
  name: 'a linearizability judgement failure',
  defectFile,
  raisingFile: defectFile,
  program,
}
