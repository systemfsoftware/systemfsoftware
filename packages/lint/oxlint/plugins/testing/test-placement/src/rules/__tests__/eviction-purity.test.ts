import { createRuleTester } from './_tester.js'

import {
  DUMMY_MARKER_SELF_ASSERTION_ACTUAL,
  DUMMY_MARKER_SELF_ASSERTION_EXPECTED,
  DUMMY_MARKER_SELF_ASSERTION_FIX,
  DUMMY_MARKER_SELF_ASSERTION_NAME,
  SAME_CALLEE_RECONSTRUCTION_ACTUAL,
  SAME_CALLEE_RECONSTRUCTION_EXPECTED,
  SAME_CALLEE_RECONSTRUCTION_FIX,
  SAME_CALLEE_RECONSTRUCTION_NAME,
  SILENT_EARLY_RETURN_ACTUAL,
  SILENT_EARLY_RETURN_EXPECTED,
  SILENT_EARLY_RETURN_FIX,
  SILENT_EARLY_RETURN_NAME,
  VACUOUS_PREDICATE_ACTUAL,
  VACUOUS_PREDICATE_EXPECTED,
  VACUOUS_PREDICATE_FIX,
  VACUOUS_PREDICATE_NAME,
} from '../eviction-purity.config.js'
import { evictionPurity } from '../eviction-purity.js'

const ruleTester = createRuleTester()

const reconstruction = () => ({
  messageId: 'sameCalleeReconstruction',
  data: {
    name: SAME_CALLEE_RECONSTRUCTION_NAME,
    expected: SAME_CALLEE_RECONSTRUCTION_EXPECTED,
    actual: SAME_CALLEE_RECONSTRUCTION_ACTUAL,
    fix: SAME_CALLEE_RECONSTRUCTION_FIX,
  },
})

const marker = () => ({
  messageId: 'dummyMarkerSelfAssertion',
  data: {
    name: DUMMY_MARKER_SELF_ASSERTION_NAME,
    expected: DUMMY_MARKER_SELF_ASSERTION_EXPECTED,
    actual: DUMMY_MARKER_SELF_ASSERTION_ACTUAL,
    fix: DUMMY_MARKER_SELF_ASSERTION_FIX,
  },
})

const silentReturn = () => ({
  messageId: 'silentEarlyReturn',
  data: {
    name: SILENT_EARLY_RETURN_NAME,
    expected: SILENT_EARLY_RETURN_EXPECTED,
    actual: SILENT_EARLY_RETURN_ACTUAL,
    fix: SILENT_EARLY_RETURN_FIX,
  },
})

const vacuous = () => ({
  messageId: 'vacuousPredicate',
  data: {
    name: VACUOUS_PREDICATE_NAME,
    expected: VACUOUS_PREDICATE_EXPECTED,
    actual: VACUOUS_PREDICATE_ACTUAL,
    fix: VACUOUS_PREDICATE_FIX,
  },
})

const TESTS_FILE = '/repo/pkg/tests/bindMount.integration.test.ts'
const E2E_FILE = '/repo/pkg/tests/bindMount.e2e.integration.test.ts'
const SRC_FILE = '/repo/pkg/src/main/host/bindMount.ts'

