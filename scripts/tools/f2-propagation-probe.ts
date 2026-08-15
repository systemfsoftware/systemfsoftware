#!/usr/bin/env -S deno run --allow-read=packages/effect-cell-types/src --allow-write=packages/effect-cell-types/src
// F2 propagation probe, both halves. Each mode makes one change entirely inside the description
// module and nowhere else, so a run measures which files that change forces content edits in.
//
//   --phase  (default)  authors one real sixth phase: a second pure validation over the decoded
//                       value with the fatal `either-fail` convention. Not a no-op — it runs, it
//                       can fail, and its `Left` reaches the derived error channel.
//   --io                reclassifies the I/O-cell axis by admitting one more cell.
//
// `--revert` reverses whichever mode is named, and restores `src/Cell.ts` byte-for-byte **provided
// the formatter runs on both sides**: `dprint fmt` rewrites the applied text, so a revert without
// it leaves the reformatted hunks behind. The probe is an experiment and never a feature.
//
//   deno run --allow-read=packages/effect-cell-types/src --allow-write=packages/effect-cell-types/src \
//     scripts/tools/f2-propagation-probe.ts [--io] [--revert]
//   pnpm exec dprint fmt

const CELL = new URL('../../packages/effect-cell-types/src/Cell.ts', import.meta.url)

/** One directed replacement. Reverting a mode applies its pairs in reverse with the sides swapped. */
interface Swap {
  readonly from: string
  readonly to: string
  readonly label: string
}

const insertion = (anchor: string, added: string, label: string): Swap => ({
  from: anchor,
  to: `${anchor}${added}`,
  label,
})

const PHASE_SWAPS: readonly Swap[] = [
  insertion(
    `export type DecodePhase<P extends Phases> = (
  raw: P['raw'],
) => Either.Either<P['decoded'], P['decodeError']>
`,
    `
/**
 * A second validation over the already-decoded value. Its \`Left\` is fatal, exactly like
 * \`decode\`'s, so the two share one convention and a consumer cannot tell them apart by it.
 */
export type ValidatePhase<P extends Phases> = (
  decoded: P['decoded'],
) => Either.Either<P['decoded'], P['decodeError']>
`,
    'validate closure type',
  ),
  insertion(
    `export type Phase<P extends Phases> =
  | ReadNode<P>
  | DecodeNode<P>
`,
    `  | ValidateNode<P>
`,
    'phase union member',
  ),
  insertion(
    `export interface DecodeDone<P extends Phases> extends Description<P> {
  readonly 'call decode(raw) before decide(decoded)': true
}
`,
    `
/** The stage a \`validate\` writes: it admits \`decide\`, exactly as \`decode\` does. */
export interface ValidateDone<P extends Phases> extends Description<P> {
  readonly 'call decode(raw) before decide(decoded)': true
}
`,
    'validate stage brand',
  ),
  {
    from: `export interface DecideNode<P extends Phases> {`,
    to: `export interface ValidateNode<P extends Phases> {
  readonly name: 'validate'
  readonly kind: 'pure'
  readonly convention: 'either-fail'
  readonly run: ValidatePhase<P>
}
export interface DecideNode<P extends Phases> {`,
    label: 'validate node record',
  },
  {
    from: `export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (previous: DecodeDone<P>) => DecideDone<P>
  <P extends Phases>(previous: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(2, <P extends Phases>(previous: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P> => ({`,
    to: `export const validate: {
  <P extends Phases>(run: ValidatePhase<P>): (previous: DecodeDone<P>) => ValidateDone<P>
  <P extends Phases>(previous: DecodeDone<P>, run: ValidatePhase<P>): ValidateDone<P>
} = dual(2, <P extends Phases>(previous: DecodeDone<P>, run: ValidatePhase<P>): ValidateDone<P> => ({
  ...intoOpenLayer(previous, { name: 'validate', kind: 'pure', convention: 'either-fail', run }),
}))

export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (previous: DecodeDone<P> | ValidateDone<P>) => DecideDone<P>
  <P extends Phases>(previous: DecodeDone<P> | ValidateDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(
  2,
  <P extends Phases>(previous: DecodeDone<P> | ValidateDone<P>, run: DecidePhase<P>): DecideDone<P> => ({`,
    label: 'validate constructor and widened decide',
  },
  {
    from: `  ...intoOpenLayer(previous, { name: 'decide', kind: 'pure', convention: 'either-pass', run }),
}))
`,
    to: `    ...intoOpenLayer(previous, { name: 'decide', kind: 'pure', convention: 'either-pass', run }),
  }),
)
`,
    label: 'decide tail',
  },
  {
    from: `      decode(read<Phases>(() => Effect.succeed(undefined)), () => Either.right(undefined)),`,
    to: `      validate(
        decode(read<Phases>(() => Effect.succeed(undefined)), () => Either.right(undefined)),
        () => Either.right(undefined),
      ),`,
    label: 'canonical chain',
  },
]

/**
 * The I/O half. One more cell whose calls are I/O — the axis every consumer reads off the walk,
 * and the one a lint rule turns into a forbidden-call set.
 */
const IO_SWAPS: readonly Swap[] = [
  {
    from: `  cells: ['store', 'adapter'],`,
    to: `  cells: ['store', 'adapter', 'cache'],`,
    label: 'io-cell classification',
  },
]

/**
 * Every anchor is checked before it is used. An unchecked `String.replace` that misses silently
 * no-ops while its siblings still apply, which leaves a half-patched module and an exit 0 — the
 * one failure mode a probe must not have, because the measurement it feeds would be of a state
 * nobody authored.
 */
const swap = (source: string, { from, to, label }: Swap, reverting: boolean): string => {
  const [find, add] = reverting ? [to, from] : [from, to]
  if (!source.includes(find)) throw new Error(`f2-probe: anchor drifted, ${label} not found:\n${find}`)
  return source.replace(find, add)
}

const reverting = Deno.args.includes('--revert')
const io = Deno.args.includes('--io')
const swaps = io ? IO_SWAPS : PHASE_SWAPS
const ordered = reverting ? [...swaps].reverse() : swaps

const source = await Deno.readTextFile(CELL)
const next = ordered.reduce((acc, one) => swap(acc, one, reverting), source)
if (next === source) {
  console.error(`f2-probe: nothing to ${reverting ? 'revert' : 'apply'} — is it already in that state?`)
  Deno.exit(1)
}
await Deno.writeTextFile(CELL, next)
console.log(
  `f2-probe: ${reverting ? 'reverted' : 'applied'} the ${
    io ? 'I/O reclassification' : 'sixth phase'
  }; every edit is inside src/Cell.ts`,
)
