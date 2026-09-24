import { it } from '@systemfsoftware/vitest'

// @ts-expect-error the runtime, not the compiler, refuses an async test body
it.effect('Should_RefuseTheAsyncBody_When_BodyReturnsAPromise', () => Promise.resolve())
