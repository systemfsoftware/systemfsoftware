import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  CONSOLE_EXPECTED,
  CONSOLE_FIX,
  DATE_CONSTRUCTION_EXPECTED,
  DATE_CONSTRUCTION_FIX,
  DESTRUCTURE_EXPECTED,
  DESTRUCTURE_FIX,
  FORBIDDEN_EXPECTED,
  FORBIDDEN_FIX,
  PROCESS_ENV_EXPECTED,
  PROCESS_ENV_FIX,
} from '../kernel-no-ambient-impurity.config.js'
import { kernelNoAmbientImpurity } from '../kernel-no-ambient-impurity.js'

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

ruleTester.run('kernel-no-ambient-impurity', kernelNoAmbientImpurity, {
  valid: [
    {
      name: 'Should_Pass_When_NonKernelFileUsesDateNow',
      code: `const now = Date.now()`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonKernelFileUsesCryptoRandomUUID',
      code: `const id = crypto.randomUUID()`,
      filename: 'cancel-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonKernelFileUsesDateNowAgain',
      code: `const now = Date.now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_KernelHasNoImpurity',
      code: `const x = 1`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelReturnsEitherRight',
      code: `const fn = () => Either.right(1)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelCallsLocalRandom',
      code: `const r = random()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelCallsLocalUuid',
      code: `const id = uuid()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_MathNowIsNotBanned',
      code: `const t = Math.now()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DateRandomIsNotBanned',
      code: `const r = Date.random()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ComputedAccessBreaksTheChain',
      code: `const t = foo['Date'].now()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ReceiverIsNotTheBannedObject',
      code: `const t = foo.bar.now()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ComputedPropertyNameIsNotIdentifier',
      code: `const t = Date['now']()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_MathFloorUsesInjectedTime',
      code: `const t = Math.floor(input.nowMillis / 1000)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_MathMaxIsPure',
      code: `const r = Math.max(a, b)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_UsingInjectedNowMillis',
      code: `const t = input.nowMillis`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ReceiverIsNotDate',
      code: `const t = myDate.parse(s)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DestructuringNonBannedMathMember',
      code: `const { floor } = Math; floor(1.5)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ReadingNonEnvProcessProperty',
      code: `const out = process.stdout`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_VariableDeclaratorHasNoInit',
      code: `let x`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DateIsAssignedButNotDestructured',
      code: `const x = Date`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DateDestructuredViaRestElement',
      code: `const { ...rest } = Date`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DestructuredValueIsNotAnIdentifier',
      code: `const { now: { a } } = Date`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvIsAccessedDynamically',
      code: `const x = process.env[key]`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ConstructingANonDateObject',
      code: `const m = new Map()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_MathLogIsNotConsole',
      code: `const r = Math.log(x)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_FetchIsReferencedButNotCalled',
      code: `const f = fetch`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ComputedMemberCallUsesBannedObject',
      code: `const t = Date[now]()`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_MiddleSegmentOfChainIsPrivateField',
      code: `class C { #Date = Date; m() { return this.#Date.now() } }`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvReadUsesNonProcessObject',
      code: `const secret = notProcess.env.SECRET`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvReadUsesNonEnvProperty',
      code: `const secret = process.notEnv.SECRET`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvSecretIsAccessedDynamically',
      code: `const secret = process.env[key]`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_EnvSecretIsTwoSegmentRead',
      code: `const secret = env.SECRET`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DestructuringNonBannedObject',
      code: `const { foo } = Config`,
      filename: 'fold.kernel.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_KernelCallsDateNow',
      code: `const now = Date.now()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'Date.now',
          expected: FORBIDDEN_EXPECTED,
          actual: 'Date.now()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsMathRandom',
      code: `const r = Math.random()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'Math.random',
          expected: FORBIDDEN_EXPECTED,
          actual: 'Math.random()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsCryptoRandomUUID',
      code: `const id = crypto.randomUUID()`,
      filename: 'format.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'crypto.randomUUID',
          expected: FORBIDDEN_EXPECTED,
          actual: 'crypto.randomUUID()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsDateNowAsExpression',
      code: `Date.now()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'Date.now',
          expected: FORBIDDEN_EXPECTED,
          actual: 'Date.now()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsMathRandomAsExpression',
      code: `Math.random()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'Math.random',
          expected: FORBIDDEN_EXPECTED,
          actual: 'Math.random()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsCryptoRandomUUIDAsExpression',
      code: `crypto.randomUUID()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'crypto.randomUUID',
          expected: FORBIDDEN_EXPECTED,
          actual: 'crypto.randomUUID()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelConstructsDate',
      code: `const d = new Date()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbiddenConstruction',
        data: {
          name: 'new Date()',
          expected: DATE_CONSTRUCTION_EXPECTED,
          actual: 'new Date() construction',
          fix: DATE_CONSTRUCTION_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsGetTimeOnNewDate',
      code: `const t = new Date().getTime()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbiddenConstruction',
        data: {
          name: 'new Date()',
          expected: DATE_CONSTRUCTION_EXPECTED,
          actual: 'new Date() construction',
          fix: DATE_CONSTRUCTION_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsPerformanceNow',
      code: `const t = performance.now()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'performance.now',
          expected: FORBIDDEN_EXPECTED,
          actual: 'performance.now()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsDateParse',
      code: `const t = Date.parse('x')`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'Date.parse',
          expected: FORBIDDEN_EXPECTED,
          actual: 'Date.parse()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsDateUTC',
      code: `const t = Date.UTC(2024, 0, 1)`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'Date.UTC',
          expected: FORBIDDEN_EXPECTED,
          actual: 'Date.UTC()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsGlobalThisCryptoRandomUUID',
      code: `const id = globalThis.crypto.randomUUID()`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'crypto.randomUUID',
          expected: FORBIDDEN_EXPECTED,
          actual: 'crypto.randomUUID()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelDestructuresNowFromDate',
      code: `const { now } = Date`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbiddenDestructure',
        data: {
          name: 'Date.now',
          expected: DESTRUCTURE_EXPECTED,
          actual: 'destructuring now from Date',
          fix: DESTRUCTURE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelDestructuresRandomFromMath',
      code: `const { random } = Math`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbiddenDestructure',
        data: {
          name: 'Math.random',
          expected: DESTRUCTURE_EXPECTED,
          actual: 'destructuring random from Math',
          fix: DESTRUCTURE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsConsoleLog',
      code: `console.log(x)`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'console.log',
          expected: CONSOLE_EXPECTED,
          actual: 'console.log()',
          fix: CONSOLE_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelReadsProcessEnvSecret',
      code: `const secret = process.env.SECRET`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbiddenMember',
        data: {
          name: 'process.env',
          expected: PROCESS_ENV_EXPECTED,
          actual: 'process.env.SECRET read',
          fix: PROCESS_ENV_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_KernelCallsFetch',
      code: `fetch(url)`,
      filename: 'fold.kernel.ts',
      errors: [{
        messageId: 'forbidden',
        data: {
          name: 'fetch',
          expected: FORBIDDEN_EXPECTED,
          actual: 'fetch()',
          fix: FORBIDDEN_FIX,
        },
      }],
    },
  ],
})
