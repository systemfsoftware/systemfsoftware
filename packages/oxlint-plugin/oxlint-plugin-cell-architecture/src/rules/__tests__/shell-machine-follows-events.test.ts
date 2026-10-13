import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DISALLOWED_KEY_EXPECTED,
  DISALLOWED_KEY_FIX,
  disallowedKeyActual,
  disallowedKeyName,
  DYNAMIC_EXPECTED,
  DYNAMIC_FIX,
  DYNAMIC_NAME,
  dynamicImportActual,
  MISSING_EVENT_EXPECTED,
  missingEventActual,
  missingEventFix,
  missingEventName,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  REEXPORT_NAME,
  reExportActual,
  ROOT_EXPECTED,
  ROOT_FIX,
  ROOT_NAME,
  rootActual,
  UNCLOSED_EXPECTED,
  UNCLOSED_FIX,
  UNCLOSED_NAME,
  unclosedActual,
  UNRESOLVABLE_EXPECTED,
  UNRESOLVABLE_FIX,
  UNRESOLVABLE_NAME,
  unresolvableActual,
} from '../shell-machine-follows-events.config.js'
import { shellMachineFollowsEvents } from '../shell-machine-follows-events.js'

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

const SRC = '/repo/packages/shop/src/session.machine.ts'

const FLAT_CONFIG = `
import { createFSM } from '@systemfsoftware/xstate/fsm'

const session = createFSM({
  id: 'session',
  initial: 'closed',
  context: { id: '' },
  states: {
    closed: { on: { OPEN: { target: 'open' }, CLOSE: 'closed' } },
    open: { on: { OPEN: 'open', CLOSE: 'closed' } },
  },
})
`

const INCOMPLETE_STATES =
  `{ states: { closed: { on: { OPEN: 'open', CLOSE: 'closed' } }, open: { on: { OPEN: 'open' } } } }`

const STATES_WITHOUT_AN_ON_TABLE = `{ initial: 'a', states: { a: { on: { GO: 'b' } }, b: {} } }`

/** The observed shape of a transition function whose body leaves the closed form. */
const UNCLOSED_FUNCTION_FORM =
  'a transition function whose body is not one fixed target with an event-copy context patch'

const unresolvableError = (observed: string) => ({
  messageId: 'unresolvableConfig' as const,
  data: {
    name: UNRESOLVABLE_NAME,
    expected: UNRESOLVABLE_EXPECTED,
    actual: unresolvableActual(observed),
    fix: UNRESOLVABLE_FIX,
  },
})

const unclosedError = (observed: string) => ({
  messageId: 'unclosedTransition' as const,
  data: {
    name: UNCLOSED_NAME,
    expected: UNCLOSED_EXPECTED,
    actual: unclosedActual(observed),
    fix: UNCLOSED_FIX,
  },
})

const disallowedKeyError = (key: string) => ({
  messageId: 'disallowedConfigKey' as const,
  data: {
    name: disallowedKeyName(key),
    expected: DISALLOWED_KEY_EXPECTED,
    actual: disallowedKeyActual(key),
    fix: DISALLOWED_KEY_FIX,
  },
})

const missingEventError = (state: string, event: string) => ({
  messageId: 'missingEventType' as const,
  data: {
    name: missingEventName(state, event),
    expected: MISSING_EVENT_EXPECTED,
    actual: missingEventActual(state, event),
    fix: missingEventFix(state, event),
  },
})

const rootError = (calleePath: string) => ({
  messageId: 'rootMachineFactory' as const,
  data: {
    name: ROOT_NAME,
    expected: ROOT_EXPECTED,
    actual: rootActual(calleePath),
    fix: ROOT_FIX,
  },
})

const dynamicImportError = (source: string) => ({
  messageId: 'familyDynamicImport' as const,
  data: {
    name: DYNAMIC_NAME,
    expected: DYNAMIC_EXPECTED,
    actual: dynamicImportActual(source),
    fix: DYNAMIC_FIX(source),
  },
})

const reExportError = (source: string) => ({
  messageId: 'familyReExport' as const,
  data: {
    name: REEXPORT_NAME,
    expected: REEXPORT_EXPECTED,
    actual: reExportActual(source),
    fix: REEXPORT_FIX(source),
  },
})

