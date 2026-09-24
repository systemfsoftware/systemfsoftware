import { describe, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const evidence = join(tmpdir(), 'vitest-conformance-finally.evidence.txt')

const observed = (): number => 1

const record = (event: string): void => {
  appendFileSync(evidence, `${event}\n`)
}

const Release = Layer.effectDiscard(Effect.addFinalizer(() =>
  Effect.sync(() => {
    record('release')
  })
))

describe('a failing check', () => {
  layer(Release)((it) => {
    it('Should_RunFinallyAndTheFinalizer_When_TheCheckFails', function*({ expect }) {
      try {
        yield* expect(observed()).toEqual(2)
        yield* Effect.sync(() => {
          record('after the check')
        })
      } finally {
        record('finally')
      }
    })
  })
})
