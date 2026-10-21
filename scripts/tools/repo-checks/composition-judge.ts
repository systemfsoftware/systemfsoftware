// The judge of the composition gates' judgement rules. A rule that asks "is this entry a legitimate role?" or
// "should this library split?" has no compiler answer, so it is decided by a rubric judge, never by a pattern.
//
// The judge never reads source. It receives FACTS the compiler and the exports resolver already established
// (composition-facts.ts), serialised as JSON evidence, plus a per-rule rubric: one criterion per line, edge
// cases written out. It answers evidence first: the facts it cites, then holds | violated | uncertain, then a
// confidence. Two members of a panel (two models) must agree on `violated`; disagreement is `uncertain`, and
// `uncertain` never fails CI: it is reported for a human.
//
// A judged rule may FAIL a check only while its measured agreement with labelled cases (Cohen's kappa over
// calibration/*.jsonl, written by `repo-checks composition-calibrate`) is at least 0.7 for the current rubric
// and models. Below that, or with a stale calibration, it only reports.
const encodeHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

export type JudgedRule = 'entries-are-roles' | 'test-only-exports' | 'granularity' | 'core-adapter-split'
export const JUDGED_RULES: readonly JudgedRule[] = [
  'entries-are-roles',
  'test-only-exports',
  'granularity',
  'core-adapter-split',
]
export type Label = 'holds' | 'violated' | 'uncertain'
export const KAPPA_TO_GATE = 0.7

export interface Rubric {
  readonly question: string
  readonly criteria: readonly string[]
  readonly edgeCases: readonly string[]
}