ruleTester.run('shell-machine-follows-events', shellMachineFollowsEvents, {
  valid: [
    {
      name: 'Should_Pass_When_EveryStateNamesEveryEventWithFixedTargets',
      filename: SRC,
      code: FLAT_CONFIG,
    },
    {
      name: 'Should_Pass_When_ATransitionCopiesEventFieldsIntoContext',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({
  states: {
    closed: { on: { OPEN: ({ event }) => ({ target: 'open', context: { id: event.id } }) } },
    open: { on: { OPEN: ({ event }) => ({ target: 'open', context: { id: event.id } }) } },
  },
})
`,
    },
    {
      name: 'Should_Pass_When_TheConfigSpreadsAModuleConstObjectLiteral',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

const base = {
  id: 'session',
  initial: 'closed',
  states: {
    closed: { on: { OPEN: 'open', CLOSE: 'closed' } },
    open: { on: { OPEN: 'open', CLOSE: 'closed' } },
  },
}

createFSM({ ...base })
`,
    },
    {
      name: 'Should_Not_Judge_When_CreateFSMComesFromAnotherPackage',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/flows'

createFSM({ states: { closed: { on: { OPEN: ({ event }) => (event.id ? 'open' : 'closed') } } } })
`,
    },
    {
      // A type-only edge carries no machine: the factory never reaches this module.
      name: 'Should_Pass_When_TheFamilyIsReExportedAsATypeOnlyName',
      filename: SRC,
      code: `export type { createFSM } from '@systemfsoftware/xstate/fsm'\n`,
    },
    {
      name: 'Should_Pass_When_TheFamilyIsReExportedAsATypeOnlyStar',
      filename: SRC,
      code: `export type * from '@systemfsoftware/xstate'\n`,
    },
    {
      name: 'Should_Pass_When_EveryReExportedSpecifierIsTypeOnly',
      filename: SRC,
      code: `export { type createFSM, type StateMachine } from '@systemfsoftware/xstate/fsm'\n`,
    },
  ],
  invalid: [
    {
      name: 'Should_Refuse_When_ATransitionFunctionHoldsATernary',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({
  states: {
    closed: { on: { OPEN: ({ event }) => (event.id ? 'open' : 'closed') } },
  },
})
`,
      errors: [unclosedError(UNCLOSED_FUNCTION_FORM)],
    },
    {
      name: 'Should_Refuse_When_AStateOmitsAnEventAnotherStateHandles',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM(${INCOMPLETE_STATES})
`,
      errors: [missingEventError('open', 'CLOSE')],
    },
    {
      name: 'Should_Refuse_When_AStateCarriesNoOnTable',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM(${STATES_WITHOUT_AN_ON_TABLE})
`,
      errors: [missingEventError('b', 'GO')],
    },
    {
      name: 'Should_Refuse_When_TheConfigSpreadsAnImportedBinding',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'
import { base } from './session-base.js'

createFSM({ ...base })
`,
      errors: [unresolvableError('a spread from a binding this rule cannot read')],
    },
    {
      name: 'Should_Refuse_When_TheConfigSpreadsAParameter',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const build = (base: object) => createFSM({ ...base })
`,
      errors: [unresolvableError('a spread from a binding this rule cannot read')],
    },
    {
      // A function-local `const` that shadows a closed module table is not that
      // table: the call is not judged against the module binding it shadows.
      name: 'Should_Refuse_When_ALocalConstShadowsAClosedModuleConfig',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

const config = { initial: 'a', states: { a: { on: { GO: 'b' } }, b: { on: { GO: 'a' } } } }

export const build = () => {
  const config = { initial: 'a', states: { a: { on: { GO: 'b' } }, b: {} } }
  return createFSM(config)
}
`,
      errors: [unresolvableError('a config argument that is not an object literal')],
    },
    {
      name: 'Should_Refuse_When_TheFactoryIsCalledWithNoConfig',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM()
`,
      errors: [unresolvableError('a factory call with no readable config argument')],
    },
    {
      name: 'Should_Refuse_When_TheFactorySpreadsItsArgument',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'
import { base } from './session-base.js'

createFSM(...base)
`,
      errors: [unresolvableError('a config spread into the factory call')],
    },
    {
      name: 'Should_Refuse_When_TheFactoryIsForwardedThroughCall',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM.call(null, { states: { a: { on: { GO: 'b' } }, b: {} } })
`,
      errors: [missingEventError('b', 'GO')],
    },
    {
      name: 'Should_Refuse_When_TheFactoryIsForwardedThroughApply',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM.apply(null, [{ states: { a: { on: { GO: 'b' } }, b: {} } }])
`,
      errors: [missingEventError('b', 'GO')],
    },
    {
      name: 'Should_Refuse_When_TheAppliedArgumentListIsUnreadable',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM.apply(null, forwardedConfig)
`,
      errors: [unresolvableError('a factory call with no readable config argument')],
    },
    {
      name: 'Should_Refuse_When_TheBoundFactoryIsCalledLater',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

const makeMachine = createFSM.bind(null)

makeMachine({ states: { a: { on: { GO: 'b' } }, b: {} } })
`,
      errors: [missingEventError('b', 'GO')],
    },
    {
      name: 'Should_Refuse_When_SetupChainsCreateFSM',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

setup({}).createFSM({
  states: { closed: { on: { OPEN: ({ event }) => (event.id ? 'open' : 'closed') } } },
})
`,
      errors: [unclosedError(UNCLOSED_FUNCTION_FORM)],
    },
    {
      name: 'Should_Refuse_When_CreateFSMIsDestructuredFromSetup',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

const { createFSM } = setup({})

createFSM(${INCOMPLETE_STATES})
`,
      errors: [missingEventError('open', 'CLOSE')],
    },
    {
      name: 'Should_Refuse_When_AHeldSetupResultChainsCreateFSM',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

const machine = setup({})

machine.createFSM(${INCOMPLETE_STATES})
`,
      errors: [missingEventError('open', 'CLOSE')],
    },
    {
      name: 'Should_Refuse_When_TheRootCreateMachineIsCalled',
      filename: SRC,
      code: `
import { createMachine } from '@systemfsoftware/xstate'

createMachine({ id: 'session', initial: 'closed', states: { closed: {} } })
`,
      errors: [rootError('createMachine')],
    },
    {
      name: 'Should_Refuse_When_SetupChainsCreateMachine',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

setup({}).createMachine({ id: 'session' })
`,
      errors: [rootError('setup.createMachine')],
    },
    {
      name: 'Should_Refuse_When_TheEffectForkSetupChainsCreateMachine',
      filename: SRC,
      code: `
import { setupEffect } from '@systemfsoftware/xstate-effect'

setupEffect({ schemas: { input: Schema.String } }).createMachine({ id: 'session' })
`,
      errors: [rootError('setupEffect.createMachine')],
    },
    {
      name: 'Should_Refuse_When_AConfigKeySitsOutsideTheClosedTable',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({
  id: 'session',
  initial: 'closed',
  context: { id: '' },
  states: {
    closed: { on: { OPEN: { target: 'open', guard: () => true } }, entry: () => {}, after: {}, always: [] },
    open: { on: { OPEN: 'open' }, actions: [] },
  },
})
`,
      errors: [
        disallowedKeyError('guard'),
        disallowedKeyError('entry'),
        disallowedKeyError('after'),
        disallowedKeyError('always'),
        disallowedKeyError('actions'),
      ],
    },
    {
      name: 'Should_Refuse_When_AStateTableKeyIsComputed',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({
  states: {
    closed: { on: { OPEN: 'open' }, [SIDE]: () => {} },
  },
})
`,
      errors: [disallowedKeyError('a computed key')],
    },
    {
      name: 'Should_Refuse_When_AnEventKeyIsComputed',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({ states: { closed: { on: { [OPEN]: 'open' } } } })
`,
      errors: [unresolvableError('a computed event key')],
    },
    {
      name: 'Should_Refuse_When_ATransitionContextHoldsALiteral',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({
  states: {
    closed: { on: { OPEN: () => ({ target: 'open', context: { id: 'literal' } }) } },
  },
})
`,
      errors: [unclosedError(UNCLOSED_FUNCTION_FORM)],
    },
    {
      name: 'Should_Refuse_When_ATransitionBodyHasContextButNoTarget',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM({
  states: {
    closed: { on: { OPEN: () => ({ context: { id: event.id } }) } },
  },
})
`,
      errors: [unclosedError(UNCLOSED_FUNCTION_FORM)],
    },
    {
      name: 'Should_Refuse_When_TheTransitionValueSitsInAnIdentifier',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

const openTransition = 'open'

createFSM({ states: { closed: { on: { OPEN: openTransition } } } })
`,
      errors: [unresolvableError('a transition value held in an identifier')],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsReExportedByName',
      filename: SRC,
      code: `export { createFSM } from '@systemfsoftware/xstate/fsm'\n`,
      errors: [reExportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsReExportedByStar',
      filename: SRC,
      code: `export * from '@systemfsoftware/xstate'\n`,
      errors: [reExportError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Refuse_When_TheReExportCarriesAValueSpecifierBesideAType',
      filename: SRC,
      code: `export { createFSM, type StateMachine } from '@systemfsoftware/xstate/fsm'\n`,
      errors: [reExportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsReExportedWithNoNameAtAll',
      filename: SRC,
      code: `export {} from '@systemfsoftware/xstate/fsm'\n`,
      errors: [reExportError('@systemfsoftware/xstate/fsm')],
    },
    // The dynamic `import()` texts below are the code under test: this rule refuses a dynamic
    // import of a state-machine specifier, so the suite has to parse one.
    {
      name: 'Should_Refuse_When_TheFamilyIsImportedDynamicallyAtModuleScope',
      filename: SRC,
      code: `const mod = await import('@systemfsoftware/xstate/fsm')\n`,
      errors: [dynamicImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsImportedDynamicallyInsideAFunction',
      filename: SRC,
      code: `
export const load = async () => {
  const mod = await import('@systemfsoftware/xstate')
  return mod
}
`,
      errors: [dynamicImportError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsImportedDynamicallyThroughATemplate',
      filename: SRC,
      code: `const mod = await import(\`@systemfsoftware/xstate/fsm\`)\n`,
      errors: [dynamicImportError('@systemfsoftware/xstate/fsm')],
    },
  ],
})
