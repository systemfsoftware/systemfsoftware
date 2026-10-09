/**
 * The values the `vitestFork()` plugin (`src/plugin.ts`) provides for the fork: the package under test's npm name and the workspace
 * root every rendered path is relativized against. Both are read out of the run's provided context (Vitest's
 * `inject`), so no production source reads a Node built-in, and an absent value is simply `undefined` — a rerun
 * line then drops its package filter, and paths print absolute (R6, KTD5).
 *
 * The values are branded (`provided.schema.ts`): a package name and a workspace root are not interchangeable
 * text (CONST-D3).
 *
 * @since 4.0.0
 */
import { Option, Schema } from 'effect'
import { inject } from 'vitest'
import { PackageName, type PackageName as PackageNameValue, WorkspaceRoot } from './provided.schema.js'

/** @internal */
export const packageKey = '@systemfsoftware/vitest:package'

/** @internal */
export const workspaceRootKey = '@systemfsoftware/vitest:workspace-root'

type ProvidedKey = typeof packageKey | typeof workspaceRootKey

type Opaque<A = unknown> = A

const isText = (value: Opaque): value is string => typeof value === 'string'

const nonEmpty = (value: string): string | undefined => value.length === 0 ? undefined : value

const nonEmptyText = (value: Opaque): string | undefined => isText(value) ? nonEmpty(value) : undefined

const read = (key: ProvidedKey): string | undefined => {
  try {
    return nonEmptyText(inject(key))
  } catch {
    return undefined
  }
}

const readNamed = <A>(key: ProvidedKey, schema: Schema.Codec<A, string>): A | undefined =>
  Option.getOrUndefined(Option.flatMap(Option.fromUndefinedOr(read(key)), (text) => Schema.decodeOption(schema)(text)))

/** @internal */
export const providedPackage = (): PackageNameValue | undefined => readNamed(packageKey, PackageName)

/** @internal */
export const providedRoot = (): WorkspaceRoot | undefined => readNamed(workspaceRootKey, WorkspaceRoot)
