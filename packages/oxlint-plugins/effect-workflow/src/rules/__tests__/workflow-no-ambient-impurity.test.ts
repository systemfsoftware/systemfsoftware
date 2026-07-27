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
} from '../workflow-no-ambient-impurity.config.js'
import { workflowNoAmbientImpurity } from '../workflow-no-ambient-impurity.js'

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

ruleTester.run('workflow-no-ambient-impurity', workflowNoAmbientImpurity, {
  valid: [
    {
      name: 'Should_Pass_When_NonWorkflowFileUsesDateNow',
      code: `const now = Date.now()`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFileUsesCryptoRandomUUID',
      code: `const id = crypto.randomUUID()`,
      filename: 'cancel-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFileUsesDateNowAgain',
      code: `const now = Date.now()`,
      filename: 'process-claim.schema.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowHasNoImpurity',
      code: `const x = 1`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowUsesEitherRight',
      code: `const fn = () => Either.right(1)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowCallsLocalRandom',
      code: `const r = random()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowCallsLocalUuid',
      code: `const id = uuid()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MathNowIsNotBanned',
      code: `const t = Math.now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DateRandomIsNotBanned',
      code: `const r = Date.random()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ComputedAccessBreaksTheChain',
      code: `const t = foo['Date'].now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ReceiverIsNotTheBannedObject',
      code: `const t = foo.bar.now()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ComputedPropertyNameIsNotIdentifier',
      code: `const t = Date['now']()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MathFloorUsesInjectedClock',
      code: `const t = Math.floor(command.nowMillis / 1000)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MathMaxIsPure',
      code: `const r = Math.max(a, b)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_UsingInjectedNowMillis',
      code: `const t = command.nowMillis`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ReceiverIsNotDate',
      code: `const t = myDate.parse(s)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DestructuringNonBannedMathMember',
      code: `const { floor } = Math; floor(1.5)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ReadingNonEnvProcessProperty',
      code: `const out = process.stdout`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_VariableDeclaratorHasNoInit',
      code: `let x`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DateIsAssignedButNotDestructured',
      code: `const x = Date`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DateDestructuredViaRestElement',
      code: `const { ...rest } = Date`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DestructuredValueIsNotAnIdentifier',
      code: `const { now: { a } } = Date`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvIsAccessedDynamically',
      code: `const x = process.env[key]`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ConstructingANonDateObject',
      code: `const m = new Map()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MathLogIsNotConsole',
      code: `const r = Math.log(x)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_FetchIsReferencedButNotCalled',
      code: `const f = fetch`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ComputedMemberCallUsesBannedObject',
      code: `const t = Date[now]()`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MiddleSegmentOfChainIsPrivateField',
      code: `class C { #Date = Date; m() { return this.#Date.now() } }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvReadUsesNonProcessObject',
      code: `const secret = notProcess.env.SECRET`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvReadUsesNonEnvProperty',
      code: `const secret = process.notEnv.SECRET`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ProcessEnvSecretIsAccessedDynamically',
      code: `const secret = process.env[key]`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_EnvSecretIsTwoSegmentRead',
      code: `const secret = env.SECRET`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DestructuringNonBannedObject',
      code: `const { foo } = Config`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_WorkflowCallsDateNow',
      code: `const now = Date.now()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsMathRandom',
      code: `const r = Math.random()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsCryptoRandomUUID',
      code: `const id = crypto.randomUUID()`,
      filename: 'cancel-order.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsDateNowAsExpression',
      code: `Date.now()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsMathRandomAsExpression',
      code: `Math.random()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsCryptoRandomUUIDAsExpression',
      code: `crypto.randomUUID()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowConstructsDate',
      code: `const d = new Date()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsGetTimeOnNewDate',
      code: `const t = new Date().getTime()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsPerformanceNow',
      code: `const t = performance.now()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsDateParse',
      code: `const t = Date.parse('x')`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsDateUTC',
      code: `const t = Date.UTC(2024, 0, 1)`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsGlobalThisCryptoRandomUUID',
      code: `const id = globalThis.crypto.randomUUID()`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowDestructuresNowFromDate',
      code: `const { now } = Date`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowDestructuresRandomFromMath',
      code: `const { random } = Math`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsConsoleLog',
      code: `console.log(x)`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowReadsProcessEnvSecret',
      code: `const secret = process.env.SECRET`,
      filename: 'process-claim.workflow.ts',
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
      name: 'Should_Report_When_WorkflowCallsFetch',
      code: `fetch(url)`,
      filename: 'process-claim.workflow.ts',
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
