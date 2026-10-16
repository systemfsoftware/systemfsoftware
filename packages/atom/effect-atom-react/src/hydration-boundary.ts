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
import { Atom } from '@systemfsoftware/effect-atom'
import { absurd } from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import {
  DeferUntilCommit,
  PartitionHydratedAtoms,
  partitionHydratedAtoms,
  type PartitionHydratedAtomsDecision,
} from './partition-hydrated-atoms.workflow.js'
import { useRegistry } from './registry-context.js'

/**
 * Props for a boundary that applies dehydrated Atom values to the nearest
 * {@link RegistryContext} while rendering its children.
 *
 * @since 4.0.0
 */
export interface HydrationBoundaryProps {
  state?: Iterable<Atom.Hydration.DehydratedAtomValue>
  children?: React.ReactNode
}

type PartitionedAtoms = {
  readonly newAtoms: Array<Atom.Hydration.DehydratedAtomValue>
  readonly existingAtoms: Array<Atom.Hydration.DehydratedAtomValue>
}

type AnyMap<K = unknown, V = unknown> = ReadonlyMap<K, V>

function stringKeysOf(nodes: AnyMap): Array<string> {
  return Array.from(nodes.keys()).filter((key): key is string => typeof key === 'string')
}

function partitionDehydratedAtoms(
  nodes: AnyMap,
  dehydratedAtoms: Array<Atom.Hydration.DehydratedAtomValue>,
): PartitionedAtoms {
  const decisions = Result.match(
    partitionHydratedAtoms(
      PartitionHydratedAtoms.make({
        knownKeys: stringKeysOf(nodes),
        dehydratedKeys: dehydratedAtoms.map((dehydratedAtom) => dehydratedAtom.key),
      }),
    ),
    {
      onFailure: (error: never): PartitionHydratedAtomsDecision => absurd(error),
      onSuccess: (partitioned) => partitioned,
    },
  )
  const deferredKeys = HashSet.fromIterable(
    decisions.filter((decision) => Schema.is(DeferUntilCommit)(decision)).map((decision) => decision.key),
  )
  return {
    newAtoms: dehydratedAtoms.filter((dehydratedAtom) => !HashSet.has(deferredKeys, dehydratedAtom.key)),
    existingAtoms: dehydratedAtoms.filter((dehydratedAtom) => HashSet.has(deferredKeys, dehydratedAtom.key)),
  }
}

function hydrateNewAtoms(
  registry: Atom.Registry.Registry,
  newAtoms: Array<Atom.Hydration.DehydratedAtomValue>,
): void {
  if (newAtoms.length === 0) {
    return
  }
  Atom.Hydration.hydrate(registry, newAtoms)
}

function existingAtomsOrUndefined(
  existingAtoms: Array<Atom.Hydration.DehydratedAtomValue>,
): Array<Atom.Hydration.DehydratedAtomValue> | undefined {
  if (existingAtoms.length === 0) {
    return undefined
  }
  return existingAtoms
}

function queueHydrationFromState(
  registry: Atom.Registry.Registry,
  state: Iterable<Atom.Hydration.DehydratedAtomValue>,
): Array<Atom.Hydration.DehydratedAtomValue> | undefined {
  const partitioned = partitionDehydratedAtoms(Atom.Registry.getNodes(registry), Array.from(state))
  hydrateNewAtoms(registry, partitioned.newAtoms)
  return existingAtomsOrUndefined(partitioned.existingAtoms)
}

function queueHydration(
  registry: Atom.Registry.Registry,
  state: Iterable<Atom.Hydration.DehydratedAtomValue> | undefined,
): Array<Atom.Hydration.DehydratedAtomValue> | undefined {
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
 * @see `Atom.Hydration.dehydrate` for producing dehydrated Atom state
 * @see `Atom.Hydration.hydrate` for lower-level non-React hydration
 *
 * @since 4.0.0
 */
export const HydrationBoundary: React.FC<HydrationBoundaryProps> = ({
  children,
  state,
}) => {
  const registry = useRegistry()

  // Hydration must happen during render: after SSR, children need the values
  // before their first client render, and during a transition we want to
  // prerender as much as is safe. Existing-atom values wait until after commit
  // so an aborted transition cannot update the current page's atoms.
  const hydrationQueue: Array<Atom.Hydration.DehydratedAtomValue> | undefined = React.useMemo(
    () => queueHydration(registry, state),
    [registry, state],
  )

  React.useEffect(() => {
    if (hydrationQueue === undefined) {
      return
    }
    Atom.Hydration.hydrate(registry, hydrationQueue)
  }, [registry, hydrationQueue])

  return React.createElement(React.Fragment, {}, children)
}
