import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Schema from 'effect/Schema'

export class PrintReport extends Schema.TaggedClass<PrintReport, { readonly brand: unique symbol }>()('PrintReport', {
  lines: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
}) {
  static readonly [Workflow.InstrumentationBrand] = { lines: 'tests.report.lines' } as const
}
