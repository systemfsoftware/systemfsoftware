/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

/** POSIX (`/x`), Windows drive (`C:\x`, `C:/x`), or UNC (`\\server\share`). */
const absolutePathForm = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/

/**
 * A resolved configuration path. Every path the configuration hands the run has been resolved to
 * an absolute form, so a consumer never has to ask whether it must join a folder first.
 */
export const AbsolutePath = Schema.String.pipe(
  Schema.check(Schema.isPattern(absolutePathForm, { message: 'a resolved configuration path is absolute' })),
  Schema.brand('AbsolutePath'),
)
export type AbsolutePath = typeof AbsolutePath.Type

const pathSeeds: ReadonlyArray<string> = ['', 'relative', '<projectFolder>/x', '/', 'C:\\x']

const pathDecodes = (text: string): boolean => Result.isSuccess(Schema.decodeResult(AbsolutePath)(text))

const isAbsolutePath = (text: string): boolean =>
  Arr.some(
    [
      (candidate: string) => candidate.startsWith('/'),
      (candidate: string) => /^[A-Za-z]:[\\/]/.test(candidate),
      (candidate: string) => candidate.startsWith('\\\\'),
    ],
    (holds) => holds(text),
  )

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀p_AbsolutePathRefusal_≡Absolute',
    { of: [Schema.String], subject: pathDecodes },
    (subject, [value]) => Arr.every(Arr.append(pathSeeds, value), (text) => subject(text) === isAbsolutePath(text)),
  )
}
