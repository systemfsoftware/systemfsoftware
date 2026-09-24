/**
 * React helpers for applying dehydrated Effect Atom state to a React subtree.
 * The `HydrationBoundary` component reads the nearest `RegistryContext`,
 * hydrates new Atom values before children render, and delays updates for
 * existing Atom values until after commit so React transitions do not update
 * the current UI too early.
 *
 * @since 4.0.0
 */
'use client'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as React from 'react'
import { useRegistry } from './RegistryContext.js'

/**
 * Props for a boundary that applies dehydrated Atom values to the nearest
 * {@link RegistryContext} while rendering its children.
 *
 * @since 4.0.0
 */
export interface HydrationBoundaryProps {
  state?: Iterable<Hydration.DehydratedAtomValue>
  children?: React.ReactNode
}

type PartitionedAtoms = {
  readonly newAtoms: Array<Hydration.DehydratedAtomValue>
  readonly existingAtoms: Array<Hydration.DehydratedAtomValue>
}

type AnyMap<K = unknown, V = unknown> = ReadonlyMap<K, V>

function pushPartitionedAtom(
  newAtoms: Array<Hydration.DehydratedAtomValue>,
  existingAtoms: Array<Hydration.DehydratedAtomValue>,
  nodes: AnyMap,
  dehydratedAtom: Hydration.DehydratedAtomValue,
): void {
  const existingNode = nodes.get(dehydratedAtom.key)
  if (existingNode === undefined) {
    newAtoms.push(dehydratedAtom)
    return
  }
  existingAtoms.push(dehydratedAtom)
}

function partitionDehydratedAtoms(
  nodes: AnyMap,
  dehydratedAtoms: Array<Hydration.DehydratedAtomValue>,
): PartitionedAtoms {
  const newAtoms: Array<Hydration.DehydratedAtomValue> = []
  const existingAtoms: Array<Hydration.DehydratedAtomValue> = []
  for (const dehydratedAtom of dehydratedAtoms) {
    pushPartitionedAtom(newAtoms, existingAtoms, nodes, dehydratedAtom)
  }
  return { newAtoms, existingAtoms }
}

function hydrateNewAtoms(
  registry: Registry.Registry,
  newAtoms: Array<Hydration.DehydratedAtomValue>,
): void {
  if (newAtoms.length === 0) {
    return
  }
  Hydration.hydrate(registry, newAtoms)
}

function existingAtomsOrUndefined(
  existingAtoms: Array<Hydration.DehydratedAtomValue>,
): Array<Hydration.DehydratedAtomValue> | undefined {
  if (existingAtoms.length === 0) {
    return undefined
  }
  return existingAtoms
}

function queueHydrationFromState(
  registry: Registry.Registry,
  state: Iterable<Hydration.DehydratedAtomValue>,
): Array<Hydration.DehydratedAtomValue> | undefined {
  const partitioned = partitionDehydratedAtoms(Registry.getNodes(registry), Array.from(state))
  hydrateNewAtoms(registry, partitioned.newAtoms)
  return existingAtomsOrUndefined(partitioned.existingAtoms)
}

function queueHydration(
  registry: Registry.Registry,
  state: Iterable<Hydration.DehydratedAtomValue> | undefined,
): Array<Hydration.DehydratedAtomValue> | undefined {
  if (state === undefined) {
    return undefined
  }
  return queueHydrationFromState(registry, state)
}

/**
 * Provides a React hydration boundary that loads dehydrated Atom values into
 * the current Atom registry.
 *
 * **When to use**
 *
 * Use to apply dehydrated Atom state to a React subtree that reads from the
 * nearest `RegistryContext`.
 *
 * **Details**
 *
 * New Atom values are hydrated during render so descendants can read them
 * immediately, while values for existing Atoms are deferred until after commit
 * so transition data does not update the current UI before React accepts it.
 *
 * @see `Hydration.dehydrate` for producing dehydrated Atom state
 * @see `Hydration.hydrate` for lower-level non-React hydration
 *
 * @since 4.0.0
 */
export const HydrationBoundary: React.FC<HydrationBoundaryProps> = ({
  children,
  state,
}) => {
  const registry = useRegistry()

  // This useMemo is for performance reasons only, everything inside it must
  // be safe to run in every render and code here should be read as "in render".
  //
  // This code needs to happen during the render phase, because after initial
  // SSR, hydration needs to happen _before_ children render. Also, if hydrating
  // during a transition, we want to hydrate as much as is safe in render so
  // we can prerender as much as possible.
  //
  // For any Atom values that already exist in the registry, we want to hold back on
  // hydrating until _after_ the render phase. The reason for this is that during
  // transitions, we don't want the existing Atom values and subscribers to update to
  // the new data on the current page, only _after_ the transition is committed.
  // If the transition is aborted, we will have hydrated any _new_ Atom values, but
  // we throw away the fresh data for any existing ones to avoid unexpectedly
  // updating the UI.
  const hydrationQueue: Array<Hydration.DehydratedAtomValue> | undefined = React.useMemo(
    () => queueHydration(registry, state),
    [registry, state],
  )

  React.useEffect(() => {
    if (hydrationQueue === undefined) {
      return
    }
    Hydration.hydrate(registry, hydrationQueue)
  }, [registry, hydrationQueue])

  return React.createElement(React.Fragment, {}, children)
}
