import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowNoPanicVocabulary } from '../workflow-no-panic-vocabulary.js'

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

ruleTester.run('workflow-no-panic-vocabulary', workflowNoPanicVocabulary, {
  valid: [
    {
      name: 'allows domain-named error variant',
      code: `${PRELUDE}
class PolicyExpiredError extends S.TaggedError<PolicyExpiredError>()('PolicyExpiredError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows panic prefix with a domain noun',
      code: `${PRELUDE}
class UnexpectedChargeError extends S.TaggedError<UnexpectedChargeError>()('UnexpectedChargeError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'reconcile-statement.workflow.ts',
    },
    {
      name: 'allows invariant with a domain noun',
      code: `${PRELUDE}
class InvariantChargeMismatchError extends S.TaggedError<InvariantChargeMismatchError>()('InvariantChargeMismatchError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'reconcile-statement.workflow.ts',
    },
    {
      name: 'allows panic vocabulary on decision variants',
      code: `${PRELUDE}
class UnexpectedState extends S.TaggedClass<UnexpectedState>()('UnexpectedState', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows panic vocabulary outside workflow files',
      code: `${PRELUDE}
class UnexpectedStateError extends S.TaggedError<UnexpectedStateError>()('UnexpectedStateError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'allows untagged classes with panic names',
      code: `class UnexpectedHelper { run() { return 1 } }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows panic-named class extending a plain call',
      code: `class UnexpectedError extends Bar() {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows panic-named class extending a curried plain call',
      code: `class UnexpectedError extends Bar()() {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows tagged error under a different namespace',
      code: `class UnexpectedError extends X.TaggedError<T>()('UnexpectedError', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows computed tagged property access',
      code: `class UnexpectedError extends S['TaggedError']<T>()('UnexpectedError', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'allows other S constructors with panic names',
      code: `class UnexpectedError extends S.Other<T>()('UnexpectedError', {}) {}`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'flags UnexpectedStateError',
      code: `${PRELUDE}
class UnexpectedStateError extends S.TaggedError<UnexpectedStateError>()('UnexpectedStateError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'panicVocabulary',
        data: {
          name: 'UnexpectedStateError',
          expected: 'error variants named for expected domain failures a consumer can handle',
          actual:
            'UnexpectedStateError is pure panic vocabulary (Unexpected) — panics are defects at the shell edge, not typed errors in a workflow',
          fix: 'rename it for the domain failure, or delete it and let the invariant surface as a defect',
        },
      }],
    },
    {
      name: 'flags bare UnexpectedError',
      code: `${PRELUDE}
class UnexpectedError extends S.TaggedError<UnexpectedError>()('UnexpectedError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'panicVocabulary',
        data: {
          name: 'UnexpectedError',
          expected: 'error variants named for expected domain failures a consumer can handle',
          actual:
            'UnexpectedError is pure panic vocabulary (Unexpected) — panics are defects at the shell edge, not typed errors in a workflow',
          fix: 'rename it for the domain failure, or delete it and let the invariant surface as a defect',
        },
      }],
    },
    {
      name: 'flags InvariantViolationError',
      code: `${PRELUDE}
class InvariantViolationError extends S.TaggedError<InvariantViolationError>()('InvariantViolationError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'panicVocabulary',
        data: {
          name: 'InvariantViolationError',
          expected: 'error variants named for expected domain failures a consumer can handle',
          actual:
            'InvariantViolationError is pure panic vocabulary (Invariant) — panics are defects at the shell edge, not typed errors in a workflow',
          fix: 'rename it for the domain failure, or delete it and let the invariant surface as a defect',
        },
      }],
    },
    {
      name: 'flags ImpossibleCaseError',
      code: `${PRELUDE}
class ImpossibleCaseError extends S.TaggedError<ImpossibleCaseError>()('ImpossibleCaseError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'decide-access.workflow.ts',
      errors: [{
        messageId: 'panicVocabulary',
        data: {
          name: 'ImpossibleCaseError',
          expected: 'error variants named for expected domain failures a consumer can handle',
          actual:
            'ImpossibleCaseError is pure panic vocabulary (Impossible) — panics are defects at the shell edge, not typed errors in a workflow',
          fix: 'rename it for the domain failure, or delete it and let the invariant surface as a defect',
        },
      }],
    },
    {
      name: 'flags UnreachableError',
      code: `${PRELUDE}
class UnreachableError extends S.TaggedError<UnreachableError>()('UnreachableError', {}) {
  readonly [TypeId] = TypeId
}`,
      filename: 'decide-access.workflow.ts',
      errors: [{
        messageId: 'panicVocabulary',
        data: {
          name: 'UnreachableError',
          expected: 'error variants named for expected domain failures a consumer can handle',
          actual:
            'UnreachableError is pure panic vocabulary (Unreachable) — panics are defects at the shell edge, not typed errors in a workflow',
          fix: 'rename it for the domain failure, or delete it and let the invariant surface as a defect',
        },
      }],
    },
  ],
})
