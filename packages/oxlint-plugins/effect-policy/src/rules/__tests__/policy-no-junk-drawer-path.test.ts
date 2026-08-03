import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { policyNoJunkDrawerPath } from '../policy-no-junk-drawer-path.js'

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

ruleTester.run('policy-no-junk-drawer-path', policyNoJunkDrawerPath, {
  valid: [
    {
      name: 'Should_Pass_When_UnderPoliciesDir_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/policies/rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_UnderCapabilityDir_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/billing/rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_DeepCapabilityPath_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/features/billing/policies/checkout.policy.ts',
    },
    {
      name: 'Should_Pass_When_NoSrcSegment_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'policies/rate-limit.policy.ts',
    },
    {
      name: 'Should_Pass_When_PackageSrcPath_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'packages/foo/src/policies/rate-limit.policy.ts',
    },
    {
      name: 'Should_Ignore_CoreSegment_When_NonPolicyFile',
      code: `export const run = () => {}`,
      filename: 'src/core/order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_CoreSegment_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/core/rate-limit.policy.ts',
      errors: [
        {
          messageId: 'junkDrawerPath',
          data: {
            name: 'core',
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: 'the path segment core',
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        },
      ],
    },
    {
      name: 'Should_Report_UtilsSegment_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/utils/rate-limit.policy.ts',
      errors: [
        {
          messageId: 'junkDrawerPath',
          data: {
            name: 'utils',
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: 'the path segment utils',
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        },
      ],
    },
    {
      name: 'Should_Report_DbMigrations_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/db/migrations/rate-limit.policy.ts',
      errors: [
        {
          messageId: 'junkDrawerPath',
          data: {
            name: 'db',
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: 'the path segment db',
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ComponentsSegment_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/components/rate-limit.policy.ts',
      errors: [
        {
          messageId: 'junkDrawerPath',
          data: {
            name: 'components',
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: 'the path segment components',
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ServicesSegment_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/services/rate-limit.policy.ts',
      errors: [
        {
          messageId: 'junkDrawerPath',
          data: {
            name: 'services',
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: 'the path segment services',
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        },
      ],
    },
    {
      name: 'Should_Report_HelpersSegment_When_PolicyFile',
      code: `export const rateLimit = <A, E, R>(self: Effect<A, E, R>) => self`,
      filename: 'src/helpers/rate-limit.policy.ts',
      errors: [
        {
          messageId: 'junkDrawerPath',
          data: {
            name: 'helpers',
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: 'the path segment helpers',
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        },
      ],
    },
  ],
})
