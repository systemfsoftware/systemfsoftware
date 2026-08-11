import { it } from '@effect/vitest'
import { Schema as S } from 'effect'

import { renderKeyValue, renderRow, renderRows } from '../report-render.kernel.js'

const RowSchema = S.Struct({
  label: S.String,
  marker: S.Literal('ok', 'WARN', 'ERROR'),
  detail: S.String,
})

/** The key-value line is exactly `<key>: <value>`. */
it.prop(
  '∀kv_RenderKeyValue_=Joined',
  [S.String, S.String],
  ([key, value]) => renderKeyValue(key, value) === `${key}: ${value}`,
)

/** One row is the label padded to the column width, then the marker and the parenthesised detail. */
it.prop(
  '∀r_RenderRow_≡Joined',
  [RowSchema, S.Int.pipe(S.between(0, 64))],
  ([row, width]) => renderRow(row, width) === `${row.label.padEnd(width)} ${row.marker} (${row.detail})`,
)

/** Every line of a report carries its own row, with all markers aligned to the widest label. */
it.prop('∀rs_RenderRows_=Aligned', [S.Array(RowSchema)], ([rows]) => {
  const labelWidth = rows.reduce((width, row) => Math.max(width, row.label.length), 0)
  const lines = renderRows(rows)
  return lines.length === rows.length &&
    lines.every((line, index) => {
      const row = rows[index]
      return row !== undefined && line === `${row.label.padEnd(labelWidth)} ${row.marker} (${row.detail})`
    })
})
