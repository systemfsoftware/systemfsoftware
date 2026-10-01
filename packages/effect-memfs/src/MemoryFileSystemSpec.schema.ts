import { Predicate, Schema } from 'effect'
import { dual } from 'effect/Function'

export const AbsolutePath = Schema.String.pipe(Schema.check(Schema.isStartingWith('/')))
export type AbsolutePath = typeof AbsolutePath.Type

export const ContentBody = Schema.Union([Schema.String, Schema.Uint8Array])
export type ContentBody = typeof ContentBody.Type

export const Contents = Schema.Record(Schema.String, Schema.NullOr(ContentBody))
export type Contents = typeof Contents.Type

export const MemoryFileSystemSpec = Schema.Struct({
  cwd: AbsolutePath,
  contents: Contents,
})
export type MemoryFileSystemSpec = typeof MemoryFileSystemSpec.Type

const volumeBodyOf = (body: Contents[string]): string | null => Predicate.isUint8Array(body) ? '' : body

export const volumeJSONOf = (contents: Contents): Record<string, string | null> =>
  Object.fromEntries(Object.entries(contents).map(([path, body]) => [path, volumeBodyOf(body)]))

export const bytesOf = (contents: ContentBody): Uint8Array =>
  typeof contents === 'string' ? new TextEncoder().encode(contents) : contents

const directoryOf = (cwd: string): string => cwd.endsWith('/') ? cwd : `${cwd}/`

const absoluteOf = (cwd: string, path: string): string => path.startsWith('/') ? path : directoryOf(cwd) + path

type ByteBodies = ReadonlyArray<readonly [path: string, bytes: Uint8Array]>

export const byteBodiesOf: {
  (contents: Contents): (cwd: string) => ByteBodies
  (cwd: string, contents: Contents): ByteBodies
} = dual(
  2,
  (cwd: string, contents: Contents): ByteBodies =>
    Object.entries(contents).flatMap(([path, body]) =>
      Predicate.isUint8Array(body) ? [[absoluteOf(cwd, path), body] as const] : []
    ),
)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀t_BytesOfText_≡ItsText',
    { of: [Schema.String], subject: bytesOf },
    (subject, [drawn]) => {
      const text = drawn.toWellFormed()
      return new TextDecoder().decode(subject(text)) === text
    },
  )

  it.prop(
    '∀b_BytesOfBytes_≡ItsContent',
    { of: [Schema.Uint8Array], subject: bytesOf },
    (subject, [bytes]) => new TextDecoder().decode(subject(bytes)) === new TextDecoder().decode(bytes),
  )
}
