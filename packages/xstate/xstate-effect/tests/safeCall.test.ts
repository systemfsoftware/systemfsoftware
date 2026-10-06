import { it } from '@systemfsoftware/vitest'
import { createActor, createMachine } from '@systemfsoftware/xstate'
import { Effect } from 'effect'
import { vi } from 'vitest'
import { safeCall } from '../src/effectActor.js'

type Seam = { readonly reportUnhandledError: (error: unknown) => void }

vi.mock('../../xstate/src/reportUnhandledError.js', () => ({
  reportUnhandledError: vi.fn(),
}))
vi.mock('../src/reportUnhandledError.js', () => ({
  reportUnhandledError: vi.fn(),
}))

const messages = (errors: readonly unknown[]): string[] =>
  errors.map((error) => error instanceof Error ? error.message : String(error))

it('Should_ReportUnhandledListenerErrorsInThrowOrder_When_ListenersThrow', function*({ expect }) {
  const effectSeam = vi.mocked(
    (yield* Effect.promise(() => vi.importMock<Seam>('../src/reportUnhandledError.js'))).reportUnhandledError,
  )
  const coreSeam = vi.mocked(
    (yield* Effect.promise(() => vi.importMock<Seam>('../../xstate/src/reportUnhandledError.js'))).reportUnhandledError,
  )
  effectSeam.mockClear()
  coreSeam.mockClear()

  const first = new Error('first')
  const second = new Error('second')

  // Core's safeCall reports in the order its listeners throw; an EffectActor
  // listener that throws must land in the same order.
  safeCall(() => {
    throw first
  }, 'a')
  safeCall(() => {
    throw second
  }, 'b')

  const machine = createMachine({
    initial: 'a',
    states: { a: { on: { GO: { target: 'b' } } }, b: {} },
  })
  const core = createActor(machine).start()
  core.subscribe({
    next: (snapshot) => {
      if (snapshot.value === 'b') {
        throw first
      }
    },
  })
  core.subscribe({
    next: (snapshot) => {
      if (snapshot.value === 'b') {
        throw second
      }
    },
  })
  core.send({ type: 'GO' })
  core.stop()

  yield* expect({
    effect: messages(effectSeam.mock.calls.map(([error]) => error)),
    core: messages(coreSeam.mock.calls.map(([error]) => error)),
  }).toEqual({ effect: ['first', 'second'], core: ['first', 'second'] })
})
