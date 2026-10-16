import { act, render } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import { constVoid } from 'effect/Function'
import type { ReactElement } from 'react'

export const renderSuspending = (element: ReactElement): Effect.Effect<void> =>
  Effect.promise(() => Promise.resolve(act(() => Promise.resolve(render(element)).then(constVoid))))
