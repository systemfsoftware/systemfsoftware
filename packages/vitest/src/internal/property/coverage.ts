/**
 * @internal The R14 coverage classes: labelled input predicates, each with a minimum share of runs.
 *
 * A class fails only when QuickCheck's sequential test (`stdConfidence`) is confident its share is below
 * the minimum, and is satisfied once the test is confident the share is at least 0.9 of the minimum
 * (`TOLERANCE` at a certainty of 10^9). The tolerance is what makes the test terminate: a class sitting
 * exactly at its minimum would otherwise draw forever.
 */
import * as Data from 'effect/Data'

const CERTAINTY = 10 ** 9
const TOLERANCE = 0.9
const FIRST_BATCH = 64
const BATCH_CAP = 4096
const DRAW_CAP = 100000
const FAILURE_HEAD = 'coverage'

/** The certainty's two-sided tail probability: `alpha / 2` for `alpha = 1 / CERTAINTY`. */
const TAIL_PROBABILITY = 1 / (2 * CERTAINTY)

const C1 = -7.784894002430293e-3
const C2 = -3.223964580411365e-1
const C3 = -2.400758277161838e0
const C4 = -2.549732539343734e0
const C5 = 4.374664141464968e0
const C6 = 2.938163982698783e0

const D1 = 7.784695709041462e-3
const D2 = 3.224671290700398e-1
const D3 = 2.445134137142996e0
const D4 = 3.754408661907416e0

const TAIL_NUMERATOR: ReadonlyArray<number> = [C1, C2, C3, C4, C5, C6]
const TAIL_DENOMINATOR: ReadonlyArray<number> = [D1, D2, D3, D4]

/** Horner's rule over a coefficient list, highest power first. */
const poly = (coefficients: ReadonlyArray<number>, x: number): number =>
  coefficients.reduceRight((total, coefficient) => total * x + coefficient, 0)

// https://web.archive.org/web/20151110137102/http://home.online.no/~pjacklam/notes/invnorm/
const tailSpread = (p: number): number => Math.sqrt(-2 * Math.log(p))

const tailInverse = (spread: number): number => poly(TAIL_NUMERATOR, spread) / poly(TAIL_DENOMINATOR, spread)

/** The inverse standard-normal CDF at the tail probability the certainty asks for. */
const TAIL_Z = tailInverse(tailSpread(TAIL_PROBABILITY))

// https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
const wilson = (hits: number, runs: number, z: number): number => {
  const share = hits / runs
  const zz = z * z
  return (share + zz / (2 * runs) + z * Math.sqrt(share * (1 - share) / runs + zz / (4 * runs * runs))) /
    (1 + zz / runs)
}

/**
 * Thrown when a coverage class is confidently below its minimum share of runs.
 *
 * @internal
 */
export class CoverageBelowMinimum extends Data.Error<{
  readonly message: string
}> {}

/**
 * One coverage class: runs that satisfied its label, and the minimum share they must reach.
 *
 * @internal
 */
export interface CoverageClass {
  readonly hits: number
  readonly minimum: number
}

/**
 * The coverage classes a property declared, by label.
 *
 * @internal
 */
export interface CoverageClasses {
  readonly [label: string]: CoverageClass
}

/**
 * Draws more inputs once the holding run left a class undecided.
 *
 * @internal
 */
export interface CoverageDraw {
  /** Draws `count` inputs; each entry lists the labels the drawn input satisfied. */
  readonly more: (count: number) => ReadonlyArray<ReadonlyArray<string>>
}

interface CoverageJudge {
  readonly classes: Map<string, CoverageClass>
  readonly runs: number
}

const wilsonLower = (entry: CoverageClass, runs: number): number => wilson(entry.hits, runs, -TAIL_Z)

const wilsonUpper = (entry: CoverageClass, runs: number): number => wilson(entry.hits, runs, TAIL_Z)

const covered = (entry: CoverageClass, runs: number): boolean => wilsonLower(entry, runs) >= TOLERANCE * entry.minimum

