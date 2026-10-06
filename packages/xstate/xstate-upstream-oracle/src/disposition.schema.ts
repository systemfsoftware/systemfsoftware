import { Schema } from 'effect'

/** The three modes a held case can be declared in (KTD5.6). */
export const CaseMode = Schema.Literals(['passed', 'skipped', 'todo'])
export type CaseMode = typeof CaseMode.Type

/** One upstream case the lane must hold, by its assigned key. */
export class HeldCase extends Schema.TaggedClass<HeldCase>()('HeldCase', {
  key: Schema.String,
  mode: CaseMode,
}) {}

/** One upstream case retired by a ruling, with the fork-owned test that replaces it (R4). */
export class RetiredCase extends Schema.TaggedClass<RetiredCase>()('RetiredCase', {
  file: Schema.String,
  package: Schema.String,
  replacementFile: Schema.String,
  reason: Schema.String,
}) {}

/** The U3 parity target, one row per upstream package (KTD5.6). */
export class ParityRow extends Schema.TaggedClass<ParityRow>()('ParityRow', {
  package: Schema.String,
  files: Schema.Finite,
  passed: Schema.Finite,
  skipped: Schema.Finite,
  todo: Schema.Finite,
}) {}

/** `disposition.json`: every case held by default, retirements Kiro-ruled (R4). */
export const Disposition = Schema.Struct({
  version: Schema.Literal(1),
  held: Schema.Array(HeldCase),
  retired: Schema.Array(RetiredCase),
  parity: Schema.Array(ParityRow),
})
export type Disposition = typeof Disposition.Type