export const RUBRICS: Readonly<Record<JudgedRule, Rubric>> = {
  'entries-are-roles': {
    question:
      "Does this library's exports map expose a root entry plus a few named roles, or does it mirror its source folder tree? `violated` means it mirrors the tree or exposes internals.",
    criteria: [
      'A role entry names a capability a consumer chooses, such as ./server, ./react, ./schema or ./testing; its key is not a source folder or file path.',
      'An entry whose key repeats its source path nested two or more folders deep (mirrorsFolderTree true) mirrors the tree.',
      'An entry whose key is the name of one source file or one internal module, often with a kind suffix such as .schema, .service or .api, is a file, not a role.',
      'When most entries mirror the tree or are files, the library violates the rule however few or many entries it has.',
      'Many entries that are mostly one per source file or folder violate the rule.',
      'A root "." entry alone, or "." plus a handful of role entries, holds.',
      'A library with more entries than roleEntryGuide holds when each entry is a distinct named role (a runtime, a framework binding, an environment, a testing surface); the count alone is never a violation, it is a reason to read the keys.',
    ],
    edgeCases: [
      'Targets under dist, build, lib or out are build output: judge the key and the sourceTarget, never the build path.',
      'Several conditions on one key (source, types, import, default) are one entry, not several.',
      './package.json and "./internal/*": null are not entries.',
      'A ./testing or ./test-utils entry is a legitimate role.',
      'A wildcard key such as "./*" that maps a whole folder exposes the tree: violated for a private library, uncertain for a published one.',
      'When entriesShown is smaller than entryCount, judge the shown entries and the counts together.',
    ],
  },
  'test-only-exports': {
    question:
      'This export entry is imported by test files in the workspace and by no non-test file. Is the entry legitimate, or is it exported only so a test can reach it? `violated` means exported only for tests.',
    criteria: [
      'A published library (published true) has consumers outside this workspace, so an entry with no workspace source importer still holds, unless the key names itself internal (a segment such as internal or _internal): an exposed internal is violated even when published.',
      'The root entry "." of a library holds, private or published: a leaf library has no workspace dependents because it is the bottom of the graph, and its tests import it as a consumer would.',
      'An entry named as test support, ./testing, ./test-utils or ./test-*, holds: it exists to serve tests.',
      'A private library entry that reaches one internal file or deep folder path and is imported only by tests violates the rule, whether or not other code could reach it.',
      'An entry whose targets are not code (targetExtensions such as .css or .json) is an asset a bundler or page reads by path: whether it is exported only for tests is not settled by imports, so it is uncertain.',
      'When another entry of the same library is already used by non-test code and this entry is not a role, an entry used only by tests violates the rule.',
    ],
    edgeCases: [
      'workspaceDependents lists packages that import this library from non-test code at all; an empty list with isRoot true means a leaf.',
      'An entry that is a role by its name (./server, ./schema) but is private and unused by source holds when it has a plausible external audience, such as an application contract, and violates when it is a deep file path.',
      'A test importing a private library from another package is evidence the entry is shared test support only when the key says so; otherwise it violates.',
    ],
  },
  'granularity': {
    question:
      'Is this library the right size: neither a library to merge into its only consumer or into a library it always changes with, nor one to split because consumers use disjoint halves? `violated` means it should be merged or split.',
    criteria: [
      'A private library with exactly one dependent and no reuse should be merged into its consumer: violated.',
      'Two libraries changed together in more than 80% of their recent commits (coChangedWith) should be merged: violated.',
      'A library whose dependents use disjoint sets of its entries, with at least two entries, should be split by consumer: violated.',
      'A published library with one workspace dependent holds: its other consumers are outside the workspace.',
      'A library with two or more dependents that all use the same entries and no strong co-change holds.',
      'A library with zero dependents that is private is unused: violated; one that is published holds.',
      'A library with zero dependents that has a bin or a deploy config (bin, deployConfigs), or that is run through its own scripts (scriptNames such as dev, start, serve, journey or e2e), is run and not imported: it holds however few dependents it has.',
      'A package with no source files (sourceFileCount 0) is configuration or data read by path: nothing to split or merge, it holds.',
    ],
    edgeCases: [
      'A single dependent that is an application and a library that is the contracts package between two applications holds when role is contracts.',
      'coChangedWith with fewer than 10 commits compared is not evidence.',
      'A dependent with importsIt false declares the library without importing it: a toolchain or tool use, which is reuse; it counts as a dependent.',
      'A library that is the only provider of a service layer to a single application still violates when private and unshared, unless it is a contracts package.',
    ],
  },
  'core-adapter-split': {
    question:
      'This library is not marked as a core library and its source imports runtime or framework modules. Should it be split into a runtime-neutral core and per-runtime adapters? `violated` means runtime-bound code is mixed into code that should be neutral.',
    criteria: [
      'A library whose whole purpose is one runtime or framework (a React binding, a Cloudflare Worker helper, a Node platform package) holds: it is the adapter.',
      'A library where only a few files import runtime modules while most files are runtime-neutral, and the library has dependents of more than one runtime, violates the rule: split core from adapter.',
      'A library whose runtime imports are in every source file holds: there is no neutral core to extract.',
      'Runtime choice expressed as export conditions (workerd, node, browser, bun, deno) on one entry holds: the conditions are the adapter seam.',
      'A library with no runtime imports is not a candidate and holds.',
    ],
    edgeCases: [
      'Type-only imports are erased and do not count; runtimeImports lists value imports only.',
      'A test-support library may import its test runner without being a split candidate.',
      'filesWithRuntimeImports over sourceFileCount of 0.5 or more with a single runtime module is an adapter by purpose.',
    ],
  },
}

export const rubricText = (rule: JudgedRule): string => {
  const rubric = RUBRICS[rule]
  return [
    `Rule: ${rule}`,
    `Question: ${rubric.question}`,
    'Criteria (one per line):',
    ...rubric.criteria.map((c, i) => `${i + 1}. ${c}`),
    'Edge cases:',
    ...rubric.edgeCases.map((c, i) => `E${i + 1}. ${c}`),
  ].join('\n')
}

const SYSTEM = [
  'You judge one rule of a monorepo composition standard.',
  'You receive FACTS produced by the TypeScript compiler and the package.json exports resolver. The facts are true; do not doubt them and do not invent others.',
  'Judge only what the rubric asks. Do not prefer a verdict because the evidence is long, and do not prefer a verdict by its position in the list.',
  'Answer with one JSON object and nothing else, keys in this order:',
  '{"evidence": [<each a fact you rely on, as "path=value" copied from the facts>], "verdict": "holds" | "violated" | "uncertain", "confidence": <number 0..1>}',
  'Cite the evidence before you decide. Use "uncertain" when the facts do not settle the rubric.',
].join('\n')

