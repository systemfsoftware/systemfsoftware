import * as S from 'effect/Schema'

/**
 * The mutant shape the admission carries, named once because both the decision's
 * `Admitted` payload and the command's precomputed survivor list are the same shape.
 */
export const MutantShape = S.Struct({
  id: S.String,
  fileName: S.String,
  mutatorName: S.String,
  replacement: S.String,
  location: S.Struct({
    start: S.Struct({ line: S.Finite, column: S.Finite }),
    end: S.Struct({ line: S.Finite, column: S.Finite }),
  }),
})

/**
 * The prior report as a document, decoded at the boundary. Module-internal: consumers
 * get the decode function, not the schema, so the report's wire shape is not a
 * surface commitment and the codec has exactly one caller.
 *
 * `status` is a bare string rather than the closed status set on purpose: the decide only
 * compares it to `'Survived'`, so a report written by a newer engine that added a status
 * must not be refused for carrying one.
 */
export const PriorReportDocument = S.Struct({
  config: S.optional(S.Record(S.String, S.Unknown)),
  framework: S.optional(S.Struct({ version: S.optional(S.String) })),
  files: S.Record(
    S.String,
    S.Struct({
      source: S.String,
      mutants: S.Array(S.Struct({
        id: S.String,
        mutatorName: S.String,
        replacement: S.optional(S.String),
        status: S.String,
        location: S.Struct({
          start: S.Struct({ line: S.Finite, column: S.Finite }),
          end: S.Struct({ line: S.Finite, column: S.Finite }),
        }),
      })),
    }),
  ),
})
