import * as S from 'effect/Schema'

/**
 * The compiler returned a diagnostic without a file name. The checker cannot
 * attribute it to a mutant and the run should be failed rather than silently
 * marking every mutant as a compile error.
 */
export class DiagnosticWithoutFileError extends S.TaggedError<DiagnosticWithoutFileError>()(
  'DiagnosticWithoutFileError',
  {
    text: S.String,
  },
) {}

/**
 * The compiler reported a diagnostic in a file that is not part of the
 * project graph built from the tsconfig. This indicates a graph or FS
 * mismatch and must be surfaced as a checker failure rather than ignored.
 */
export class DiagnosticInUnrelatedFileError extends S.TaggedError<DiagnosticInUnrelatedFileError>()(
  'DiagnosticInUnrelatedFileError',
  {
    text: S.String,
    fileName: S.String,
  },
) {}