export interface Prompt {
  readonly system: string
  readonly user: string
}

export const buildPrompt = (rule: JudgedRule, evidence: unknown): Prompt => ({
  system: SYSTEM,
  user: `${rubricText(rule)}\n\nFacts:\n${JSON.stringify(evidence, null, 1)}`,
})

export interface Judgement {
  readonly evidence: readonly string[]
  readonly verdict: Label
  readonly confidence: number
}

/** Parses the judge's answer; an answer that is not the requested shape, or a verdict with no cited fact, is `uncertain`. */
export const parseJudgement = (text: string): Judgement => {
  const uncertain = (why: string): Judgement => ({ evidence: [why], verdict: 'uncertain', confidence: 0 })
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open < 0 || close < open) return uncertain('no JSON object in the answer')
  let value: unknown
  try {
    value = JSON.parse(text.slice(open, close + 1))
  } catch {
    return uncertain('the answer is not valid JSON')
  }
  if (typeof value !== 'object' || value === null) return uncertain('the answer is not an object')
  const record = value as Record<string, unknown>
  const verdict = record['verdict']
  const evidence = Array.isArray(record['evidence'])
    ? record['evidence'].filter((e): e is string => typeof e === 'string')
    : []
  const confidence = typeof record['confidence'] === 'number' ? Math.min(1, Math.max(0, record['confidence'])) : 0
  if (verdict !== 'holds' && verdict !== 'violated' && verdict !== 'uncertain') {
    return uncertain('the verdict is not holds, violated or uncertain')
  }
  if (verdict !== 'uncertain' && evidence.length === 0) return uncertain('a verdict without cited evidence')
  return { evidence, verdict, confidence }
}

// ---------------------------------------------------------------- transports

export interface Request {
  readonly model: string
  readonly system: string
  readonly user: string
}

/** Sends a prompt to a model and returns its text. Failures throw. */
export type Transport = (request: Request) => Promise<string>

export const recordKey = async ({ model, system, user }: Request): Promise<string> =>
  encodeHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${model}\u0000${system}\u0000${user}`)))

export const sha256 = async (text: string): Promise<string> =>
  encodeHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

export const openRouterTransport = (apiKey: string): Transport => async (request) => {
  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: request.model,
          temperature: 0,
          // Some judge models reason whether asked or not (Gemini cannot turn it off): a low effort and room to answer after it.
          max_tokens: 8000,
          reasoning: { effort: 'low' },
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }],
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status} ${(await response.text()).slice(0, 160)}`
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break
        continue
      }
      const body = await response.json() as { choices?: { message?: { content?: string } }[] }
      const content = body.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.length > 0) return content
      lastError = 'empty completion'
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause)
    }
  }
  throw new Error(`${request.model}: ${lastError}`)
}

/** Answers from responses recorded earlier from the real models (calibration/recorded.jsonl), keyed by the exact prompt. */
export const replayTransport = (recorded: ReadonlyMap<string, string>): Transport => async (request) => {
  const text = recorded.get(await recordKey(request))
  if (text === undefined) {
    throw new Error(`no recorded response for ${request.model}; re-record with composition-calibrate --record`)
  }
  return text
}

export const parseRecorded = (jsonl: string): ReadonlyMap<string, string> => {
  const map = new Map<string, string>()
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue
    const row = JSON.parse(line) as { key: string; response: string }
    map.set(row.key, row.response)
  }
  return map
}

// --------------------------------------------------------------------- panel

export interface MemberVerdict extends Judgement {
  readonly model: string
}

export interface PanelVerdict {
  readonly verdict: Label
  readonly members: readonly MemberVerdict[]
}

/** `violated` and `holds` each need every member to agree; anything else is `uncertain`. */
export const combine = (members: readonly MemberVerdict[]): Label => {
  const first = members[0]?.verdict
  if (first === undefined || first === 'uncertain') return 'uncertain'
  return members.every((m) => m.verdict === first) ? first : 'uncertain'
}

