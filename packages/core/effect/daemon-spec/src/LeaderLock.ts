/** @public */
export const isModeNone = <L extends { readonly mode: string }>(
  lock: L,
): lock is Extract<L, { readonly mode: 'none' }> => lock.mode === 'none'

/** The only mode `isModeNone` admits. */
const NONE_MODE = 'none'

if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { FastCheck: fc } = await import('effect/testing')

  describe('isModeNone', () => {
    it.prop(
      '∀m_IsModeNone_=ModeIsNone',
      [fc.oneof(fc.constant('none'), fc.string())],
      ([mode]) => isModeNone({ mode }) === (mode === NONE_MODE),
    )
  })
}
