import * as Context from 'effect/Context'
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
 * Now a `Context.Service` like every other port, so a plugin contributes it as
 * a `Layer` and the engine extracts it with `Context.get`. The previous plain
 * value could not be extracted from a `Layer` without a `Tag`, which is why
 * the ignorer path was a no-op. The `Option` return makes absence explicit:
 * `Option.none()` means "do not ignore" and `Option.some(reason)` carries the
 * reason.
 */
export interface IgnorerService {
  shouldIgnore(path: NodePath): Option.Option<string>
}

export class Ignorer extends Context.Service<Ignorer, IgnorerService>()(
  '@systemfsoftware/stryker-js-plugin-api/ignore/Ignorer',
) {}