ruleTester.run('eviction-purity', evictionPurity, {
  valid: [
    {
      name: 'Should_StaySilent_When_ExpectedIsContractLiteral',
      code: `
import { expect, it } from 'vitest'

it('pins the contract path', () => {
  const m = bindMount(validInput())
  helpers['check'](m)
  check(m.hostPath).toBe('/var/run/app.sock')
  expect(m.hostPath).toBe('/var/run/app.sock')
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_ActualIsCallAndExpectedIsLiteral',
      code: `
import { expect, it } from 'vitest'

it('pins the derived path', () => {
  expect(joinPath(dir, name)).toBe('/var/run/app.sock')
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_AssertionComparesUndeclaredBindingToLiteral',
      code: `
import { expect, it } from 'vitest'

it('pins the marker-free value', () => {
  expect(status).toBe('ready')
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_SubstringPinAssertsTrue',
      code: `
import { expect, it } from 'vitest'

it('pins a written value', () => {
  expect(m.envPath.includes('sock')).toBe(true)
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_GuardThrowsInsteadOfReturning',
      code: `
import { expect, it } from 'vitest'

it('refuses a bad mount', () => {
  const m = bindMount(badInput())
  if (!('ok' in m)) throw new Error('expected a refusal')
  expect(m.hostPath).toBe('/var/run/app.sock')
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_ReturnCarriesAValue',
      code: `
import { it } from 'vitest'

it('delegates to the helper', () => {
  if (skipIntegration()) return done()
  if (cached(m)) {
    return flush(m)
  }
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_CeremonyShapesLiveUnderSrc',
      code: `
const __privateHostMarker = 'host-marker'
const TOKEN = 'token'

export const check = (m: { hostPath: string; envPath: string }): void => {
  expect(m.hostPath).toBe(joinPath(dir, name))
  expect(__privateHostMarker).toBe('host-marker')
  expect(TOKEN).toBe('token')
  expect(m.envPath.includes('secrets.env')).toBe(false)
}

export const run = (m: { ok: boolean }): void => {
  const t = (name: string, fn: () => void): void => fn()
  t('covers', () => {
    if ('ok' in m) return
  })
}
`,
      filename: SRC_FILE,
    },
    {
      name: 'Should_StaySilent_When_NamespaceConstructorWrapsAuthoredLiterals',
      code: `
import { expect, it } from 'vitest'

it('pins the refusal', () => {
  expect(mount(input)).toEqual(Result.fail(SlotRefused.make({ why: 'reserved env file' })))
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_MatcherFactoryAssertsStructure',
      code: `
import { expect, it } from 'vitest'

it('pins the shape', () => {
  expect(mount(input)).toEqual(expect.objectContaining({ root: '/var/lib/registry' }))
})
`,
      filename: TESTS_FILE,
    },
    {
      name: 'Should_StaySilent_When_NamespaceExpectedContainsNoRecomputation',
      code: `
import { expect, it } from 'vitest'

it('pins the wrapped literal', () => {
  expect(state).toEqual(Option.some({ count: 0 }))
})
`,
      filename: TESTS_FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExpectedRebuildsValueWithSameCallee',
      code: `
import { joinPath } from './support.js'
import { expect, it } from 'vitest'

it('pins the host path', () => {
  const m = bindMount(validInput())
  expect(m.hostPath).toBe(joinPath(dir, name))
})
`,
      filename: TESTS_FILE,
      errors: [reconstruction()],
    },
    {
      name: 'Should_Report_When_NegatedExpectedRebuildsValueWithSameCallee',
      code: `
import { joinPath } from './support.js'
import { expect, it } from 'vitest'

it('pins the host path', () => {
  const m = bindMount(validInput())
  expect(m.hostPath).not.toBe(joinPath(dir, name))
})
`,
      filename: TESTS_FILE,
      errors: [reconstruction()],
    },
    {
      name: 'Should_Report_When_E2eSuffixedFileRebuildsExpected',
      code: `
import { joinPath } from './support.js'
import { expect, it } from 'vitest'

it('pins the host path', () => {
  const m = bindMount(validInput())
  expect(m.hostPath).toEqual(joinPath(dir, name))
})
`,
      filename: E2E_FILE,
      errors: [reconstruction()],
    },
    {
      name: 'Should_Report_When_MarkerConstAssertedAgainstOwnLiteral',
      code: `
import { expect, it } from 'vitest'

const __privateHostMarker = 'host-marker'

it('covers the marker', () => {
  expect(__privateHostMarker).toBe('host-marker')
})
`,
      filename: TESTS_FILE,
      errors: [marker()],
    },
    {
      name: 'Should_Report_When_PlainBindingComparedToItsOwnLiteral',
      code: `
import { expect, it } from 'vitest'

const TOKEN = 'token'

it('covers the token', () => {
  expect(TOKEN).toBe('token')
})
`,
      filename: TESTS_FILE,
      errors: [marker()],
    },
    {
      name: 'Should_Report_When_SilentReturnGuardsTestBody',
      code: `
import { expect, it } from 'vitest'

it('covers the refusal', () => {
  const m = bindMount(badInput())
  if ('ok' in m) return
  if (m === null) {
    return
  }
  expect(m.hostPath).toBe('/var/run/app.sock')
})
`,
      filename: TESTS_FILE,
      errors: [silentReturn(), silentReturn()],
    },
    {
      name: 'Should_Report_When_VacuousSubstringPinUsesFalsyMatcher',
      code: `
import { expect, it } from 'vitest'

it('pins the env path', () => {
  const m = bindMount(validInput())
  expect(m.envPath.includes('secrets.env')).toBeFalsy()
})
`,
      filename: TESTS_FILE,
      errors: [vacuous()],
    },
    {
      name: 'Should_Report_When_VacuousSubstringPinComparedToFalse',
      code: `
import { expect, it } from 'vitest'

it('pins the env path', () => {
  const m = bindMount(validInput())
  expect(m.envPath.includes('secrets.env')).toBe(false)
})
`,
      filename: TESTS_FILE,
      errors: [vacuous()],
    },
  ],
})
