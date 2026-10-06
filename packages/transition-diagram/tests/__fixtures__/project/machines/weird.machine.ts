import { setup } from 'xstate'

export const weirdMachine = setup({}).createMachine({
  id: 'weird',
  initial: 'start: here',
  states: {
    'start: here': { on: { 'GO [now]': { target: 'end; there#1' } } },
    'end; there#1': { type: 'final' },
  },
})
