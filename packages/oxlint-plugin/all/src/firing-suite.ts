import { readFileSync } from 'node:fs'
import { RuleTester } from 'oxlint/plugins-dev'

import allDist from '@systemfsoftware/all'
import cellVocabularyDist from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import effectSchemaDist from '@systemfsoftware/oxlint-plugin-effect-schema'
import propertyTestingDist from '@systemfsoftware/oxlint-plugin-property-testing'

import { decideAll, loadManifest, pluginRootOf, shortNameOf } from './firing-corpus.js'
import type { DecidedRule, RuleManifest } from './firing-corpus.js'

type DistRule = Parameters<RuleTester['run']>[1]

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const isDistRule = (value: unknown): value is DistRule => isRecord(value) && typeof value['create'] === 'function'

const fieldOf = (dist: unknown, path: string, field: string): unknown => {
  if (!isRecord(dist)) {
    throw new Error(`firing suite expected ${path} to export an object`)
  }
  return dist[field]
}

const rulesOf = (dist: unknown, path: string): Readonly<Record<string, unknown>> => {
  const rules = fieldOf(dist, path, 'rules')
  if (!isRecord(rules)) {
    throw new Error(`firing suite cannot read rules off ${path}`)
  }
  return rules
}

const recommendedOf = (dist: unknown, path: string): Readonly<Record<string, unknown>> => {
  const configs = fieldOf(dist, path, 'configs')
  if (!isRecord(configs)) {
    throw new Error(`firing suite cannot read configs off ${path}`)
  }
  const recommended = fieldOf(configs, `${path} configs`, 'recommended')
  if (!isRecord(recommended)) {
    throw new Error(`firing suite cannot read recommended off ${path}`)
  }
  const rules = fieldOf(recommended, `${path} recommended`, 'rules')
  if (!isRecord(rules)) {
    throw new Error(`firing suite cannot read recommended rules off ${path}`)
  }
  return rules
}

const ruleImplOf = (dist: unknown, path: string, key: string): DistRule => {
  const rule = rulesOf(dist, path)[key]
  if (!isDistRule(rule)) {
    throw new Error(
      `firing suite cannot find rule '${key}' in ${path} (a stale dist hides a registered rule)`,
    )
  }
  return rule
}

RuleTester.describe = (_text: string, fn: () => void): void => {
  fn()
}
RuleTester.it = (_text: string, fn: () => void): void => {
  fn()
}
RuleTester.itOnly = (_text: string, fn: () => void): void => {
  fn()
}

const schemaTester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } })
const cellTester = new RuleTester()
const propertyTester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } })

const testerOf = (tester: RuleManifest['tester']): RuleTester => {
  if (tester === 'schema') {
    return schemaTester
  }
  if (tester === 'cell') {
    return cellTester
  }
  return propertyTester
}

let passed = 0
const failed: string[] = []

const check = (name: string, fn: () => void): void => {
  try {
    fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    failed.push(name)
    console.log(`not ok - ${name}`)
    const wrapped = error instanceof Error ? error : new Error('a non-Error value was thrown', { cause: error })
    console.log(wrapped.stack ?? wrapped.message)
  }
}

const distPathOf = (specifier: string): string => {
  const resolved = import.meta.resolve(specifier)
  if (!resolved.includes('/dist/')) {
    throw new Error(
      `firing suite resolved ${specifier} outside dist: ${resolved} (the source condition must stay absent so workspace resolution picks dist like a consumer toolchain)`,
    )
  }
  return resolved
}

const manifest = loadManifest(import.meta.url)
const root = pluginRootOf(import.meta.url)

const publishedRules = rulesOf(allDist, '@systemfsoftware/all')
const leafRecommended: Record<string, unknown> = {
  ...recommendedOf(effectSchemaDist, '@systemfsoftware/oxlint-plugin-effect-schema'),
  ...recommendedOf(cellVocabularyDist, '@systemfsoftware/oxlint-plugin-cell-vocabulary'),
  ...recommendedOf(propertyTestingDist, '@systemfsoftware/oxlint-plugin-property-testing'),
}
const distByOwner: Record<string, unknown> = {
  '@systemfsoftware/oxlint-plugin-effect-schema': effectSchemaDist,
  '@systemfsoftware/oxlint-plugin-cell-vocabulary': cellVocabularyDist,
  '@systemfsoftware/oxlint-plugin-property-testing': propertyTestingDist,
}

