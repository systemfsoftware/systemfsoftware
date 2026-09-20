import * as Result from 'effect/Result'

export type TemplateToken = { tag: string; rest: string }

const closedToken = (remainder: string, openIdx: number): TemplateToken | null => {
  const closeIdx = remainder.indexOf('>', openIdx)
  if (closeIdx === -1) return null
  return {
    tag: remainder.slice(openIdx + 1, closeIdx),
    rest: remainder.slice(closeIdx + 1),
  }
}

const nextToken = (remainder: string): TemplateToken | null => {
  const openIdx = remainder.indexOf('<')
  if (openIdx === -1) return null
  return closedToken(remainder, openIdx)
}

export const tokenizeTemplate = (template: string): readonly TemplateToken[] => {
  const tokens: TemplateToken[] = []
  let remainder = template
  let token = nextToken(remainder)
  while (token !== null) {
    tokens.push(token)
    remainder = token.rest
    token = nextToken(remainder)
  }
  return tokens
}

export interface OutlineRow<Row> {
  readonly row: Row
  readonly title: string
}

type JsTypeof =
  | 'undefined'
  | 'object'
  | 'boolean'
  | 'number'
  | 'bigint'
  | 'string'
  | 'symbol'
  | 'function'

const stringifyObjectValue = (value: unknown): string => {
  if (value === null) return 'null'
  return JSON.stringify(value)
}

const stringifyByType: Record<JsTypeof, (value: unknown) => string> = {
  undefined: () => 'undefined',
  boolean: (value) => String(value),
  number: (value) => String(value),
  bigint: (value) => String(value),
  string: (value) => String(value),
  symbol: (value) => String(value),
  function: (value) => Function.prototype.toString.call(value),
  object: stringifyObjectValue,
}

export const stringifyForTitle = (value: unknown): string => stringifyByType[typeof value](value)

const replaceTags = (
  template: string,
  row: Record<string, unknown>,
  stringify: (value: unknown) => string,
): string => {
  let result = template
  for (const [key, value] of Object.entries(row)) {
    result = result.replaceAll(`<${key}>`, stringify(value))
  }
  return result
}

export const renderTitle = (
  template: string,
  row: Record<string, unknown>,
  stringify: (value: unknown) => string = stringifyForTitle,
): string => replaceTags(template, row, stringify)

const formatAvailableKeys = (rowKeys: Set<string>): string => {
  const joined = [...rowKeys].join(', ')
  if (joined === '') return '(none)'
  return joined
}

const validateRowTags = (
  row: Record<string, unknown>,
  index: number,
  tags: readonly TemplateToken[],
): Result.Result<void, string> => {
  const rowKeys = new Set(Object.keys(row))
  const missing = tags.map((token) => token.tag).find((tag) => rowKeys.has(tag) === false)
  if (missing === undefined) return Result.succeed(undefined)
  return Result.fail(
    `scenarioOutline: template tag <${missing}> has no matching row key` +
      ` on row ${index} (available: ${formatAvailableKeys(rowKeys)})`,
  )
}

const firstRowFailure = (
  results: readonly Result.Result<void, string>[],
): Result.Result<void, string> => {
  const failed = results.find(Result.isFailure)
  if (failed === undefined) return Result.succeed(undefined)
  return failed
}

const expandRows = <Row extends Record<string, unknown>>(
  name: string,
  rows: readonly Row[],
  stringify: (value: unknown) => string,
): Result.Result<readonly OutlineRow<Row>[], string> =>
  Result.map(
    firstRowFailure(rows.map((row, index) => validateRowTags(row, index, tokenizeTemplate(name)))),
    () => rows.map((row) => ({ row, title: renderTitle(name, row, stringify) })),
  )

const expandNonEmpty = <Row extends Record<string, unknown>>(
  name: string,
  rows: readonly Row[],
  stringify: (value: unknown) => string,
): Result.Result<readonly OutlineRow<Row>[], string> => {
  if (rows.length === 0) return Result.succeed([])
  return expandRows(name, rows, stringify)
}

export const expandOutline = <Row extends Record<string, unknown>>(
  name: string,
  rows: readonly Row[],
  stringify: (value: unknown) => string = stringifyForTitle,
): Result.Result<readonly OutlineRow<Row>[], string> => expandNonEmpty(name, rows, stringify)
