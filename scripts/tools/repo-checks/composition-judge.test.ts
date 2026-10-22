import { assert, assertAlmostEquals, assertEquals } from '@std/assert'
import {
  type Case,
  checkCompositionCalibrate,
  goldOf,
  KAPPAS_FILE,
  readCases,
  readRatings,
  shapesOf,
} from './composition-calibrate.ts'
import {
  buildPrompt,
  cohenKappa,
  combine,
  DEFAULT_MODELS,
  evidencePaths,
  fingerprintOf,
  JUDGED_RULES,
  type Label,
  type MemberVerdict,
  parseJudgement,
  RUBRICS,
} from './composition-judge.ts'

const member = (verdict: Label): MemberVerdict => ({ model: 'm', evidence: ['e'], verdict, confidence: 1 })

Deno.test('Should_RequireEveryPanelMemberToAgree_When_CombiningVerdicts', () => {
  assertEquals(combine([member('violated'), member('violated')]), 'violated')
  assertEquals(combine([member('holds'), member('holds')]), 'holds')
  assertEquals(combine([member('violated'), member('holds')]), 'uncertain')
  assertEquals(combine([member('violated'), member('uncertain')]), 'uncertain')
  assertEquals(combine([]), 'uncertain')
})

Deno.test('Should_TreatAMalformedOrUncitedAnswerAsUncertain_When_ParsingTheJudge', () => {
  assertEquals(parseJudgement('{"evidence":["a=1"],"verdict":"violated","confidence":0.9}').verdict, 'violated')
  assertEquals(
    parseJudgement('Sure!\n```json\n{"evidence":["a=1"],"verdict":"holds","confidence":2}\n```').confidence,
    1,
  )
  assertEquals(parseJudgement('{"evidence":[],"verdict":"violated","confidence":1}').verdict, 'uncertain')
  assertEquals(parseJudgement('{"evidence":["a"],"verdict":"maybe","confidence":1}').verdict, 'uncertain')
  assertEquals(parseJudgement('not json').verdict, 'uncertain')
  assertEquals(parseJudgement('{"evidence":["a"],').verdict, 'uncertain')
})

Deno.test('Should_ComputeCohensKappa_When_ComparingLabelsToPredictions', () => {
  const agree: [Label, Label][] = [['holds', 'holds'], ['violated', 'violated'], ['holds', 'holds'], [
    'violated',
    'violated',
  ]]
  assertEquals(cohenKappa(agree), 1)
  // 2x2 table: 20 holds/holds, 5 holds/violated, 10 violated/holds, 15 violated/violated -> po 0.7, pe 0.5, kappa 0.4.
  const table: [Label, Label][] = [
    ...Array<[Label, Label]>(20).fill(['holds', 'holds']),
    ...Array<[Label, Label]>(5).fill(['holds', 'violated']),
    ...Array<[Label, Label]>(10).fill(['violated', 'holds']),
    ...Array<[Label, Label]>(15).fill(['violated', 'violated']),
  ]
  assertAlmostEquals(cohenKappa(table), 0.4, 1e-9)
  assertEquals(cohenKappa([['holds', 'uncertain'], ['violated', 'uncertain']]), 0)
  assertEquals(cohenKappa([]), 0)
})

Deno.test('Should_GiveEveryRuleOneCriterionPerLineAndWrittenEdgeCases_When_BuildingThePrompt', () => {
  for (const rule of JUDGED_RULES) {
    const rubric = RUBRICS[rule]
    assert(rubric.criteria.length >= 4 && rubric.edgeCases.length >= 2, rule)
    const prompt = buildPrompt(rule, { a: 1 })
    for (const line of [...rubric.criteria, ...rubric.edgeCases]) assert(prompt.user.includes(line), line)
    assert(prompt.user.includes('"a": 1'))
  }
})

Deno.test('Should_HaveEightLabelledCasesPerRuleFromRealRepositories_When_ReadingTheCalibrationSet', async () => {
  const cases = await readCases()
  for (const rule of JUDGED_RULES) {
    const own = cases.filter((c) => c.rule === rule)
    assert(own.length >= 8, `${rule} has ${own.length} cases`)
    assert(own.some((c) => c.label === 'holds') && own.some((c) => c.label === 'violated'), rule)
    for (const c of own) assert(c.source.length > 0 && typeof c.evidence === 'object', c.id)
  }
  const ids = cases.map((c) => c.id)
  assertEquals(new Set(ids).size, ids.length)
  const named = (rule: string, needle: string, label: string) =>
    assert(cases.some((c) => c.rule === rule && c.source.includes(needle) && c.label === label), `${rule} ${needle}`)
  named('entries-are-roles', '@younna/platform', 'violated')
  named('entries-are-roles', '@tanstack/query-core', 'holds')
  named('entries-are-roles', ' vitest', 'holds')
  named('test-only-exports', '@younna/platform ./vault/laws', 'violated')
})