for (
  const specifier of [
    '@systemfsoftware/all',
    '@systemfsoftware/oxlint-plugin-effect-schema',
    '@systemfsoftware/oxlint-plugin-cell-vocabulary',
    '@systemfsoftware/oxlint-plugin-property-testing',
  ]
) {
  check(`resolution: ${specifier} resolves through dist`, () => {
    console.log(`  ${specifier} -> ${distPathOf(specifier)}`)
  })
}

check('manifest: the corpus covers exactly the five program rules', () => {
  const names = manifest.map((entry) => entry.shortName)
  const expected = [
    'schema-bare-primitive-field',
    'schema-brand-requires-filter',
    'no-sequenced-cell-run',
    'no-laundered-cell-service',
    'no-ignored-draw',
  ]
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`manifest covers [${names.join(', ')}], expected [${expected.join(', ')}]`)
  }
})

const decided: readonly DecidedRule[] = decideAll(manifest, publishedRules, leafRecommended)

for (const entry of decided) {
  check(`cross-pin: ${entry.manifest.shortName} corpus matches its RuleTester suite`, () => {
    const text = readFileSync(`${root}/${entry.manifest.suitePath}`, 'utf8')
    const flat = text.replace(/\s+/g, '')
    if (!flat.includes(`from'${entry.manifest.corpusSpecifier}'`)) {
      throw new Error(`suite never imports ${entry.manifest.corpusSpecifier}`)
    }
    if (!new RegExp(entry.manifest.invalidPattern).test(flat)) {
      throw new Error(`suite invalid cases diverged from the corpus for ${entry.manifest.shortName}`)
    }
    const names: string[] = []
    for (const corpusCase of entry.manifest.cases) {
      if (corpusCase.name === undefined) {
        throw new Error('a corpus entry without a name cannot be cross-pinned')
      }
      names.push(corpusCase.name)
    }
    if (names.length === 0) {
      throw new Error('the corpus is empty, so the cross-pin proves nothing')
    }
    if (new Set(names).size !== names.length) {
      throw new Error('corpus names are not unique')
    }
  })
}

for (const entry of decided) {
  check(`carriage: ${entry.manifest.shortName}`, () => {
    if (entry.decision === 'erasure') {
      throw new Error(entry.reason)
    }
    console.log(`  ${entry.decision} — ${entry.reason}`)
  })
}

for (const entry of decided) {
  if (entry.decision === 'erasure') {
    continue
  }
  let impl: DistRule | undefined = undefined
  check(`dist: ${entry.manifest.shortName} implementation ships`, () => {
    impl = ruleImplOf(distByOwner[entry.manifest.ownerPackage], entry.manifest.ownerPackage, entry.manifest.distRuleKey)
  })
  const current = impl
  if (current === undefined) {
    continue
  }
  for (const corpusCase of entry.manifest.cases) {
    check(`fires: ${entry.manifest.shortName} / ${corpusCase.name ?? '(unnamed case)'}`, () => {
      testerOf(entry.manifest.tester).run(entry.manifest.shortName, current, {
        valid: [],
        invalid: [corpusCase],
      })
    })
  }
}

check('negative: removing an enrolled rule erases its gate', () => {
  const victims = Object.keys(publishedRules).filter((key) => shortNameOf(key) === 'no-ignored-draw')
  if (victims.length !== 1) {
    throw new Error(`expected exactly one published key for no-ignored-draw, found ${victims.length}`)
  }
  const victim = victims[0]
  if (victim === undefined) {
    throw new Error('expected exactly one published key for no-ignored-draw')
  }
  const minus: Record<string, unknown> = { ...publishedRules }
  delete minus[victim]
  const reprobed = decideAll(manifest, minus, leafRecommended)
  const target = reprobed.find((other) => other.manifest.shortName === 'no-ignored-draw')
  if (target === undefined) {
    throw new Error('the negative probe lost the no-ignored-draw entry')
  }
  if (target.decision !== 'erasure') {
    throw new Error('removing the published entry did not erase the gate: the suite cannot catch silent deregistration')
  }
  const before = new Map(decided.map((other) => [other.manifest.shortName, other.decision] as const))
  for (const other of reprobed) {
    if (other.manifest.shortName === 'no-ignored-draw') {
      continue
    }
    if (other.decision !== before.get(other.manifest.shortName)) {
      throw new Error(`removing no-ignored-draw changed ${other.manifest.shortName}`)
    }
  }
})

console.log(`\nfiring suite: ${String(passed)} passed, ${String(failed.length)} failed`)
if (failed.length > 0) {
  console.log(`failed: ${failed.join(', ')}`)
  process.exitCode = 1
}
