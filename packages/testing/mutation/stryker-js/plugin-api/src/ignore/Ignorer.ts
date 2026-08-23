import type * as Option from 'effect/Option'

/**
 * Narrow, owned view of the syntax node an ignorer decides over.
 *
 * The previous empty interface existed only to be patched by ambient
 * declaration merging, so the compiler could not check any member an ignorer
 * read — a misspelt predicate silently yielded `undefined` and no mutant was
 * ever ignored. Owning the members here closes that hole: the contract is
 * checkable and the surface stays minimal because every member below is read
 * by at least one existing ignorer.
 */
export interface NodePath {
  /** The syntax node the mutant originates from. */
  readonly node: unknown
  /** The parent path, allowing ancestor walks without re-traversing the tree. */
  readonly parentPath?: NodePath | null
  /** Whether the node is an `ObjectExpression`. */
  isObjectExpression(): boolean
  /** Whether the node is a `CallExpression` (including optional calls). */
  isCallExpression(): boolean
  /** Whether the node is a `ClassProperty`. */
  isClassProperty(): boolean
  /** Whether the node is a `ClassPrivateProperty`. */
  isClassPrivateProperty(): boolean
  /** Whether the node is a `ClassAccessorProperty`. */
  isClassAccessorProperty(): boolean
}

/**
 * Decides whether a mutant at `path` should be excused from the population.
 *
 * This stays a plain synchronous function while its siblings became
 * `Context.Service` ports. A predicate that returns a reason string or nothing
 * has no I/O and no clock, so there is nothing for the engine to time out,
 * retry, or interrupt — lifting it to `Effect` would force every call site
 * to run an Effect for a pure value and buy no capability. The `Option`
 * return makes absence explicit: `Option.none()` means "do not ignore" and
 * `Option.some(reason)` carries the reason, whereas `string | undefined`
 * leaves `undefined` indistinguishable from a member that was never set.
 */
export interface Ignorer {
  shouldIgnore(path: NodePath): Option.Option<string>
}
