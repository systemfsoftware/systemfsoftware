import { cleanup } from '@testing-library/react'
import { Effect, Layer } from 'effect'

export const renderCleanupLayer = Layer.effectDiscard(
  Effect.addFinalizer(() => Effect.sync(cleanup)),
)
