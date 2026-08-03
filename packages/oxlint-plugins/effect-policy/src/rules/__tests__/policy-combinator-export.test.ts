import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { policyCombinatorExport } from '../policy-combinator-export.js'

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

const data = {
  name: '*.policy.ts',
  expected: 'a rank-2 combinator export: <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | Xi, R>',
  actual: '0 rank-2 combinator exports',
  fix:
    'export the combinator — a generic function whose first parameter is Effect-typed, or a value annotated with a *Policy type',
}

ruleTester.run('policy-combinator-export', policyCombinatorExport, {
  valid: [
    {
      name: 'Should_Pass_When_GenericArrowCombinator_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_FunctionDeclarationCombinator_When_PolicyFile',
      code:
        `export function withTimeout<A, E, R>(self: Effect<A, E, R>): Effect<A, E | TimeoutExhausted, R> { return self }`,
      filename: 'timeout.policy.ts',
    },
    {
      name: 'Should_Pass_When_QualifiedEffectAnnotation_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect.Effect<A, E, R>) => self`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_PolicyAnnotatedConst_When_PolicyFile',
      code: `export const identity: Policy<never> = (self) => self`,
      filename: 'identity.policy.ts',
    },
    {
      name: 'Should_Pass_When_CustomPolicyNamedConst_When_PolicyFile',
      code: `export const retry: RetryPolicy<RetryExhausted> = (self) => self`,
      filename: 'retry.policy.ts',
    },
    {
      name: 'Should_Pass_When_QualifiedPolicyAnnotatedConst_When_PolicyFile',
      code: `export const limiter: Resilience.Policy<never> = (self) => self`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_DefaultArrowCombinator_When_PolicyFile',
      code: `export default <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_DefaultFunctionDeclarationCombinator_When_PolicyFile',
      code: `export default function bulkhead<A, E, R>(self: Effect<A, E, R>) { return self }`,
      filename: 'bulkhead.policy.ts',
    },
    {
      name: 'Should_Pass_When_SpecifierExportOfLocalFunction_When_PolicyFile',
      code: `function locked<A, E, R>(self: Effect<A, E, R>) { return self }; export { locked }`,
      filename: 'keyed-mutex.policy.ts',
    },
    {
      name: 'Should_Pass_When_SpecifierExportOfAnnotatedConst_When_PolicyFile',
      code: `const limiter: Policy<never> = (self) => self; export { limiter }`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_DefaultIdentifierOfAnnotatedConst_When_PolicyFile',
      code: `const identity: Policy<never> = (self) => self; export default identity`,
      filename: 'identity.policy.ts',
    },
    {
      name: 'Should_Pass_When_XiErrorClassAccompaniesCombinator_When_PolicyFile',
      code:
        `export class TimeoutExhausted extends S.TaggedError<TimeoutExhausted>()('TimeoutExhausted', {}) {} export const withTimeout = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'timeout.policy.ts',
    },
    {
      name: 'Should_Pass_When_TypeAliasAccompaniesCombinator_When_PolicyFile',
      code:
        `export type Xi = TimeoutExhausted | CircuitOpen; export const withTimeout = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'timeout.policy.ts',
    },
    {
      name: 'Should_Ignore_JunkExports_When_NonPolicyFile',
      code: `export const a = 1; export function b() {}`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Ignore_ZeroExports_When_NonPolicyFile',
      code: `const x = 1`,
      filename: 'order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NoCombinator_When_NoExports',
      code: `const x = 1`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_OnlyXiErrorClass',
      code: `export class TimeoutExhausted extends S.TaggedError<TimeoutExhausted>()('TimeoutExhausted', {}) {}`,
      filename: 'timeout.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_OnlyTypeAlias',
      code: `export type Xi = TimeoutExhausted | CircuitOpen`,
      filename: 'timeout.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_NonGenericEffectFunction',
      code: `export const f = (self: Effect<number, Error, never>) => self`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_FirstParamNotEffect',
      code: `export const f = <A, E, R>(self: number) => self`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_UntypedArrow',
      code: `export const f = (self) => self`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_NonPolicyAnnotation',
      code: `export const f: SomeInterface = (self) => self`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_DefaultNonFunction',
      code: `export default 42`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_DefaultIdentifierOfUntypedConst',
      code: `const f = (self) => self; export default f`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
    {
      name: 'Should_Report_NoCombinator_When_SpecifierOfUntypedConst',
      code: `const f = (self) => self; export { f }`,
      filename: 'rate-limit.policy.ts',
      errors: [{ messageId: 'noCombinator', data }],
    },
  ],
})
