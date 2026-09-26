import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const observed = (which: string): string => `${which}-actual`

/**
 * A failure the renderer must refuse: a plain object built with no stack, raised from a body with no step span, so
 * the rendered record names no source location anywhere and breaches R2.
 *
 * The body yields one passing check first, because a body that yields no check is refused as an authoring error
 * before any failure can be rendered.
 */
it('Should_RefuseTheRecord_When_TheFailureNamesNoLocation', function*({ expect }) {
  yield* expect(observed('solo')).toEqual('solo-actual')
  yield* Effect.fail({ missing: 'location' })
})
