import { providedWorkspaceRoot } from '@systemfsoftware/vitest/failure'
import { Effect, Fiber, Option, Ref } from 'effect'
import { fileURLToPath } from 'node:url'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const thisFile = fileURLToPath(import.meta.url)

const defectFileAsRecordPrints = Option.match(Option.fromNullishOr(providedWorkspaceRoot()), {
  onNone: () => thisFile,
  onSome: (workspaceRoot) => thisFile.replace(`${workspaceRoot}/`, ''),
})

const defectFile = defectFileAsRecordPrints

const TOP_CLERK = 'the second clerk'

const shelveBoth = Effect.gen(function*() {
  const last = yield* Ref.make('nobody')
  const shelve = (clerk: string) =>
    Effect.gen(function*() {
      yield* Effect.yieldNow
      yield* Ref.set(last, clerk)
    })
  const first = yield* Effect.forkChild(shelve('the first clerk'))
  const second = yield* Effect.forkChild(shelve(TOP_CLERK))
  yield* Fiber.join(first)
  yield* Fiber.join(second)
  return yield* Ref.get(last)
})

const program = Effect.flatMap(shelveBoth, (top) =>
  top === TOP_CLERK
    ? Effect.void
    : Effect.fail(new CorpusDefect({ defectFile, detail: `the shelf kept ${top} on top` })))

export const seededSchedule: CorpusFixture = {
  name: 'a failure that occurs only under one seeded schedule',
  defectFile,
  raisingFile: defectFile,
  program,
}
