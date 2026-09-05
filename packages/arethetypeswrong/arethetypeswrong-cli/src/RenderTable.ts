export type Cell = string

export const cellWidth = (cell: Cell): number => visibleWidth(cell)

const visibleWidth = (s: string): number => {
  let w = 0
  for (const ch of s) {
    if (ch === '\u001b') {
      // ANSI escape — skip until 'm'
      continue
    }
    w += 1
  }
  return w
}

export const computeColumnWidths = (
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<Cell>>,
): ReadonlyArray<number> => {
  const widths = header.map((h) => cellWidth(h))
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i] ?? ''
      const w = cellWidth(cell)
      if (w > (widths[i] ?? 0)) {
        widths[i] = w
      }
    }
  }
  return widths
}

const renderCell = (cell: Cell, width: number): string => cell.padEnd(width)

export const renderTable = (
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<Cell>>,
  gap: number = 2,
): string => {
  if (header.length === 0) return ''
  const widths = computeColumnWidths(header, rows)
  const gapText = ' '.repeat(gap)
  const renderRow = (cells: ReadonlyArray<Cell>): string => {
    const parts: Array<string> = []
    for (let i = 0; i < cells.length; i++) {
      if (i > 0) parts.push(gapText)
      parts.push(renderCell(cells[i] ?? '', widths[i] ?? 0))
    }
    return parts.join('')
  }
  const headerRow = renderRow(header)
  const dataRows = rows.map(renderRow)
  return [headerRow, ...dataRows].join('\n')
}

export const renderFlippedTable = (
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<Cell>>,
  gap: number = 2,
): string => {
  if (header.length === 0) return ''
  if (rows.length === 0) return header.join('\n')
  const numCols = rows[0]?.length ?? 0
  if (numCols === 0) return header.join('\n')
  const transposed: Array<ReadonlyArray<Cell>> = []
  for (let col = 0; col < numCols; col++) {
    const newRow: Cell[] = []
    for (const row of rows) {
      newRow.push(row[col] ?? '')
    }
    newRow.unshift(header[col] ?? '')
    transposed.push(newRow)
  }
  return renderTable(transposed[0] ?? [], transposed.slice(1), gap)
}
