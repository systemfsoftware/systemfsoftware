import { KernelCase } from '@systemfsoftware/effect-spec-runtime'
import { Effect, Fiber, Layer, Ref } from 'effect'
import { CorpusDefect } from './failure-corpus/defect-error.js'

const defectFile = 'packages/effect-spec-runtime/tests/__fixtures__/seed-budget.ts'

export const countedRuns = (runs: Ref.Ref<number>): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Ref.update(runs, (count) => count + 1)
    const shelf = yield* Ref.make(0)
    yield* Effect.yieldNow
    yield* Ref.update(shelf, (count) => count + 1)
    yield* Effect.promise(() => Promise.resolve(1))
  })

export const interruptedChildWrite: Effect.Effect<void, CorpusDefect> = Effect.gen(function*() {
  const written = yield* Ref.make(false)
  const child = yield* Effect.forkChild(Effect.andThen(Ref.set(written, true), Effect.never))
  yield* Fiber.interrupt(child)
  if (yield* Ref.get(written)) {
    return yield* new CorpusDefect({ defectFile, detail: 'the child wrote before it was interrupted' })
  }
})

export const lostUpdate: Effect.Effect<void, CorpusDefect> = Effect.gen(function*() {
  const counter = yield* Ref.make(0)
  const bump = Effect.flatMap(Ref.get(counter), (seen) => Ref.set(counter, seen + 1))
  const left = yield* Effect.forkChild(bump)
  const right = yield* Effect.forkChild(bump)
  yield* Fiber.join(left)
  yield* Fiber.join(right)
  const total = yield* Ref.get(counter)
  if (total !== 2) return yield* new CorpusDefect({ defectFile, detail: `lost update: ${total}` })
})

export const exploredRecord = <E>(program: Effect.Effect<void, E>): Promise<string> =>
  KernelCase.explore(KernelCase.caseProgram(program, Layer.empty)).then(() => '', (thrown: Error) => thrown.message)
