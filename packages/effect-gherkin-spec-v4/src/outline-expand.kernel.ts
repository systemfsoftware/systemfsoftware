import * as Result from 'effect/Result'

export type TemplateToken = { tag: string; rest: string }

export const tokenizeTemplate = (template: string): readonly TemplateToken[] => {
  const tokens: TemplateToken[] = []
  let remainder = template
  while (remainder.length > 0) {
    const openIdx = remainder.indexOf('<')
    if (openIdx === -1) break
    const closeIdx = remainder.indexOf('>', openIdx)
    if (closeIdx === -1) break
    const tag = remainder.slice(openIdx + 1, closeIdx)
    const rest = remainder.slice(closeIdx + 1)
    tokens.push({ tag, rest })
    remainder = rest
  }
  return tokens
}

export interface OutlineRow<Row> {
  readonly row: Row
  readonly title: string
}

export const stringifyForTitle = (value: unknown): string => {
  if (typeof value === 'undefined') return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'symbol') return value.toString()
  if (typeof value === 'function') return Function.prototype.toString.call(value)
  const encoded = JSON.stringify(value)
  if (encoded === void 0) {
    return 'unknown'
  }
  return encoded
}

export const renderTitle = (
  template: string,
  row: Record<string, unknown>,
  stringify: (value: unknown) => string = stringifyForTitle,
): string => {
  let result = template
  for (const [key, value] of Object.entries(row)) {
    result = result.replaceAll(`<${key}>`, stringify(value))
  }
  return result
}

export const expandOutline = <Row extends Record<string, unknown>>(
  name: string,
  rows: readonly Row[],
  stringify: (value: unknown) => string = stringifyForTitle,
): Result.Result<readonly OutlineRow<Row>[], string> => {
  if (rows.length === 0) return Result.succeed([])

  const templateTokens = tokenizeTemplate(name)
  if (templateTokens.length > 0) {
    for (const [index, row] of rows.entries()) {
      const rowKeys = new Set(Object.keys(row))
      for (const { tag } of templateTokens) {
        if (!rowKeys.has(tag)) {
          return Result.fail(
            `scenarioOutline: template tag <${tag}> has no matching row key` +
              ` on row ${index} (available: ${[...rowKeys].join(', ') || '(none)'})`,
          )
        }
      }
    }
  }

  return Result.succeed(rows.map((row) => ({ row, title: renderTitle(name, row, stringify) })))
}
