import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  globalCallVerdict,
  newDateVerdict,
  TIME_SOURCE_EXPECTED,
  TIME_SOURCE_FIX,
  timersImportVerdict,
} from '../no-unported-time-source.config.js'
import { noUnportedTimeSource } from '../no-unported-time-source.js'

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

const PROD = 'src/feature.ts'

const HOST_TIMER_PORT = 'packages/atom/effect-atom/src/internal/HostTimer.ts'
const RECURSION_LAWS_PORT = 'packages/schema/effect-schema-law/src/recursion-laws.ts'
const STIMULUS_PORT = 'packages/trace/trace-spec/src/Stimulus.ts'

const verdictError = (verdict: { readonly name: string; readonly actual: string }) => ({
  messageId: 'unportedTimeSource' as const,
  data: {
    ...verdict,
    expected: TIME_SOURCE_EXPECTED,
    fix: TIME_SOURCE_FIX,
  },
})

const globalCallError = (api: string) => verdictError(globalCallVerdict(api))

const newDateError = () => verdictError(newDateVerdict())

const timersImportError = (source: string) => verdictError(timersImportVerdict(source))

ruleTester.run('no-unported-time-source', noUnportedTimeSource, {
  valid: [
    {
      name: 'Should_Pass_When_QueueMicrotaskIsCalled',
      code: 'queueMicrotask(() => {})',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_NewDateCarriesAnArgument',
      code: 'new Date(0)',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_NewDateCarriesSpreadArguments',
      code: 'const parts: number[] = []\nnew Date(...parts)',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_TheTimeSourceIsInATestFile',
      code: 'setTimeout(() => {}, 0)',
      filename: 'src/feature.test.ts',
    },
    {
      name: 'Should_Pass_When_TheTimeSourceIsInASpecFile',
      code: 'Date.now()',
      filename: 'src/feature.spec.ts',
    },
    {
      name: 'Should_Pass_When_TheTimeSourceIsInAColocatedTestsDirectory',
      code: 'Math.random()',
      filename: '/repo/pkg/src/__tests__/helper.ts',
    },
    {
      name: 'Should_Pass_When_TheTimeSourceIsInAFixture',
      code: 'performance.now()',
      filename: '/repo/pkg/src/__fixtures__/clock.ts',
    },
    {
      name: 'Should_Pass_When_TheFileIsARegisteredPort',
      code: 'setTimeout(() => {}, 0)',
      filename: `/repo/${HOST_TIMER_PORT}`,
      options: [{ ports: [HOST_TIMER_PORT] }],
    },
    {
      name: 'Should_Pass_When_TheFileIsTheRegisteredPortWithNoPathPrefix',
      code: 'Date.now()',
      filename: RECURSION_LAWS_PORT,
      options: [{ ports: [RECURSION_LAWS_PORT] }],
    },
    {
      name: 'Should_Pass_When_CryptoGetRandomValuesIsCalledInARegisteredPort',
      code: 'crypto.getRandomValues(new Uint8Array(4))',
      filename: `/repo/${STIMULUS_PORT}`,
      options: [{ ports: [STIMULUS_PORT] }],
    },
    {
      name: 'Should_Pass_When_TheTimerIsInjectedAsAParameter',
      code: 'const tick = (setTimeout: (fn: () => void, ms: number) => void) => setTimeout(() => {}, 0)',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ALocalDeclarationShadowsTheGlobal',
      code: 'const setTimeout = (fn: () => void, ms: number) => ({ fn, ms })\nsetTimeout(() => {}, 0)',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_AnImportedNamespaceShadowsTheGlobal',
      code: "import * as Date from './date-port.js'\nDate.now()",
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_TheMemberIsNotATimeSource',
      code: 'const largest = Math.max(1, 2)\nconst fresh = new Date(1715462400000)\nconst subtle = crypto.subtle',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_AnUnrelatedGlobalIsCalled',
      code: 'console.log(JSON.stringify({ at: structuredClone({ at: 1 }) }))',
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ATimersImporterIsNotTheNodeModule',
      code: "import { setTimeout } from './host-timer.js'\nsetTimeout(() => {}, 0)",
      filename: PROD,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_SetTimeoutIsCalledInProductionSource',
      code: 'setTimeout(() => {}, 0)',
      filename: PROD,
      errors: [{ ...globalCallError('setTimeout'), line: 1, column: 0 }],
    },
    {
      name: 'Should_Report_When_AFilenameLooksLikeAPortButPortsListsAnotherFile',
      code: 'Date.now()',
      filename: HOST_TIMER_PORT,
      options: [{ ports: [RECURSION_LAWS_PORT] }],
      errors: [globalCallError('Date.now')],
    },
    {
      name: 'Should_Report_When_SetIntervalIsCalled',
      code: 'setInterval(() => {}, 1)',
      filename: PROD,
      errors: [globalCallError('setInterval')],
    },
    {
      name: 'Should_Report_When_SetImmediateIsCalled',
      code: 'setImmediate(() => {})',
      filename: PROD,
      errors: [globalCallError('setImmediate')],
    },
    {
      name: 'Should_Report_When_PerformanceNowIsCalled',
      code: 'performance.now()',
      filename: PROD,
      errors: [globalCallError('performance.now')],
    },
    {
      name: 'Should_Report_When_DateNowIsCalled',
      code: 'Date.now()',
      filename: PROD,
      errors: [globalCallError('Date.now')],
    },
    {
      name: 'Should_Report_When_NewDateHasNoArgument',
      code: 'new Date()',
      filename: PROD,
      errors: [newDateError()],
    },
    {
      name: 'Should_Report_When_MathRandomIsCalled',
      code: 'Math.random()',
      filename: PROD,
      errors: [globalCallError('Math.random')],
    },
    {
      name: 'Should_Report_When_ProcessHrtimeIsCalled',
      code: 'process.hrtime()',
      filename: PROD,
      errors: [globalCallError('process.hrtime')],
    },
    {
      name: 'Should_Report_When_ProcessHrtimeBigintIsCalled',
      code: 'process.hrtime.bigint()',
      filename: PROD,
      errors: [globalCallError('process.hrtime')],
    },
    {
      name: 'Should_Report_When_CryptoGetRandomValuesIsCalled',
      code: 'crypto.getRandomValues(new Uint8Array(4))',
      filename: PROD,
      errors: [globalCallError('crypto.getRandomValues')],
    },
    {
      name: 'Should_Report_When_CryptoRandomUuidIsCalled',
      code: 'crypto.randomUUID()',
      filename: PROD,
      errors: [globalCallError('crypto.randomUUID')],
    },
    {
      name: 'Should_Report_When_TheCallIsNestedInsideAFunction',
      code: 'const tick = () => Date.now()',
      filename: PROD,
      errors: [globalCallError('Date.now')],
    },
    {
      name: 'Should_Report_When_TimersIsStaticallyImported',
      code: "import { setTimeout as delay } from 'node:timers'",
      filename: PROD,
      errors: [timersImportError('node:timers')],
    },
    {
      name: 'Should_Report_When_TimersPromisesIsStaticallyImported',
      code: "import { setTimeout as delay } from 'node:timers/promises'",
      filename: PROD,
      errors: [timersImportError('node:timers/promises')],
    },
    {
      name: 'Should_Report_When_TimersIsSideEffectImported',
      code: "import 'node:timers'",
      filename: PROD,
      errors: [timersImportError('node:timers')],
    },
    {
      name: 'Should_Report_When_TimersIsReexported',
      code: "export { setTimeout } from 'node:timers'",
      filename: PROD,
      errors: [timersImportError('node:timers')],
    },
    {
      name: 'Should_Report_When_TimersIsDynamicallyImportedInsideAGuardLocalFunction',
      code: `const loadTimers = async () => {
        const { setTimeout: delay } = await import('node:timers')
        return delay
      }`,
      filename: PROD,
      errors: [{ ...timersImportError('node:timers'), line: 2 }],
    },
    {
      name: 'Should_Report_When_TimersIsDynamicallyImportedAsAnArgument',
      code: "const loaded = import('node:timers')",
      filename: PROD,
      errors: [timersImportError('node:timers')],
    },
    {
      name: 'Should_Report_When_TheFileIsARegisteredPortForAnotherFileOnly',
      code: 'setTimeout(() => {}, 0)',
      filename: 'packages/atom/effect-atom/src/internal/OtherTimer.ts',
      options: [{ ports: [HOST_TIMER_PORT] }],
      errors: [globalCallError('setTimeout')],
    },
    {
      name: 'Should_Report_EveryTimeSourceInTheFile',
      code: 'const at = Date.now()\nconst wait = () => new Date()\nconst id = crypto.randomUUID()',
      filename: PROD,
      errors: [globalCallError('Date.now'), newDateError(), globalCallError('crypto.randomUUID')],
    },
  ],
})
