/**
 * The path shape stryker hands an Ignore plugin: the mutant node plus its
 * ancestor chain. Both Ignorer plugins walk the same linked list of parent
 * paths, so the interface and the walk live here once.
 */
export interface IgnorerPath {
  readonly node: unknown
  readonly parentPath?: IgnorerPath | null
}

/** The ancestor nodes of a path, nearest first, ending at the file root.
 * @yields each ancestor node, nearest first
 */
export function* ancestorsOf(path: IgnorerPath): Generator<unknown> {
  for (let current = path.parentPath; current; current = current.parentPath) {
    yield current.node
  }
}
