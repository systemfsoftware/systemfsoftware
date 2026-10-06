import { fromEffect } from '@xstate/effect'
import { Effect } from 'effect'
import { setup } from 'xstate'

const readStats = fromEffect({ effect: Effect.succeed('ok') })

export const statsMachine = setup({ actors: { readStats } }).createMachine({
  context: () => ({}),
  id: 'stats',
  initial: 'reading',
  states: {
    inspected: { type: 'final' },
    reading: {
      invoke: {
        onDone: { target: 'inspected' },
        onError: { target: 'unreadable' },
        src: 'readStats',
      },
    },
    unreadable: { type: 'final' },
  },
})
