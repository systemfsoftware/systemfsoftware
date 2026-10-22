// Judges the judge. calibration/cases.jsonl holds labelled cases for every judged rule, each a real unit from a real
// repository with the evidence our own fact extractor produced for it (the same shape the checks send the panel).
// `repo-checks composition-calibrate` runs the panel over them and reports agreement with the labels as Cohen's
// kappa per rule. A judged rule may fail CI only when its kappa is at least 0.7 (composition-judge.ts).
//
//   composition-calibrate            replay the recorded model responses (deterministic, offline)
//   composition-calibrate --live     ask the models now (needs OPENROUTER_API_KEY), record nothing
//   composition-calibrate --record   ask the models now and replace calibration/recorded.jsonl
//   composition-calibrate --write    also write calibration/kappas.json, which the gates read
import { dirname, fromFileUrl, join } from '@std/path'
import {
  type Calibration,
  cohenKappa,
  DEFAULT_MODELS,
  fingerprintOf,
  type Judge,
  JUDGED_RULES,
  type JudgedRule,
  KAPPA_TO_GATE,
  type Kappas,
  type Label,
  makeJudge,
  openRouterTransport,
  parseRecorded,
  recordKey,
  replayTransport,
  type Request,
  shapeOf,
  type Transport,
} from './composition-judge.ts'
import { holds, Undecided, type Verdict } from './verdict.ts'

const CALIBRATION_DIR = join(dirname(fromFileUrl(import.meta.url)), 'calibration')
export const CASES_FILE = join(CALIBRATION_DIR, 'cases.jsonl')
export const RECORDED_FILE = join(CALIBRATION_DIR, 'recorded.jsonl')
export const KAPPAS_FILE = join(CALIBRATION_DIR, 'kappas.json')
export const RATER_FILE = join(CALIBRATION_DIR, 'second-rater.jsonl')
export const MIN_CASES = 8

export interface Case {
  readonly rule: JudgedRule
  readonly id: string
  /** The real repository and unit the evidence was extracted from. */
  readonly source: string
  /** The author's label. A case the second rater labelled differently is gold `uncertain`: the raters could not agree. */
  readonly label: Label
  readonly why: string
  readonly evidence: unknown
}

export const readCases = async (path = CASES_FILE): Promise<readonly Case[]> =>
  (await Deno.readTextFile(path)).split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Case)

/** A second, blind labelling of the same cases by a model that never saw the first labels or the rubric. */
export interface Rating {
  readonly id: string
  readonly label: Label
  readonly model: string
}

export const readRatings = async (path = RATER_FILE): Promise<readonly Rating[]> => {
  try {
    return (await Deno.readTextFile(path)).split('\n').filter((l) => l.trim() !== '').map((l) =>
      JSON.parse(l) as Rating
    )
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return []
    throw cause
  }
}

/** Gold labels: the author's label where the second rater agrees or did not rate, `uncertain` where they disagree. */
export const goldOf = (cases: readonly Case[], ratings: readonly Rating[]): ReadonlyMap<string, Label> => {
  const second = new Map(ratings.map((r) => [r.id, r.label]))
  return new Map(cases.map((c) => {
    const other = second.get(c.id)
    return [c.id, other === undefined || other === c.label ? c.label : 'uncertain'] as const
  }))
}

/** The shape of the evidence each rule's cases carry, which the calibration is bound to. */
export const shapesOf = (cases: readonly Case[]): Readonly<Record<JudgedRule, string>> =>
  Object.fromEntries(
    JUDGED_RULES.map((rule) => [rule, shapeOf(cases.filter((c) => c.rule === rule).map((c) => c.evidence))]),
  ) as Record<JudgedRule, string>

export const modelsFromEnv = (): readonly string[] => {
  const configured = Deno.env.get('REPO_CHECKS_JUDGE_MODELS')
  return configured === undefined || configured.trim() === ''
    ? DEFAULT_MODELS
    : configured.split(',').map((m) => m.trim())
}

const readKappas = async (): Promise<Kappas> => {
  try {
    return JSON.parse(await Deno.readTextFile(KAPPAS_FILE)) as Kappas
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return {}
    throw cause
  }
}

/** The judge the checks use: OpenRouter when OPENROUTER_API_KEY is set, else none (judged rules then only report). */
export const loadJudge = async (): Promise<Judge | undefined> => {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (key === undefined || key === '') return undefined
  return await makeJudge(openRouterTransport(key), modelsFromEnv(), await readKappas(), shapesOf(await readCases()))
}

