import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowTypeidSharedPerUnion } from '../workflow-typeid-shared-per-union.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const sharedTypeIdPair = `
const ExitKindTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/ExitKind')
class ExitBlock extends S.TaggedClass<ExitBlock>()('ExitBlock', {}) {
  readonly [ExitKindTypeId] = ExitKindTypeId
}
class ExitOther extends S.TaggedClass<ExitOther>()('ExitOther', {}) {
  readonly [ExitKindTypeId] = ExitKindTypeId
}
const ExitKind = S.Union(ExitBlock, ExitOther)
`

const sharedTypeIdFour = `
const EpochStepTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/EpochStep')
class StopEpoch extends S.TaggedClass<StopEpoch>()('StopEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}
class RestartEpoch extends S.TaggedClass<RestartEpoch>()('RestartEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}
class CooldownEpoch extends S.TaggedClass<CooldownEpoch>()('CooldownEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}
class CleanupEpoch extends S.TaggedClass<CleanupEpoch>()('CleanupEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}
const EpochStep = S.Union(StopEpoch, RestartEpoch, CooldownEpoch, CleanupEpoch)
`

const sharedTypeIdAlias = `
const RefVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/RefVerdict')
class Inject extends S.TaggedClass<Inject>()('Inject', {}) {
  readonly [RefVerdictTypeId] = RefVerdictTypeId
}
class Skip extends S.TaggedClass<Skip>()('Skip', {}) {
  readonly [RefVerdictTypeId] = RefVerdictTypeId
}
type RefVerdict = Inject | Skip
`

const buildExpected = (unionName: string, symbols: string[]) => {
  const sorted = [...symbols].sort().join(', ')
  return {
    name: unionName,
    expected:
      'every variant of one union to carry the union\u2019s single shared TypeId (declared once with Symbol.for)',
    actual: `union ${unionName} carries ${symbols.length} distinct TypeIds across its variants: ${sorted}`,
    fix:
      `declare one shared symbol for the union (const ${unionName}TypeId: unique symbol = Symbol.for('@systemfsoftware/<pkg>/${unionName}')) and put readonly [${unionName}TypeId] = ${unionName}TypeId on every variant`,
  }
}

ruleTester.run('workflow-typeid-shared-per-union', workflowTypeidSharedPerUnion, {
  valid: [
    {
      code: sharedTypeIdPair,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: sharedTypeIdFour,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Allow_BareUnionCall_When_CalleeIsNotSchemaMember',
      code: `
const ATypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/A')
const BTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/B')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [ATypeId] = ATypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [BTypeId] = BTypeId
}
const NotASchemaUnion = Union(A, B)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: sharedTypeIdAlias,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
const X = S.Union(A)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const CompiledGuard = S.Struct({ foo: S.String })
const MaybeCompiledGuard = S.Union(CompiledGuard, S.Literal(null))
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
import { A } from './other.js'
import { B } from './other.js'
const X = S.Union(A, B)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
class A extends S.TaggedClass<A>()('A', {}) {}
class B extends S.TaggedClass<B>()('B', {}) {}
const X = S.Union(A, B)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
type X = A | string
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
type X = A | B
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
const X = S.Union(A, B)
`,
      filename: 'process-claim.executor.ts',
    },
    {
      code: `
const XLikeTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/XLike')
const ATypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/A')
class XLike extends X.TaggedClass<XLike>()('XLike', {}) {
  readonly [XLikeTypeId] = XLikeTypeId
}
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [ATypeId] = ATypeId
}
const X = S.Union(A, XLike)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const ATypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/A')
const BTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/B')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [ATypeId] = ATypeId
}
class B extends S.Other<B>()('B', {}) {
  readonly [BTypeId] = BTypeId
}
const X = S.Union(A, B)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
const X = S.Other(A, B)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
const X = Foo.Union(A, B)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
import { C } from './other.js'
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
const X = S.Union(A, B, C)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
class C extends S.TaggedClass<C>()('C', {}) {}
const X = S.Union(A, B, C)
`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
type X = A | B | (() => string)
`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
const ZTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Z')
const WTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/W')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
class C extends S.TaggedClass<C>()('C', {}) {
  readonly [ZTypeId] = ZTypeId
}
class D extends S.TaggedClass<D>()('D', {}) {
  readonly [WTypeId] = WTypeId
}
const ExitKind = S.Union(A, B, C, D)
`,
      filename: 'process-claim.workflow.ts',
      errors: [
        {
          messageId: 'unionTypeIdMismatch',
          data: buildExpected('ExitKind', ['WTypeId', 'XTypeId', 'YTypeId', 'ZTypeId']),
        },
      ],
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
const ExitKind = S.Union(A, B)
`,
      filename: 'process-claim.workflow.ts',
      errors: [
        {
          messageId: 'unionTypeIdMismatch',
          data: buildExpected('ExitKind', ['XTypeId', 'YTypeId']),
        },
      ],
    },
    {
      code: `
const XTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
const YTypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/Y')
class A extends S.TaggedClass<A>()('A', {}) {
  readonly [XTypeId] = XTypeId
}
class B extends S.TaggedClass<B>()('B', {}) {
  readonly [YTypeId] = YTypeId
}
type DelegationVerdict = A | B
`,
      filename: 'process-claim.workflow.ts',
      errors: [
        {
          messageId: 'unionTypeIdMismatch',
          data: buildExpected('DelegationVerdict', ['XTypeId', 'YTypeId']),
        },
      ],
    },
  ],
})
