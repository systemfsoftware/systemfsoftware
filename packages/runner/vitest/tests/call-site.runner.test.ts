/**
 * Regression for the frame-owner decision (KTD4, C1a): a spec library copied into a Stryker sandbox still owns the
 * frames under its own `src`, so its failures lead with the author's line instead of the library's own call site.
 */
import { it } from '@systemfsoftware/vitest'
import { frameOwner } from '@systemfsoftware/vitest/failure'

const SANDBOX_ROOT = '/work/packages/runner/vitest/.stryker-tmp/sandbox-x'

it('Should_NameTheLibrary_When_ItsFramesAreSandboxed', function*({ expect }) {
  yield* expect(frameOwner([SANDBOX_ROOT])(`${SANDBOX_ROOT}/src/internal/call-site.ts`)).toEqual('library')
})

it('Should_NameTheAuthor_When_TheFrameIsTheSandboxTestTree', function*({ expect }) {
  yield* expect(frameOwner([SANDBOX_ROOT])(`${SANDBOX_ROOT}/tests/failure-location.runner.test.ts`)).toEqual('user')
})

it('Should_NameTheInstall_When_TheFrameIsVendored', function*({ expect }) {
  yield* expect(frameOwner([SANDBOX_ROOT])('/work/node_modules/effect/src/Effect.ts')).toEqual('vendored')
})
