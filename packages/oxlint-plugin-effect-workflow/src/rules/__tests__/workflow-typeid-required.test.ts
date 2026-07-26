import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowTypeidRequired } from '../workflow-typeid-required.js'

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

const withTypeId = `
const MyTypeId: unique symbol = Symbol('@systemfsoftware/pkg/My')
type MyTypeId = typeof MyTypeId
class My extends S.TaggedClass<My>()('My', {}) {
  readonly [MyTypeId] = MyTypeId
}
`

const withTypeIdErr = `
const MyErrTypeId: unique symbol = Symbol('@systemfsoftware/pkg/MyErr')
type MyErrTypeId = typeof MyErrTypeId
class MyErr extends S.TaggedError<MyErr>()('MyErr', {}) {
  readonly [MyErrTypeId] = MyErrTypeId
}
`

ruleTester.run('workflow-typeid-required', workflowTypeidRequired, {
  valid: [
    {
      code: withTypeId,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: withTypeIdErr,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class Plain {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends S.TaggedClass<My>()('My', {}) {}`,
      filename: 'process-claim.executor.ts',
    },
    {
      code: `const x = 1`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends Other.Base {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends S.Schema {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends X.TaggedClass<My>()('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends NS.S.TaggedClass<My>()('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends S.Foo<My>()('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends buildBase()('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends X.TaggedError('MyErr', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends S.Foo('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends S['TaggedClass']()('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends S['TaggedError']('MyErr', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      code: `class My extends (function() {})() {}`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      code: `class My extends S.TaggedClass<My>()('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }],
    },
    {
      code: `class MyErr extends S.TaggedError<MyErr>()('MyErr', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }],
    },
    {
      code: `class A extends S.TaggedClass<A>()('A', {}) {} class B extends S.TaggedClass<B>()('B', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }, { messageId: 'missingTypeId' }],
    },
    {
      code: `class My extends S.TaggedClass<My>()('My', {}) { readonly foo = 1 }`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }],
    },
    {
      code: `class My extends S.TaggedClass<My>()('My', {}) { readonly [123] = 1 }`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }],
    },
    {
      code: `class My extends S.TaggedError('MyErr', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }],
    },
    {
      code: `class My extends S.TaggedClass('My', {}) {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'missingTypeId' }],
    },
  ],
})
