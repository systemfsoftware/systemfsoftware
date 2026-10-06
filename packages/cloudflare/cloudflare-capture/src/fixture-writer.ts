import type { RawValue } from './captured-response.schema.js'

/** The fields a fixture record carries, in the schema's declaration order. */
const FIXTURE_FIELDS = [
  'case',
  'product',
  'operation',
  'method',
  'endpoint',
  'status',
  'code',
  'message',
  'capturedOn',
] as const

const project = (record: Record<string, RawValue>): Record<string, RawValue> =>
  Object.fromEntries(FIXTURE_FIELDS.map((field) => [field, record[field]] as const))

const caseOf = (record: Record<string, RawValue>): string => String(record['case'])

const ascending = (left: string, right: string): number => Number(left > right) - Number(left < right)

/**
 * The fixture file's text: only the recorded fields, in the schema's key order,
 * sorted by `case`. A captured id riding on a record is dropped by projection;
 * a record missing a named field is refused by the `CapturedResponse` schema
 * before it reaches here.
 */
export const renderFixture = (records: ReadonlyArray<Record<string, RawValue>>): string =>
  `${
    JSON.stringify(
      [...records].map(project).sort((left, right) => ascending(caseOf(left), caseOf(right))),
      null,
      2,
    )
  }\n`
