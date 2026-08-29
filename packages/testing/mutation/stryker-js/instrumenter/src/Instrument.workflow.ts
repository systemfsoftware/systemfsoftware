/**
 * Instrument.workflow — pure decision for the instrument capability.
 *
 * The heavy lifting (AST traversal, mutant collection, code generation)
 * happens in `Instrument.ts`'s read phase, which is allowed to be stateful.
 * This decision receives the already-collected mutants as data and wraps them
 * into the decision type. All helpers and schemas live in this file so the
 * decision body only reaches parameters, const locals, same-file declarations,
 * and the sealed pure effect surface.
 */
import { Wire, Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class InstrumentError
  extends S.TaggedError<InstrumentError>('@systemfsoftware/stryker-js-instrumenter/InstrumentError')(
    'InstrumentError',
    {
      message: S.String,
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    if (this.message.length === 0) {
      return 'Instrumenter failure'
    }
    return this.message
  }
}

const PositionSchema = S.Struct({
  line: S.Finite,
  column: S.Finite,
})

const RangeSchema = S.Struct({
  start: PositionSchema,
  end: PositionSchema,
})

export const MutateDescriptionSchema = S.Union([S.Boolean, S.Array(RangeSchema)])

export const FileSchema = S.Struct({
  name: S.String,
  content: S.String,
  mutate: MutateDescriptionSchema,
})

// IgnorerService is a runtime plugin service, not a serializable schema
const IgnorerSchema = Wire.mint(S.Unknown)
// AST shapes are external data from the read phase, not declared here
const AstSchema = Wire.mint(S.Unknown)

const InstrumenterOptionsSchema = Wire.wire({
  excludedMutations: Wire.mint(S.Array(Wire.mint(S.String))),
  ignorers: Wire.mint(S.Array(IgnorerSchema)),
  noHeader: Wire.mint(S.optional(Wire.mint(S.Boolean))),
})

export type InstrumenterOptions = typeof InstrumenterOptionsSchema.Type

export class InstrumentCommand extends S.TaggedClass<InstrumentCommand>()('InstrumentCommand', {
  files: S.Array(FileSchema),
  options: InstrumenterOptionsSchema,
}) {}

export class InstrumentDecoded extends S.TaggedClass<InstrumentDecoded>()('InstrumentDecoded', {
  files: S.Array(FileSchema),
  options: InstrumenterOptionsSchema,
  asts: S.Array(AstSchema),
  mutants: S.Array(Mutant),
}) {}

export class InstrumentDecision extends S.TaggedClass<InstrumentDecision>()('InstrumentDecision', {
  files: S.Array(FileSchema),
  mutants: S.Array(Mutant),
  asts: S.Array(AstSchema),
}) {}

export class InstrumentResult extends S.TaggedClass<InstrumentResult>()('InstrumentResult', {
  files: S.Array(FileSchema),
  mutants: S.Array(Mutant),
}) {}

export const instrumentWorkflow = Workflow.make(
  InstrumentDecoded,
  (decoded: InstrumentDecoded): Result.Result<InstrumentDecision, InstrumentError> =>
    Result.succeed(
      InstrumentDecision.make({
        files: decoded.files,
        mutants: decoded.mutants,
        asts: decoded.asts,
      }),
    ),
)
