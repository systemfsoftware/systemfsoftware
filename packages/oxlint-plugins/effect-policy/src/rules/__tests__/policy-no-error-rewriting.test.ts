import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { policyNoErrorRewriting } from '../policy-no-error-rewriting.js'

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

ruleTester.run('policy-no-error-rewriting', policyNoErrorRewriting, {
  valid: [
    {
      name: 'Should_Allow_PolicyVocabulary_When_PolicyFile',
      code: `export const withTimeout = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.timeout('5 seconds'))`,
      filename: 'timeout.policy.ts',
    },
    {
      name: 'Should_Allow_TimeoutFailAddingRefusal_When_PolicyFile',
      code:
        `export const withTimeout = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.timeoutFail({ onTimeout: () => new TimeoutExhausted() }, '5 seconds'))`,
      filename: 'timeout.policy.ts',
    },
    {
      name: 'Should_Allow_Retry_When_PolicyFile',
      code: `export const retry = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.retry({ times: 3 }))`,
      filename: 'retry.policy.ts',
    },
    {
      name: 'Should_Allow_TapErrorObservation_When_PolicyFile',
      code:
        `export const counted = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.tapError(() => Effect.sync(() => counter.increment())))`,
      filename: 'circuit-breaker.policy.ts',
    },
    {
      name: 'Should_Allow_ConcurrencyLimiting_When_PolicyFile',
      code: `export const bulkhead = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.withConcurrency(2))`,
      filename: 'bulkhead.policy.ts',
    },
    {
      name: 'Should_Allow_Racing_When_PolicyFile',
      code: `export const race = <A, E, R>(self: Effect<A, E, R>) => Effect.race(self, fallback)`,
      filename: 'race.policy.ts',
    },
    {
      name: 'Should_Allow_NoErrorApis_When_PolicyFile',
      code: `export const identity = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'identity.policy.ts',
    },
    {
      name: 'Should_Allow_AliasedNamespace_When_PolicyFile',
      code:
        `import { Effect as E } from 'effect'; export const f = <A, E2, R>(self: E.Effect<A, E2, R>) => self.pipe(E.mapError(() => new Error()))`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Allow_NonEffectMember_When_PolicyFile',
      code: `export const f = <A, E, R>(self: Effect<A, E, R>) => { Schema.mapError(self); return self }`,
      filename: 'rate-limit.policy.ts',
    },
    {
      name: 'Should_Ignore_MapError_When_ExecutorFile',
      code: `export const run = (eff: Effect<unknown, Error, never>) => eff.pipe(Effect.mapError(toDomainError))`,
      filename: 'order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_MapError_When_PolicyFile',
      code: `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.mapError(toDomainError))`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.mapError',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MapBoth_When_PolicyFile',
      code:
        `export const f = <A, E, R>(self: Effect<A, E, R>) => Effect.mapBoth(self, { onFailure: toDomainError, onSuccess: (a) => a })`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.mapBoth',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_OrElseFail_When_PolicyFile',
      code:
        `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.orElseFail(() => new Error('down')))`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.orElseFail',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_OrElse_When_PolicyFile',
      code: `export const f = <A, E, R>(self: Effect<A, E, R>) => Effect.orElse(self, fallback)`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.orElse',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_OrElseSucceed_When_PolicyFile',
      code: `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.orElseSucceed(() => cached))`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.orElseSucceed',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_CatchAll_When_PolicyFile',
      code: `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.catchAll(() => Effect.succeed(0)))`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.catchAll',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_CatchTag_When_PolicyFile',
      code:
        `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.catchTag('DomainError', () => Effect.succeed(null)))`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.catchTag',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_CatchCause_When_PolicyFile',
      code:
        `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.catchCause((cause) => Effect.fail(new Error(cause.message))))`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.catchCause',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
    {
      name: 'Should_Report_OrDie_When_PolicyFile',
      code: `export const f = <A, E, R>(self: Effect<A, E, R>) => self.pipe(Effect.orDie)`,
      filename: 'rate-limit.policy.ts',
      errors: [
        {
          messageId: 'errorRewriting',
          data: {
            name: 'Effect.orDie',
            expected: "the caller's error channel E unchanged — only Xi refusals may be added",
            actual: 'a call that rewrites, swallows, or removes E',
            fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
          },
        },
      ],
    },
  ],
})
