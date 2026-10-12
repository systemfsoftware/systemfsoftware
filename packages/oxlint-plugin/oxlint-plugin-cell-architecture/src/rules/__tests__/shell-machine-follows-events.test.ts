import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

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
      errors: [{ messageId: 'unclosedTransition', data: {} }],
    },
    {
      name: 'Should_Refuse_When_AStateOmitsAnEventAnotherStateHandles',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

createFSM(${INCOMPLETE_STATES})
`,
      errors: [{ messageId: 'missingEventType', data: { state: 'open', event: 'CLOSE' } }],
    },
    {
      name: 'Should_Refuse_When_TheConfigSpreadsAnImportedBinding',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'
import { base } from './session-base.js'

createFSM({ ...base })
`,
      errors: [{ messageId: 'unresolvableConfig', data: {} }],
    },
    {
      name: 'Should_Refuse_When_TheConfigSpreadsAParameter',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const build = (base: object) => createFSM({ ...base })
`,
      errors: [{ messageId: 'unresolvableConfig', data: {} }],
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
      errors: [{ messageId: 'unclosedTransition', data: {} }],
    },
    {
      name: 'Should_Refuse_When_CreateFSMIsDestructuredFromSetup',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

const { createFSM } = setup({})

createFSM(${INCOMPLETE_STATES})
`,
      errors: [{ messageId: 'missingEventType', data: { state: 'open', event: 'CLOSE' } }],
    },
    {
      name: 'Should_Refuse_When_AHeldSetupResultChainsCreateFSM',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

const machine = setup({})

machine.createFSM(${INCOMPLETE_STATES})
`,
      errors: [{ messageId: 'missingEventType', data: { state: 'open', event: 'CLOSE' } }],
    },
    {
      name: 'Should_Refuse_When_TheRootCreateMachineIsCalled',
      filename: SRC,
      code: `
import { createMachine } from '@systemfsoftware/xstate'

createMachine({ id: 'session', initial: 'closed', states: { closed: {} } })
`,
      errors: [{ messageId: 'rootMachineFactory', data: {} }],
    },
    {
      name: 'Should_Refuse_When_SetupChainsCreateMachine',
      filename: SRC,
      code: `
import { setup } from '@systemfsoftware/xstate'

setup({}).createMachine({ id: 'session' })
`,
      errors: [{ messageId: 'rootMachineFactory', data: {} }],
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
        { messageId: 'disallowedConfigKey', data: { key: 'guard' } },
        { messageId: 'disallowedConfigKey', data: { key: 'entry' } },
        { messageId: 'disallowedConfigKey', data: { key: 'after' } },
        { messageId: 'disallowedConfigKey', data: { key: 'always' } },
        { messageId: 'disallowedConfigKey', data: { key: 'actions' } },
      ],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsReExportedByName',
      filename: SRC,
      code: `export { createFSM } from '@systemfsoftware/xstate/fsm'\n`,
      errors: [
        { messageId: 'familyReExport', data: { source: '@systemfsoftware/xstate/fsm' } },
      ],
    },
    {
      name: 'Should_Refuse_When_TheFamilyIsReExportedByStar',
      filename: SRC,
      code: `export * from '@systemfsoftware/xstate'\n`,
      errors: [{ messageId: 'familyReExport', data: { source: '@systemfsoftware/xstate' } }],
    },
    // The dynamic `import()` texts below are the code under test: this rule refuses a dynamic
    // import of a state-machine specifier, so the suite has to parse one.
    {
      name: 'Should_Refuse_When_TheFamilyIsImportedDynamicallyAtModuleScope',
      filename: SRC,
      code: `const mod = await import('@systemfsoftware/xstate/fsm')\n`,
      errors: [
        { messageId: 'familyDynamicImport', data: { source: '@systemfsoftware/xstate/fsm' } },
      ],
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
      errors: [{ messageId: 'familyDynamicImport', data: { source: '@systemfsoftware/xstate' } }],
    },
  ],
})
