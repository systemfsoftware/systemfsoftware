#!/usr/bin/env -S deno run --allow-read=packages/effect-cell-types/src --allow-write=packages/effect-cell-types/src
// F2 propagation probe, phase-addition half. Authors one real sixth phase — a second pure
// validation over the decoded value, with the fatal `either-fail` convention — entirely inside
// the description module, then reports which files the change forces content edits in.
//
// It is not a no-op phase: it runs, it can fail, and its `Left` reaches the derived error
// channel. `--revert` restores `src/Cell.ts` byte-for-byte **provided the formatter runs on both
// sides**: `dprint fmt` rewrites the applied text, so a revert without it leaves the reformatted
// hunks behind. Measured: apply -> fmt -> revert -> fmt returns sha256 b83f5e2d2033bf29… , the
// pre-probe value. The probe is an experiment and never a feature.
//
//   deno run --allow-read=packages/effect-cell-types/src --allow-write=packages/effect-cell-types/src scripts/tools/f2a-phase-probe.ts [--revert]
//   pnpm exec dprint fmt

const CELL = new URL('../../packages/effect-cell-types/src/Cell.ts', import.meta.url)

/** Each edit names the anchor it follows so a drifted module fails loudly instead of silently. */
const EDITS: readonly { readonly find: string; readonly add: string }[] = [
  {
    find: `export type DecodePhase<P extends Phases> = (
  raw: P['raw'],
) => Either.Either<P['decoded'], P['decodeError']>
`,
    add: `
/**
 * A second validation over the already-decoded value. Its \`Left\` is fatal, exactly like
 * \`decode\`'s, so the two share one convention and a consumer cannot tell them apart by it.
 */
export type ValidatePhase<P extends Phases> = (
  decoded: P['decoded'],
) => Either.Either<P['decoded'], P['decodeError']>
`,
  },
  {
    find: `export interface DecodeNode<P extends Phases> {
  readonly name: 'decode'
  readonly kind: 'pure'
  readonly convention: 'either-fail'
`,
    add: '',
  },
  {
    find: `export type Phase<P extends Phases> =
  | ReadNode<P>
  | DecodeNode<P>
`,
    add: `  | ValidateNode<P>
`,
  },
  {
    find: `export interface DecodeDone<P extends Phases> extends Description<P> {
  readonly 'call decode(raw) before decide(decoded)': true
}
`,
    add: `export interface ValidateDone<P extends Phases> extends Description<P> {
  readonly 'call validate(decoded) before decide(decoded)': true
}
`,
  },
  {
    find: `const DECODE_DONE = 'call decode(raw) before decide(decoded)'
`,
    add: `const VALIDATE_DONE = 'call validate(decoded) before decide(decoded)'
`,
  },
  {
    find: `} = dual(2, <P extends Phases>(previous: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P> => ({
  [DECODE_DONE]: true,
  ...intoOpenLayer(previous, { name: 'decode', kind: 'pure', convention: 'either-fail', run }),
}))
`,
    add: `
export const validate: {
  <P extends Phases>(run: ValidatePhase<P>): (previous: DecodeDone<P>) => ValidateDone<P>
  <P extends Phases>(previous: DecodeDone<P>, run: ValidatePhase<P>): ValidateDone<P>
} = dual(2, <P extends Phases>(previous: DecodeDone<P>, run: ValidatePhase<P>): ValidateDone<P> => ({
  [VALIDATE_DONE]: true,
  ...intoOpenLayer(previous, { name: 'validate', kind: 'pure', convention: 'either-fail', run }),
}))
`,
  },
]

/** The node interface, inserted after `DecodeNode`'s closing brace rather than inside it. */
const NODE_ANCHOR = `export interface DecideNode<P extends Phases> {`
const NODE_ADD = `export interface ValidateNode<P extends Phases> {
  readonly name: 'validate'
  readonly kind: 'pure'
  readonly convention: 'either-fail'
  readonly run: ValidatePhase<P>
}
`

/** `decide` must admit either predecessor: two phases now share one convention. */
const DECIDE_BEFORE = `export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (previous: DecodeDone<P>) => DecideDone<P>
  <P extends Phases>(previous: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(2, <P extends Phases>(previous: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P> => ({`
const DECIDE_AFTER = `export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (previous: DecodeDone<P> | ValidateDone<P>) => DecideDone<P>
  <P extends Phases>(previous: DecodeDone<P> | ValidateDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(
  2,
  <P extends Phases>(previous: DecodeDone<P> | ValidateDone<P>, run: DecidePhase<P>): DecideDone<P> => ({`

const DECIDE_TAIL_BEFORE =
  `  ...intoOpenLayer(previous, { name: 'decide', kind: 'pure', convention: 'either-pass', run }),
}))
`
const DECIDE_TAIL_AFTER =
  `    ...intoOpenLayer(previous, { name: 'decide', kind: 'pure', convention: 'either-pass', run }),
  }),
)
`

/** The canonical chain threads the new phase, which is what makes the walk observe it. */
const CANONICAL_BEFORE = `      decode(read<Phases>(() => Effect.succeed(undefined)), () => Either.right(undefined)),`
const CANONICAL_AFTER = `      validate(
        decode(read<Phases>(() => Effect.succeed(undefined)), () => Either.right(undefined)),
        () => Either.right(undefined),
      ),`

const apply = (source: string): string => {
  let out = source
  for (const { find, add } of EDITS) {
    if (add === '') continue
    if (!out.includes(find)) throw new Error(`f2a-probe: anchor drifted, not found:\n${find}`)
    out = out.replace(find, `${find}${add}`)
  }
  out = out.replace(NODE_ANCHOR, `${NODE_ADD}${NODE_ANCHOR}`)
  out = out.replace(DECIDE_BEFORE, DECIDE_AFTER).replace(DECIDE_TAIL_BEFORE, DECIDE_TAIL_AFTER)
  out = out.replace(CANONICAL_BEFORE, CANONICAL_AFTER)
  return out
}

const revert = (source: string): string => {
  let out = source
  out = out.replace(CANONICAL_AFTER, CANONICAL_BEFORE)
  out = out.replace(DECIDE_TAIL_AFTER, DECIDE_TAIL_BEFORE).replace(DECIDE_AFTER, DECIDE_BEFORE)
  out = out.replace(NODE_ADD, '')
  for (const { find, add } of EDITS) {
    if (add === '') continue
    out = out.replace(`${find}${add}`, find)
  }
  return out
}

const source = await Deno.readTextFile(CELL)
const reverting = Deno.args.includes('--revert')
const next = reverting ? revert(source) : apply(source)
if (next === source) {
  console.error(`f2a-probe: nothing to ${reverting ? 'revert' : 'apply'} — is it already in that state?`)
  Deno.exit(1)
}
await Deno.writeTextFile(CELL, next)
console.log(
  `f2a-probe: ${reverting ? 'reverted' : 'applied'} the sixth phase; every edit is inside src/Cell.ts`,
)
