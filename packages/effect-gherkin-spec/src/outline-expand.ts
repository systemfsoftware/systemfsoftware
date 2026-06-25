export type TemplateToken = { tag: string; rest: string }

export const tokenizeTemplate = (template: string): ReadonlyArray<TemplateToken> => {
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
  if (typeof value === 'undefined') {
    throw new Error('outline: cannot stringify undefined for title interpolation')
  }
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return JSON.stringify(value)
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
  rows: ReadonlyArray<Row>,
  stringify: (value: unknown) => string = stringifyForTitle,
): ReadonlyArray<OutlineRow<Row>> => {
  if (rows.length === 0) return []

  const templateTokens = tokenizeTemplate(name)
  const [firstRow] = rows
  if (templateTokens.length > 0 && firstRow !== void 0) {
    const rowKeys = new Set(Object.keys(firstRow))
    for (const { tag } of templateTokens) {
      if (!rowKeys.has(tag)) {
        throw new Error(
          `scenarioOutline: template tag <${tag}> has no matching row key` +
            ` (available: ${[...rowKeys].join(', ') || '(none)'})`,
        )
      }
    }
  }

  return rows.map((row) => ({ row, title: renderTitle(name, row, stringify) }))
}