export const judgePanel = async (
  transport: Transport,
  models: readonly string[],
  rule: JudgedRule,
  evidence: unknown,
): Promise<PanelVerdict> => {
  const prompt = buildPrompt(rule, evidence)
  const members = await Promise.all(models.map(async (model): Promise<MemberVerdict> => {
    try {
      return { model, ...parseJudgement(await transport({ model, ...prompt })) }
    } catch (cause) {
      return {
        model,
        evidence: [cause instanceof Error ? cause.message : String(cause)],
        verdict: 'uncertain',
        confidence: 0,
      }
    }
  }))
  return { verdict: combine(members), members }
}

// --------------------------------------------------------------------- kappa

/** Cohen's kappa of two labelings over the labels holds, violated and uncertain. 1 is perfect agreement, 0 is chance. */
export const cohenKappa = (pairs: readonly (readonly [Label, Label])[]): number => {
  if (pairs.length === 0) return 0
  const labels: readonly Label[] = ['holds', 'violated', 'uncertain']
  const n = pairs.length
  const observed = pairs.filter(([a, b]) => a === b).length / n
  const expected = labels.reduce((sum, label) => {
    const a = pairs.filter(([x]) => x === label).length / n
    const b = pairs.filter(([, y]) => y === label).length / n
    return sum + a * b
  }, 0)
  return expected === 1 ? (observed === 1 ? 1 : 0) : (observed - expected) / (1 - expected)
}

// ---------------------------------------------------------------------- judge

export interface Calibration {
  readonly kappa: number
  readonly cases: number
  readonly fingerprint: string
}

export type Kappas = Readonly<Partial<Record<JudgedRule, Calibration>>>

export interface Judge {
  readonly models: readonly string[]
  decide(rule: JudgedRule, evidence: unknown): Promise<PanelVerdict>
  /** Whether a `violated` verdict of this rule may fail CI, and why not. */
  gate(rule: JudgedRule): { readonly fails: boolean; readonly note: string }
}

/** What a calibration is only valid for: the rubric text and the panel's models. */
export const fingerprintOf = (rule: JudgedRule, models: readonly string[], shape: string): Promise<string> =>
  sha256(`${rubricText(rule)}\u0000${SYSTEM}\u0000${models.join(',')}\u0000${shape}`)

/** Every field path of an evidence object, arrays folded to `[]`: the shape of what the fact extractor emits. */
export const evidencePaths = (evidence: unknown, prefix = ''): readonly string[] => {
  if (Array.isArray(evidence)) return [...new Set(evidence.flatMap((e) => evidencePaths(e, `${prefix}[]`)))]
  if (typeof evidence === 'object' && evidence !== null) {
    return Object.entries(evidence).filter(([, value]) => value !== undefined).flatMap(([key, value]) => [
      `${prefix}.${key}`,
      ...evidencePaths(value, `${prefix}.${key}`),
    ])
  }
  return []
}

/** The union of the field paths of a set of evidence objects, hashed with the rule: calibration is valid only for this shape. */
export const shapeOf = (evidences: readonly unknown[]): string =>
  [...new Set(evidences.flatMap((e) => evidencePaths(e)))].sort().join('|')

export const makeJudge = async (
  transport: Transport,
  models: readonly string[],
  kappas: Kappas,
  shapes: Readonly<Record<JudgedRule, string>>,
): Promise<Judge> => {
  const fingerprints = new Map<JudgedRule, string>()
  for (const rule of JUDGED_RULES) fingerprints.set(rule, await fingerprintOf(rule, models, shapes[rule]))
  return {
    models,
    decide: (rule, evidence) => judgePanel(transport, models, rule, evidence),
    gate: (rule) => {
      const calibration = kappas[rule]
      if (calibration === undefined) return { fails: false, note: 'not calibrated: reports only' }
      if (calibration.fingerprint !== fingerprints.get(rule)) {
        return { fails: false, note: 'calibration is stale for this rubric or panel: reports only' }
      }
      if (calibration.kappa < KAPPA_TO_GATE) {
        return { fails: false, note: `kappa ${calibration.kappa.toFixed(2)} is below ${KAPPA_TO_GATE}: reports only` }
      }
      return { fails: true, note: `kappa ${calibration.kappa.toFixed(2)} over ${calibration.cases} cases` }
    },
  }
}

export const DEFAULT_MODELS: readonly string[] = ['deepseek/deepseek-v4.1-flash', 'google/gemini-3.8-flash']
