import {
  EFFECT_PREDICATE_ACTUAL,
  EFFECT_PREDICATE_EXPECTED,
  EFFECT_PREDICATE_FIX,
  EFFECT_PREDICATE_NAME,
} from '../no-effect-in-sync-prop.config.js'
import { noEffectInSyncProp } from '../no-effect-in-sync-prop.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FILENAME = '/repo/pkg/src/widget.property.test.ts'

const effectInSyncProp = {
  messageId: 'effectInSyncProp',
  data: {
    name: EFFECT_PREDICATE_NAME,
    expected: EFFECT_PREDICATE_EXPECTED,
    actual: EFFECT_PREDICATE_ACTUAL,
    fix: EFFECT_PREDICATE_FIX,
  },
} as const

ruleTester.run('no-effect-in-sync-prop', noEffectInSyncProp, {
  valid: [
    {
      name: 'Should_Allow_EffectProp_When_PredicateReturnsEffectGen',
      code:
        `it.effect.prop('∀reason_AnnounceLive_=Labelled', [Schema.String], ([reason]) => Effect.gen(function*() { return reason !== '' }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_EffectProp_When_BlockBodyReturnsEffectGen',
      code:
        `it.effect.prop('∀reason_X_=x', [Schema.String], ([reason]) => { return Effect.gen(function*() { return reason === reason }) })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_SyncProp_When_PredicateReturnsBooleanExpression',
      code: `it.prop('Holds_ForOne', [helper(1)], ([v]) => v === 1)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_SyncProp_When_PredicateCallsLocalNonEffectFunction',
      code:
        `it.prop('∀row_Replay_=TheDrawnSeed', [ReplayRow], ([row]) => matchesDraw(replayOf(row.seed), row.seed, String(row.path)))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_SyncProp_When_BlockBodyReturnsBoolean',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => { const doubled = n * 2; return doubled === doubled })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_EffectPropRoot_When_TestAliasPredicateReturnsEffect',
      code: `test.effect.prop('∀v_X_=x', [arb], ([v]) => Effect.gen(function*() { return v !== null }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_SyncProp_When_PipeChainRootedInNonEffectCall',
      code: `it.prop('∀samples_X_=x', [gen], ([samples]) => samples.pipe(widen))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_SyncProp_When_PropModifierPredicateReturnsBoolean',
      code: `it.prop.only('Holds_ForOne', [], () => true)
it.prop.skip('Skipped_Prop', [], () => true)`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_SyncProp_When_NestedArrowReturnsEffectButPredicateDoesNot',
      code:
        `it.prop('∀x_X_=x', [arb], ([x]) => { const f = () => Effect.gen(function*() { return x === x }); return f !== null })`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_Prop_When_RootIsNeitherItNorTest',
      code: `suite.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { return x === x }))`,
      filename: FILENAME,
    },
    {
      name: 'Should_Allow_EffectProp_When_InSourceDynamicImportPredicateReturnsEffect',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.effect.prop('∀id_HexId_∘Base64RoundTrip', [Schema.BigInt], ([id]) =>
    Effect.gen(function*() {
      const wire = yield* encodeId(id)
      return wire !== ''
    }),
  )
}
`,
      filename: '/repo/pkg/src/widget.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_SyncPropExpressionBodyReturnsEffectGen',
      code: `it.prop('∀reason_X_=x', [Schema.String], ([reason]) => Effect.gen(function*() { return reason !== '' }))`,
      filename: FILENAME,
      errors: [effectInSyncProp],
    },
    {
      name: 'Should_Report_When_SyncPropBlockBodyReturnsEffectGen',
      code:
        `it.prop('∀reason_X_=x', [Schema.String], ([reason]) => { return Effect.gen(function*() { return reason === reason }) })`,
      filename: FILENAME,
      errors: [{ messageId: 'effectInSyncProp' }],
    },
    {
      name: 'Should_Report_When_SyncPropExpressionBodyReturnsEffectMemberCall',
      code: `it.prop('∀v_X_=x', [arb], ([v]) => Effect.map(run(v), (out) => out !== null))`,
      filename: FILENAME,
      errors: [{ messageId: 'effectInSyncProp' }],
    },
    {
      name: 'Should_Report_When_SyncPropExpressionBodyReturnsPipeChainRootedInEffectCall',
      code: `it.prop('∀v_X_=x', [arb], ([v]) => Effect.scoped(run(v)).pipe(Effect.provideService(Probe, v)))`,
      filename: FILENAME,
      errors: [{ messageId: 'effectInSyncProp' }],
    },
    {
      name: 'Should_Report_When_TestAliasSyncPropReturnsEffectGen',
      code: `test.prop('∀v_X_=x', [arb], ([v]) => Effect.gen(function*() { return v !== null }))`,
      filename: FILENAME,
      errors: [{ messageId: 'effectInSyncProp' }],
    },
    {
      name: 'Should_Report_When_SyncPropModifierReturnsEffectGen',
      code: `it.prop.only('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { return x === x }))`,
      filename: FILENAME,
      errors: [{ messageId: 'effectInSyncProp' }],
    },
    {
      name: 'Should_Report_When_NestedReturnInsideIfReturnsEffectGen',
      code:
        `it.prop('∀x_X_=x', [arb], ([x]) => { if (x) { return Effect.gen(function*() { return x === x }) } return false })`,
      filename: FILENAME,
      errors: [{ messageId: 'effectInSyncProp' }],
    },
    {
      name: 'Should_Report_When_SyncPropInSourceDynamicImportReturnsEffectGen',
      code: `
if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  it.prop('∀id_HexId_∘Base64RoundTrip', [Schema.BigInt], ([id]) =>
    Effect.gen(function*() {
      const wire = yield* encodeId(id)
      return wire !== ''
    }),
  )
}
`,
      filename: '/repo/pkg/src/widget.ts',
      errors: [{ messageId: 'effectInSyncProp' }],
    },
  ],
})
