import { act, render } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import { constVoid } from 'effect/Function'
import type * as React from 'react'

export const renderSuspending = (element: React.ReactElement): Effect.Effect<void> =>
  Effect.promise(() => Promise.resolve(act(() => Promise.resolve(render(element)).then(constVoid))))
