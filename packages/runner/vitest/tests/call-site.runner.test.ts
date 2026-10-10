import { it } from '@systemfsoftware/vitest'
import { frameOwner } from '@systemfsoftware/vitest/failure'

const PACKAGE_DIR = '/work/packages/runner/vitest'
const SANDBOX = `${PACKAGE_DIR}/.stryker-tmp/sandbox-x`

it('Should_NameTheLibrary_When_ItsFramesAreSandboxed', function*({ expect }) {
  yield* expect(frameOwner(`${SANDBOX}/src/internal/call-site.ts`)).toEqual('library')
})

it('Should_NameTheAuthor_When_TheFrameIsTheSandboxTestTree', function*({ expect }) {
  yield* expect(frameOwner(`${SANDBOX}/tests/failure-location.runner.test.ts`)).toEqual('user')
})

it('Should_NameTheInstall_When_TheFrameIsVendored', function*({ expect }) {
  yield* expect(frameOwner('/work/node_modules/effect/src/Effect.ts')).toEqual('vendored')
})
