import { Schema } from 'effect'

/**
 * The npm name of the package under test, as its own `package.json` spells it.
 *
 * @internal
 */
export const PackageName = Schema.NonEmptyString.pipe(Schema.brand('PackageName'))

/** @internal */
export type PackageName = typeof PackageName.Type

/**
 * The workspace root every rendered path is relativized against.
 *
 * @internal
 */
export const WorkspaceRoot = Schema.NonEmptyString.pipe(Schema.brand('WorkspaceRoot'))

/** @internal */
export type WorkspaceRoot = typeof WorkspaceRoot.Type
