/// <reference types="vitest/importMeta" />
import { Option, Schema } from 'effect'

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

/** @internal */
export const PackageManifestFromJson = Schema.fromJsonString(Schema.Struct({ name: PackageName }))

const EMPTY_TEXT = ''

const isNonEmptyText = (value: string): boolean => value.length > 0

const and = (left: boolean, right: boolean): boolean => left && right

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  const acceptsPackageName = (value: string): boolean => Option.isSome(Schema.decodeOption(PackageName)(value))
  const acceptsWorkspaceRoot = (value: string): boolean => Option.isSome(Schema.decodeOption(WorkspaceRoot)(value))

  const agreesOn = (accepts: (value: string) => boolean, value: string): boolean =>
    accepts(value) === isNonEmptyText(value)

  const agreesAtBoundaries = (accepts: (value: string) => boolean, value: string): boolean =>
    [value, EMPTY_TEXT].every((candidate) => agreesOn(accepts, candidate))

  it.prop(
    '∀s_ProvidedRefusal_∈TheNamedTexts',
    { of: [Schema.String], subject: { accepts: acceptsPackageName } },
    (name, [value]) => and(agreesAtBoundaries(name.accepts, value), agreesAtBoundaries(acceptsWorkspaceRoot, value)),
  )
}