const uncovered = (entry: CoverageClass, runs: number): boolean => wilsonUpper(entry, runs) < entry.minimum

const decided = (entry: CoverageClass, runs: number): boolean => covered(entry, runs) || uncovered(entry, runs)

const settled = (entry: CoverageClass, runs: number): boolean => runs === 0 ? false : decided(entry, runs)

const entriesOf = (classes: CoverageClasses): ReadonlyArray<readonly [string, CoverageClass]> =>
  Object.keys(classes).map((label) => entryAt(classes, label))

const entryAt = (
  classes: CoverageClasses,
  label: string,
): readonly [string, CoverageClass] => [label, classOf(classes, label)]

const classOf = (classes: CoverageClasses, label: string): CoverageClass => classes[label] ?? { hits: 0, minimum: 0 }

const judgeOf = (classes: CoverageClasses, runs: number): CoverageJudge => ({
  classes: new Map(entriesOf(classes)),
  runs,
})

const openLabels = (judge: CoverageJudge): ReadonlyArray<string> =>
  [...judge.classes].filter(([, entry]) => !settled(entry, judge.runs)).map(([label]) => label)

const failedEntries = (judge: CoverageJudge): ReadonlyArray<readonly [string, CoverageClass]> =>
  [...judge.classes].filter(([, entry]) => uncovered(entry, judge.runs))

const describeShare = (hits: number, runs: number): string => `${String(hits)}/${String(runs)}`

const describeFailure = (label: string, entry: CoverageClass, runs: number): string =>
  `${FAILURE_HEAD} ${label}: ${describeShare(entry.hits, runs)} of runs, below the required ${String(entry.minimum)}`

const reportFailures = (judge: CoverageJudge): string =>
  failedEntries(judge).map(([label, entry]) => describeFailure(label, entry, judge.runs)).join('\n')

const countHit = (classes: Map<string, CoverageClass>, label: string): void => {
  const prior = classes.get(label)
  if (prior !== undefined) classes.set(label, { hits: prior.hits + 1, minimum: prior.minimum })
}

const countLabels = (
  classes: Map<string, CoverageClass>,
  labels: ReadonlyArray<string>,
): Map<string, CoverageClass> => {
  for (const label of labels) countHit(classes, label)
  return classes
}

const countDraws = (
  classes: Map<string, CoverageClass>,
  drawn: ReadonlyArray<ReadonlyArray<string>>,
): Map<string, CoverageClass> => drawn.reduce(countLabels, new Map(classes))

const withDraws = (judge: CoverageJudge, drawn: ReadonlyArray<ReadonlyArray<string>>): CoverageJudge => ({
  classes: countDraws(judge.classes, drawn),
  runs: judge.runs + drawn.length,
})

const drawBatch = (judge: CoverageJudge, draw: CoverageDraw, batch: number): CoverageJudge =>
  withDraws(judge, draw.more(sizeOf(judge, batch)))

const sizeOf = (judge: CoverageJudge, batch: number): number => Math.min(batch, DRAW_CAP - judge.runs)

const grown = (batch: number): number => Math.min(batch * 2, BATCH_CAP)

const keepDrawing = (judge: CoverageJudge): boolean => openLabels(judge).length > 0 && judge.runs < DRAW_CAP

const toppedUp = (judge: CoverageJudge, draw: CoverageDraw, batch: number): CoverageJudge =>
  keepDrawing(judge) ? toppedUp(drawBatch(judge, draw, batch), draw, grown(batch)) : judge

const reportOf = (judge: CoverageJudge): string | undefined =>
  failedEntries(judge).length === 0 ? undefined : reportFailures(judge)

/**
 * Runs R14's sequential draw: tops up the undecided classes until every class is decided or the draw cap
 * is reached, then reports the confidently under-covered classes, naming each label and its observed share.
 *
 * @internal
 */
export const judgeCoverage = (
  options: {
    readonly classes: CoverageClasses
    readonly runs: number
    readonly draw: CoverageDraw
  },
): string | undefined => reportOf(toppedUp(judgeOf(options.classes, options.runs), options.draw, FIRST_BATCH))