Deno.test('Should_ReproduceTheRecordedKappas_When_ReplayingTheCalibrationSet', async () => {
  const verdict = await checkCompositionCalibrate({ live: false, record: false, write: false })
  assertEquals(verdict._tag, 'Holds')
  const summary = verdict._tag === 'Holds' ? verdict.summary : ''
  const kappas = JSON.parse(await Deno.readTextFile(KAPPAS_FILE)) as Record<
    string,
    { kappa: number; fingerprint: string }
  >
  for (const rule of JUDGED_RULES) {
    const line = summary.split('\n').find((l) => l.startsWith(`${rule}:`))
    assert(line !== undefined, rule)
    assert(line.includes(`kappa ${kappas[rule]!.kappa.toFixed(2)}`), `${line} vs ${kappas[rule]!.kappa}`)
    assertEquals(
      kappas[rule]!.fingerprint,
      await fingerprintOf(rule, DEFAULT_MODELS, shapesOf(await readCases())[rule]),
      `${rule}: kappas.json is stale for the rubric, the models or the evidence shape`,
    )
  }
})

// ------------------------------------------------ what the calibration set is made of

interface TestOnlyEvidence {
  readonly published: boolean
  readonly isRoot: boolean
  readonly workspaceDependents: readonly unknown[]
  readonly entryKey: string
}
interface GranularityEvidence {
  readonly dependents: readonly unknown[]
  readonly published: boolean
}

Deno.test('Should_NotLetOneEvidenceFieldSeparateTheLabels_When_ReadingTheCalibrationSet', async () => {
  // Review: every test-only `holds` case was published or a root and every `violated` one private and not root, so
  // kappa measured the rubric's first criterion and not judgement. Each such cut must now misclassify real cases.
  const cases = await readCases()
  const testOnly = cases.filter((c) => c.rule === 'test-only-exports')
  const ev = (c: Case) => c.evidence as TestOnlyEvidence
  const surface = (c: Case) => ev(c).published || ev(c).isRoot
  assert(
    testOnly.some((c) => c.label === 'holds' && !surface(c)),
    'a private non-root entry that holds (a ./testing role)',
  )
  assert(
    testOnly.some((c) => c.label === 'violated' && surface(c)),
    'a published entry that is exported only for tests',
  )
  assert(
    testOnly.some((c) => c.label === 'holds' && !ev(c).published && c.source.includes('./testing')),
    'the private ./testing role the brief names',
  )
  const granularity = cases.filter((c) => c.rule === 'granularity')
  const dependents = (c: Case) => (c.evidence as GranularityEvidence).dependents.length
  assert(
    granularity.some((c) => c.label === 'holds' && dependents(c) <= 1),
    'a library with at most one dependent that holds',
  )
  assert(
    granularity.some((c) =>
      c.label === 'holds' && dependents(c) === 0 && !(c.evidence as GranularityEvidence).published
    ),
    'a private tool with no dependents that holds',
  )
  assert(
    granularity.some((c) => c.label === 'violated' && (c.evidence as GranularityEvidence).published),
    'a published library that violates',
  )
  // core-adapter-split has no published violation among the real repositories read, which is one reason it stays
  // report-only (kappa below 0.7); the three rules that may fail CI must span published and private on both labels.
  for (const rule of JUDGED_RULES.filter((r) => r !== 'core-adapter-split')) {
    const own = cases.filter((c) => c.rule === rule)
    const published = (c: Case) => (c.evidence as { published?: boolean }).published === true
    for (const label of ['holds', 'violated'] as const) {
      const byLabel = own.filter((c) => c.label === label)
      assert(
        byLabel.some(published) && byLabel.some((c) => !published(c)),
        `${rule}: ${label} cases are both published and private`,
      )
    }
  }
})

Deno.test('Should_MakeAContestedCaseGoldUncertain_When_TheBlindSecondRaterDisagrees', async () => {
  const cases = await readCases()
  const ratings = await readRatings()
  assert(ratings.length >= cases.length, 'every case is rated blind by a second rater')
  assert(ratings.every((r) => r.model.length > 0))
  const [a, b] = cases
  const gold = goldOf([a!, b!], [
    { id: a!.id, label: a!.label, model: 'm' },
    { id: b!.id, label: b!.label === 'holds' ? 'violated' : 'holds', model: 'm' },
  ])
  assertEquals(gold.get(a!.id), a!.label)
  assertEquals(gold.get(b!.id), 'uncertain')
})

Deno.test('Should_FoldArraysAndSkipUndefined_When_ListingEvidencePaths', () => {
  assertEquals(evidencePaths({ a: 1, b: [{ c: 1 }, { d: 2 }], e: undefined }), ['.a', '.b', '.b[].c', '.b[].d'])
})
