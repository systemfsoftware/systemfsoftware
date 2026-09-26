import { Predicate, Schema } from 'effect'

export const DriverEntryName = Schema.Union([Schema.String, Schema.Uint8Array])
export type DriverEntryName = typeof DriverEntryName.Type

export const NamedDriverEntry = Schema.Struct({ name: DriverEntryName })
export type NamedDriverEntry = typeof NamedDriverEntry.Type

export const DriverEntry = Schema.Union([DriverEntryName, NamedDriverEntry])
export type DriverEntry = typeof DriverEntry.Type

const textOf = (value: DriverEntryName): string => typeof value === 'string' ? value : new TextDecoder().decode(value)

const isNamed = (entry: DriverEntry): entry is NamedDriverEntry => Predicate.hasProperty(entry, 'name')

export const entryPathOf = (entry: DriverEntry): string => isNamed(entry) ? textOf(entry.name) : textOf(entry)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

  it.prop(
    '∀t_EntryPath_≡WrittenText',
    { of: [Schema.String], subject: entryPathOf },
    (subject, [drawn]) => {
      const text = drawn.toWellFormed()
      return subject(text) === text && subject({ name: text }) === text
    },
  )

  it.prop(
    '∀t_EntryPath_≡WrittenBytes',
    { of: [Schema.String], subject: entryPathOf },
    (subject, [drawn]) => {
      const text = drawn.toWellFormed()
      return subject(encode(text)) === text
    },
  )
}
