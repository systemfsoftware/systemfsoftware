/**
 * @since 1.0.0
 */
import * as Arr from 'effect/Array'
import * as Atom from './Atom.js'
import type * as Registry from './Registry.js'
import * as Result from './Result.js'

// Mirror of the inline `Node<A>` shape declared inside Registry.ts
// (Registry.ts:52-55). Kept local because Registry's Node is not exported;
// structurally identical to what `registry.getNodes()` returns.
interface PublicNode<A> {
  readonly atom: Atom.Atom<A>
  readonly value: () => A
}

/**
 * @since 1.0.0
 * @category models
 */
export interface DehydratedAtom {
  readonly '~@systemfsoftware/effect-atom/DehydratedAtom': true
}

/**
 * @since 1.0.0
 * @category models
 */
export interface DehydratedAtomValue extends DehydratedAtom {
  readonly key: string
  readonly value: unknown
  readonly dehydratedAt: number
  readonly resultPromise?: Promise<unknown> | undefined
}

/**
 * @since 1.0.0
 * @category dehydration
 */
export const dehydrate = (
  registry: Registry.Registry,
  options?: {
    /**
     * How to encode `Result.Initial` values. Default is "ignore".
     */
    readonly encodeInitialAs?: 'ignore' | 'promise' | 'value-only' | undefined
  },
): Array<DehydratedAtom> => {
  const encodeInitialResultMode = options?.encodeInitialAs ?? 'ignore'
  const arr: Array<DehydratedAtomValue> = Arr.empty<DehydratedAtomValue>()
  const now = performance.now()
  registry.getNodes().forEach((node, key) => {
    if (!Atom.isSerializable(node.atom)) return
    const atom = node.atom
    const value = node.value()
    const isInitial = Result.isResult(value) && Result.isInitial(value)
    if (encodeInitialResultMode === 'ignore' && isInitial) return
    const encodedValue = atom[Atom.SerializableTypeId].encode(value)

    // Deferred that resolves when the atom leaves Initial; the resolver is
    // captured for the subscription callback below.
    let resultPromise: Promise<unknown> | undefined
    if (encodeInitialResultMode === 'promise' && isInitial) {
      const { promise, resolve } = Promise.withResolvers<unknown>()
      const unsubscribe = registry.subscribe(atom, (newValue) => {
        if (Result.isResult(newValue) && !Result.isInitial(newValue)) {
          resolve(atom[Atom.SerializableTypeId].encode(newValue))
          unsubscribe()
        }
      })
      resultPromise = promise
    }

    arr.push({
      '~@systemfsoftware/effect-atom/DehydratedAtom': true,
      key: key as string,
      value: encodedValue,
      dehydratedAt: now,
      resultPromise,
    })
  })
  return arr
}

/**
 * @since 1.0.0
 * @category dehydration
 */
export const toValues = (state: ReadonlyArray<DehydratedAtom>): Array<DehydratedAtomValue> =>
  state as Array<DehydratedAtomValue>

/**
 * @since 1.0.0
 * @category hydration
 */
export const hydrate = (
  registry: Registry.Registry,
  dehydratedState: Iterable<DehydratedAtom>,
): void => {
  for (const datom of dehydratedState as Iterable<DehydratedAtomValue>) {
    registry.setSerializable(datom.key, datom.value)

    // If there's a resultPromise, it means this was in Initial state when dehydrated
    // and we should wait for it to resolve to a non-Initial state, then update the registry
    if (!datom.resultPromise) continue
    void datom.resultPromise.then((resolvedValue) => {
      // Try to update the existing node directly instead of using setSerializable
      const nodes = registry.getNodes()
      const node = nodes.get(datom.key)
      if (node) {
        // Decode the resolved value using the node's atom serializable decoder
        const atom = node.atom
        if (Atom.isSerializable(atom)) {
          const decoded = atom[Atom.SerializableTypeId].decode(resolvedValue) // The public Node interface in Registry.ts omits the internal
           // Node.setValue method, but every Node created by the registry
          // implementation exposes it. A typed concrete cast to a
          // structural shape (concrete non-Effect type) is the last-resort
          // for accessing this internal contract.
          ;(node as PublicNode<unknown> & { readonly setValue: (value: unknown) => void }).setValue(decoded)
        }
      } else {
        // Fallback to setSerializable if node doesn't exist yet
        registry.setSerializable(datom.key, resolvedValue)
      }
    })
  }
}
