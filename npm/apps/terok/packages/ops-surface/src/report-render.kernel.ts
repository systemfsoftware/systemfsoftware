/**
 * Domain-blind report formatting for the operations surface. Knows nothing of
 * checks, scopes, or panics — it aligns labels and stamps markers, which is
 * the part of OPS-SURFACE-07 that is pure layout. Must never import a schema
 * cell.
 */

export type Marker = 'ok' | 'WARN' | 'ERROR'

export interface Row {
  readonly label: string
  readonly marker: Marker
  readonly detail: string
}

/** One line: `<label padded> <marker> (<detail>)` — the marker column is shared across a report. */
export const renderRow = (row: Row, labelWidth: number): string =>
  `${row.label.padEnd(labelWidth)} ${row.marker} (${row.detail})`

/** All lines of a report with every marker aligned to the widest label. */
export const renderRows = (rows: readonly Row[]): readonly string[] => {
  const labelWidth = rows.reduce((width, row) => Math.max(width, row.label.length), 0)
  return rows.map((row) => renderRow(row, labelWidth))
}

/** `<key>: <value>` — the panic report line shape (`Containers found: 1`, `Vault: …`). */
export const renderKeyValue = (key: string, value: string): string => `${key}: ${value}`
