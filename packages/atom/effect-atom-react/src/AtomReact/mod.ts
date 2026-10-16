/**
 * React bindings for Effect atoms: registry provision, value hooks, ref hooks,
 * Suspense, hydration, and scoped atoms.
 *
 * @since 4.0.0
 */
export { useAtomRef, useAtomRefProp, useAtomRefPropValue } from '../hooks-ref.js'
export { useAtomSuspense } from '../hooks-suspense.js'
export {
  useAtom,
  useAtomInitialValues,
  useAtomMount,
  useAtomRefresh,
  useAtomSet,
  useAtomSetResult,
  useAtomSubscribe,
  useAtomUpdate,
  useAtomValue,
} from '../hooks-value.js'
export { HydrationBoundary, type HydrationBoundaryProps } from '../hydration-boundary.js'
export {
  type AnyAtom,
  type AnyInitialValue,
  RegistryContext,
  RegistryProvider,
  type RegistryProviderOptions,
  scheduleTask,
  useRegistry,
} from '../registry-context.js'
export { make, type ScopedAtom, TypeId } from '../scoped-atom.blueprint.js'