export interface RuleReport {
  readonly rule: JudgedRule
  readonly cases: number
  readonly agreement: number
  readonly kappa: number
  /** Cohen's kappa between the author's labels and the blind second rater's, over the cases both labelled. */
  readonly raterKappa: number | undefined
  readonly confusion: Readonly<Record<string, number>>
  readonly misses: readonly string[]
}

export const calibrate = async (
  cases: readonly Case[],
  transport: Transport,
  models: readonly string[],
  ratings: readonly Rating[] = [],
): Promise<readonly RuleReport[]> => {
  const judge = await makeJudge(transport, models, {}, shapesOf(cases))
  const gold = goldOf(cases, ratings)
  const reports: RuleReport[] = []
  for (const rule of JUDGED_RULES) {
    const own = cases.filter((c) => c.rule === rule)
    const pairs: (readonly [Label, Label])[] = []
    const confusion: Record<string, number> = {}
    const misses: string[] = []
    for (let i = 0; i < own.length; i += 4) {
      const batch = own.slice(i, i + 4)
      const verdicts = await Promise.all(batch.map((c) => judge.decide(rule, c.evidence)))
      batch.forEach((c, j) => {
        const predicted = verdicts[j]!.verdict
        const label = gold.get(c.id)!
        pairs.push([label, predicted])
        confusion[`${label}->${predicted}`] = (confusion[`${label}->${predicted}`] ?? 0) + 1
        if (predicted !== label) misses.push(`${c.id}: labelled ${label}, panel ${predicted}`)
      })
    }
    const rated = own.flatMap((c) => {
      const other = ratings.find((r) => r.id === c.id)
      return other === undefined ? [] : [[c.label, other.label] as const]
    })
    reports.push({
      rule,
      raterKappa: rated.length === 0 ? undefined : cohenKappa(rated),
      cases: own.length,
      agreement: pairs.length === 0 ? 0 : pairs.filter(([a, b]) => a === b).length / pairs.length,
      kappa: cohenKappa(pairs),
      confusion,
      misses,
    })
  }
  return reports
}

export const checkCompositionCalibrate = async (
  flags: { readonly live: boolean; readonly record: boolean; readonly write: boolean },
): Promise<Verdict> => {
  const cases = await readCases()
  const models = modelsFromEnv()
  const short = JUDGED_RULES.filter((rule) => cases.filter((c) => c.rule === rule).length < MIN_CASES)
  if (short.length > 0) {
    throw new Undecided(`calibration needs at least ${MIN_CASES} labelled cases per rule; short: ${short.join(', ')}`)
  }
  let transport: Transport
  const recorded: { key: string; model: string; response: string }[] = []
  if (flags.live || flags.record) {
    const key = Deno.env.get('OPENROUTER_API_KEY')
    if (key === undefined || key === '') throw new Undecided('--live and --record need OPENROUTER_API_KEY')
    const live = openRouterTransport(key)
    transport = async (request: Request) => {
      const response = await live(request)
      recorded.push({ key: await recordKey(request), model: request.model, response })
      return response
    }
  } else {
    transport = replayTransport(parseRecorded(await Deno.readTextFile(RECORDED_FILE)))
  }
  const ratings = await readRatings()
  const reports = await calibrate(cases, transport, models, ratings)
  const shapes = shapesOf(cases)
  if (flags.record) {
    await Deno.writeTextFile(RECORDED_FILE, recorded.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  if (flags.write) {
    const kappas: Partial<Record<JudgedRule, Calibration>> = {}
    for (const r of reports) {
      kappas[r.rule] = {
        kappa: Number(r.kappa.toFixed(3)),
        cases: r.cases,
        fingerprint: await fingerprintOf(r.rule, models, shapes[r.rule]),
      }
    }
    await Deno.writeTextFile(KAPPAS_FILE, JSON.stringify(kappas, null, 2) + '\n')
  }
  const lines = reports.map((r) =>
    `${r.rule}: kappa ${r.kappa.toFixed(2)} (${r.cases} cases, ${(r.agreement * 100).toFixed(0)}% agreement) ${
      r.kappa >= KAPPA_TO_GATE ? 'may fail CI' : `below ${KAPPA_TO_GATE}: reports only`
    }${r.raterKappa === undefined ? '' : `; labels vs blind second rater kappa ${r.raterKappa.toFixed(2)}`}`
  )
  const detail = reports.flatMap((r) => r.misses.map((m) => `  miss ${r.rule} ${m}`))
  return holds([`panel ${models.join(' + ')}`, ...lines, ...detail].join('\n'))
}
