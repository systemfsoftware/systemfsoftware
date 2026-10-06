import { setup } from 'xstate'

export const orderMachine = setup({
  guards: {
    hasStock: () => true,
    isPaid: () => true,
  },
}).createMachine({
  id: 'order',
  initial: 'idle',
  states: {
    idle: { on: { SUBMIT: { target: 'reserved', guard: 'hasStock' } } },
    reserved: {
      on: {
        PAY: { target: 'paid', guard: 'isPaid' },
        CANCEL: { target: 'cancelled' },
      },
    },
    paid: { type: 'final' },
    cancelled: { type: 'final' },
  },
})
