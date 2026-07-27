import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoUnconstructedVariant } from '../workflow-no-unconstructed-variant.js'

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

const PRELUDE = `
import * as S from 'effect/Schema'
const TypeId: unique symbol = Symbol.for('@systemfsoftware/pkg/X')
type TypeId = typeof TypeId
`

const unconstructedData = (name: string) => ({
  name,
  expected: 'every declared variant is constructed somewhere in the file',
  actual: `${name} is declared but never constructed`,
  fix:
    'construct it in a step or decision arm, or delete the variant — a union member nothing produces makes the union lie',
})

ruleTester.run('workflow-no-unconstructed-variant', workflowNoUnconstructedVariant, {
  valid: [
    {
      name: 'allows variant constructed in a decision arm',
      code: `${PRELUDE}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const decide = () => new CancelledNoRefund({})`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'allows error variant constructed in a step',
      code: `${PRELUDE}
class PolicyExpiredError extends S.TaggedError<PolicyExpiredError>()('PolicyExpiredError', {}) {
  readonly [TypeId] = TypeId
}
const check = () => Either.left(new PolicyExpiredError({}))`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows variant constructed via .make',
      code: `${PRELUDE}
class Money extends S.TaggedClass<Money>()('Money', { amount: S.Number }) {
  readonly [TypeId] = TypeId
}
const price = Money.make({ amount: 1 })`,
      filename: 'price-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_CommandIsDeclaredButNeverConstructed',
      code: `${PRELUDE}
class CancelOrderCommand extends S.TaggedClass<CancelOrderCommand>()('CancelOrderCommand', {}) {
  readonly [TypeId] = TypeId
}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const decide = () => new CancelledNoRefund({})`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_CommandIsDeclaredAndAlsoConstructed',
      code: `${PRELUDE}
class CancelOrderCommand extends S.TaggedClass<CancelOrderCommand>()('CancelOrderCommand', {}) {
  readonly [TypeId] = TypeId
}
const echo = () => new CancelOrderCommand({})`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'allows untagged class declarations',
      code: `class PlainService { run() { return 1 } }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'ignores anonymous tagged classes',
      code: `export default class extends S.TaggedClass<any>()('Anon', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows unconstructed variants in schema files',
      code: `${PRELUDE}
class PolicyExpiredError extends S.TaggedError<PolicyExpiredError>()('PolicyExpiredError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.schema.ts',
    },
    {
      name: 'allows variant constructed among unrelated constructions',
      code: `${PRELUDE}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const e = new Error('x')
const d = new CancelledNoRefund({})`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'allows class extending a plain call',
      code: `class Foo extends Bar() {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows class extending a curried plain call',
      code: `class Foo extends Bar()() {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows tagged class under a different namespace',
      code: `class Foo extends X.TaggedClass<T>()('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows computed tagged property access',
      code: `class Foo extends S['TaggedClass']<T>()('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows other S constructors',
      code: `class Foo extends S.Other<T>()('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows direct-call tagged form when constructed',
      code: `class Foo extends S.TaggedClass('Foo', {}) {}\nconst f = new Foo({})`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows direct-call tagged form under a different namespace',
      code: `class Foo extends X.TaggedClass('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows direct-call other S constructor',
      code: `class Foo extends S.Other('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows direct-call computed tagged property access',
      code: `class Foo extends S['TaggedClass']('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'ignores qualified constructions of unrelated classes',
      code: `class Foo extends S.TaggedClass('Foo', {}) {}\nconst f = new Foo({})\nconst e = new ns.Error()`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'flags variant when only unrelated constructions exist',
      code: `${PRELUDE}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const e = new Error('x')
const d = new Date()`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('CancelledNoRefund') }],
    },
    {
      name: 'Should_Report_When_NameContainsCommandButDoesNotEndWithIt',
      code: `${PRELUDE}
class CommandCenter extends S.TaggedClass<CommandCenter>()('CommandCenter', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('CommandCenter') }],
    },
    {
      name: 'flags direct-call tagged class never constructed',
      code: `class Foo extends S.TaggedClass('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('Foo') }],
    },
    {
      name: 'flags direct-call tagged error never constructed',
      code: `class Foo extends S.TaggedError('Foo', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('Foo') }],
    },
    {
      name: 'flags variant when only unrelated method calls exist',
      code: `class Foo extends S.TaggedClass('Foo', {}) {}\nFoo.bar()`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('Foo') }],
    },
    {
      name: 'flags variant when only computed make calls exist',
      code: `class Foo extends S.TaggedClass('Foo', {}) {}\nFoo['make']({})`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('Foo') }],
    },
    {
      name: 'flags variant when only qualified constructions exist',
      code: `${PRELUDE}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const x = new ns.CancelledNoRefund({})`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('CancelledNoRefund') }],
    },
    {
      name: 'flags variant when only qualified make calls exist',
      code: `${PRELUDE}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const x = ns.CancelledNoRefund.make({})`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('CancelledNoRefund') }],
    },
    {
      name: 'flags decision variant never constructed',
      code: `${PRELUDE}
class CancelledWithRefund extends S.TaggedClass<CancelledWithRefund>()('CancelledWithRefund', {}) {
  readonly [TypeId] = TypeId
}
class CancelledNoRefund extends S.TaggedClass<CancelledNoRefund>()('CancelledNoRefund', {}) {
  readonly [TypeId] = TypeId
}
const decide = () => new CancelledNoRefund({})`,
      filename: 'cancel-order.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('CancelledWithRefund') }],
    },
    {
      name: 'flags error variant never constructed',
      code: `${PRELUDE}
class PolicyExpiredError extends S.TaggedError<PolicyExpiredError>()('PolicyExpiredError', {}) {
  readonly [TypeId] = TypeId
}
const check = () => Either.right(void 0)`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'unconstructedVariant', data: unconstructedData('PolicyExpiredError') }],
    },
    {
      name: 'flags each unconstructed variant separately',
      code: `${PRELUDE}
class A extends S.TaggedClass<A>()('A', {}) { readonly [TypeId] = TypeId }
class B extends S.TaggedClass<B>()('B', {}) { readonly [TypeId] = TypeId }`,
      filename: 'decide-access.workflow.ts',
      errors: [
        { messageId: 'unconstructedVariant', data: unconstructedData('A') },
        { messageId: 'unconstructedVariant', data: unconstructedData('B') },
      ],
    },
  ],
})
