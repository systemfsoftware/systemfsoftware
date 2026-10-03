import { it } from '@systemfsoftware/vitest'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { expect as registry } from 'vitest'

declare module 'vitest' {
  interface Assertion<R, T> {
    toSettleAs(verdict: T): Promise<R>
  }
}

const settledAs = <A>(received: A, verdict: A) =>
  Promise.resolve().then(() => ({
    pass: received === verdict,
    message: () => `${String(received)} did not settle as ${String(verdict)}`,
  }))

registry.extend({ toSettleAs: settledAs })

it('Should_FailTheRun_When_AnAsyncMatcherRejects', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfRun((checks) => checks.expect('drift').toSettleAs('baseline')))
  yield* expect(record).toMatchObject({ record: expect.stringContaining('drift did not settle as baseline') })
})

it('Should_PassTheRun_When_AnAsyncMatcherResolves', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfRun((checks) => checks.expect('same').toSettleAs('same')))
  yield* expect(record).toEqual(undefined)
})

it.fails('Should_RefuseTheTest_When_AnAsyncMatcherIsWrittenButNeverYielded', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfRun((checks) => checks.expect('same').toSettleAs('same')))
  void expect(record).toSettleAs(undefined)
  yield* expect(record).toEqual(undefined)
})
