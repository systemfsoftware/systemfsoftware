import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Queue, Stream } from 'effect'

export interface OpenSource {
  readonly stream: Stream.Stream<number>
  readonly isOpen: () => boolean
}

export const openSource = (): OpenSource => {
  const opened = new Set<symbol>()
  const stream = Stream.callback<number>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const handle = Symbol('subscription')
        opened.add(handle)
        Queue.offerUnsafe(queue, 1)
        return handle
      }),
      (handle) =>
        Effect.sync(() => {
          opened.delete(handle)
        }),
    )
  )
  return { stream, isOpen: () => opened.size > 0 }
}

export const readingOne = (source: OpenSource): Effect.Effect<void> =>
  Effect.scoped(Stream.runDrain(source.stream.pipe(Stream.take(1))))

const leftOpenWhenStoppedAt = (step: number): Promise<ReadonlyArray<number>> => {
  const source = openSource()
  return Kernel.run(readingOne(source), { interrupt: { atStep: step } }).then(() => source.isOpen() ? [step] : [])
}

export const stepsLeavingTheSourceOpen = (): Promise<ReadonlyArray<number>> =>
  Kernel.run(readingOne(openSource())).then((counted) =>
    Array.from({ length: counted.steps.length }, (_, index) => index + 1).reduce<Promise<ReadonlyArray<number>>>(
      (found, step) => found.then((earlier) => leftOpenWhenStoppedAt(step).then((open) => [...earlier, ...open])),
      Promise.resolve([]),
    )
  )
