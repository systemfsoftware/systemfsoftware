import { Option, Schema } from 'effect'
import { DiagramId } from './Diagram.schema.js'

const NON_ID = /[^a-z0-9]+/g

export const slugOf = (raw: string): string =>
  raw.toLowerCase().replace(NON_ID, '-').replace(/^-+/, '').replace(/-+$/, '')

const nonEmptySlug = (raw: string): string => {
  const slug = slugOf(raw)
  return slug.length === 0 ? 'diagram' : slug
}

export const makeDiagramId = (raw: string): DiagramId =>
  Option.getOrThrow(Schema.decodeOption(DiagramId)(nonEmptySlug(raw)))

const MERMAID_UNSAFE = /[^A-Za-z0-9_]+/g

const sanitizeMermaid = (raw: string): string => raw.replace(MERMAID_UNSAFE, '_')

const hashCode = (raw: string): string =>
  raw.split('').reduce((hash, char) => (hash * 33 ^ char.charCodeAt(0)) >>> 0, 5381).toString(16)

const isCleanId = (raw: string, safe: string): boolean => safe === raw && safe.length > 0

export const mermaidIdOf = (raw: string): string => {
  const safe = sanitizeMermaid(raw)
  return isCleanId(raw, safe) ? safe : `n${hashCode(raw)}_${safe}`
}

export const mermaidLabelOf = (raw: string): string => raw.replace(/"/g, "'").replace(/\r?\n/g, ' ')

export const flowchartLabelOf = (raw: string): string =>
  raw.replace(/"/g, "'").replace(/\[/g, '(').replace(/\]/g, ')').replace(/\|/g, '/').replace(/\r?\n/g, ' ')

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')

  const isMermaidSafeId = (value: string): boolean => /^[A-Za-z0-9_]+$/.test(value)

  it.prop(
    '∀raw_MermaidId_≡SafeOrIdentical',
    { of: [Schema.String], subject: mermaidIdOf },
    (subject, [raw]) => isMermaidSafeId(raw) ? subject(raw) === raw : isMermaidSafeId(subject(raw)),
  )
}
