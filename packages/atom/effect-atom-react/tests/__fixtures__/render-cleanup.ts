import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { cleanup } from '@testing-library/react'
import { Effect, Layer } from 'effect'

const owned: Atom.Registry.Registry[] = []

type InitialValues = NonNullable<Parameters<typeof Atom.Registry.make>[0]>['initialValues']

export const ownRegistry = (initialValues?: InitialValues): Atom.Registry.Registry => {
  const registry = Atom.Registry.make({ scheduleTask: AtomReact.scheduleTask, initialValues })
  owned.push(registry)
  return registry
}

const unmountThenDispose = (): void => {
  cleanup()
  for (const registry of owned.splice(0)) {
    Atom.Registry.dispose(registry)
  }
}

export const renderCleanupLayer = Layer.effectDiscard(
  Effect.addFinalizer(() => Effect.sync(unmountThenDispose)),
)
