import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { RuleTester } from 'oxlint/plugins-dev'

import { launderedCellServiceInvalidCases } from '../../oxlint-plugin-cell-vocabulary/src/rules/no-laundered-cell-service.corpus.js'
import { sequencedCellRunInvalidCases } from '../../oxlint-plugin-cell-vocabulary/src/rules/no-sequenced-cell-run.corpus.js'
import { SCHEMA_BARE_PRIMITIVE_FIELD_INVALID } from '../../oxlint-plugin-effect-schema/src/rules/schema-bare-primitive-field.corpus.js'
import { SCHEMA_BRAND_REQUIRES_DECODE_INVALID } from '../../oxlint-plugin-effect-schema/src/rules/schema-brand-requires-decode.corpus.js'
import { NO_IGNORED_DRAW_INVALID } from '../../oxlint-plugin-property-testing/src/rules/no-ignored-draw.corpus.js'

export interface RuleManifest {
  readonly shortName: string
  readonly ownerPackage: string
  readonly distRuleKey: string
  readonly leafRecommendedKey: string
  readonly suitePath: string
  readonly corpusSpecifier: string
  readonly invalidPattern: string
  readonly cases: readonly RuleTester.InvalidTestCase[]
  readonly tester: 'schema' | 'cell' | 'property'
}

export const pluginRootOf = (moduleUrl: string): string => {
  const anchor = 'packages/oxlint-plugin'
  const path = fileURLToPath(moduleUrl)
  const index = path.lastIndexOf(anchor)
  if (index < 0) {
    throw new Error(`firing corpus resolves outside the monorepo: ${path}`)
  }
  return path.slice(0, index + anchor.length)
}

export const cellModuleSpecifierOf = (pluginRoot: string): string => {
  const facts = readFileSync(`${pluginRoot}/../effect-cell-types/src/Facts.ts`, 'utf8')
  const match = /DESCRIPTION_MODULE\s*=\s*['"]([^'"]+)['"]/.exec(facts)
  const specifier = match?.[1]
  if (specifier === undefined || specifier.length === 0) {
    throw new Error('firing corpus cannot read DESCRIPTION_MODULE from effect-cell-types/src/Facts.ts')
  }
  return specifier
}

export const loadManifest = (moduleUrl: string): readonly RuleManifest[] => {
  const root = pluginRootOf(moduleUrl)
  const cellModule = cellModuleSpecifierOf(root)
  return [
    {
      shortName: 'schema-bare-primitive-field',
      ownerPackage: '@systemfsoftware/oxlint-plugin-effect-schema',
      distRuleKey: 'schema-bare-primitive-field',
      leafRecommendedKey: '@systemfsoftware/oxlint-plugin-effect-schema/schema-bare-primitive-field',
      suitePath: 'oxlint-plugin-effect-schema/src/rules/__tests__/schema-bare-primitive-field.test.ts',
      corpusSpecifier: '../schema-bare-primitive-field.corpus.js',
      invalidPattern: 'invalid:\\[\\.\\.\\.SCHEMA_BARE_PRIMITIVE_FIELD_INVALID,?\\]',
      cases: SCHEMA_BARE_PRIMITIVE_FIELD_INVALID,
      tester: 'schema',
    },
    {
      shortName: 'schema-brand-requires-decode',
      ownerPackage: '@systemfsoftware/oxlint-plugin-effect-schema',
      distRuleKey: 'schema-brand-requires-decode',
      leafRecommendedKey: '@systemfsoftware/oxlint-plugin-effect-schema/schema-brand-requires-decode',
      suitePath: 'oxlint-plugin-effect-schema/src/rules/__tests__/schema-brand-requires-decode.test.ts',
      corpusSpecifier: '../schema-brand-requires-decode.corpus.js',
      invalidPattern: 'invalid:SCHEMA_BRAND_REQUIRES_DECODE_INVALID,?\\}',
      cases: SCHEMA_BRAND_REQUIRES_DECODE_INVALID,
      tester: 'schema',
    },
    {
      shortName: 'no-sequenced-cell-run',
      ownerPackage: '@systemfsoftware/oxlint-plugin-cell-vocabulary',
      distRuleKey: 'no-sequenced-cell-run',
      leafRecommendedKey: '@systemfsoftware/oxlint-plugin-cell-vocabulary/no-sequenced-cell-run',
      suitePath: 'oxlint-plugin-cell-vocabulary/src/rules/__tests__/no-sequenced-cell-run.test.ts',
      corpusSpecifier: '../no-sequenced-cell-run.corpus.js',
      invalidPattern: 'invalid:sequencedCellRunInvalidCases\\(Cell\\.vocabulary\\.module\\),?\\}',
      cases: sequencedCellRunInvalidCases(cellModule),
      tester: 'cell',
    },
    {
      shortName: 'no-laundered-cell-service',
      ownerPackage: '@systemfsoftware/oxlint-plugin-cell-vocabulary',
      distRuleKey: 'no-laundered-cell-service',
      leafRecommendedKey: '@systemfsoftware/oxlint-plugin-cell-vocabulary/no-laundered-cell-service',
      suitePath: 'oxlint-plugin-cell-vocabulary/src/rules/__tests__/no-laundered-cell-service.test.ts',
      corpusSpecifier: '../no-laundered-cell-service.corpus.js',
      invalidPattern: 'invalid:launderedCellServiceInvalidCases\\(Cell\\.vocabulary\\.module\\),?\\}',
      cases: launderedCellServiceInvalidCases(cellModule),
      tester: 'cell',
    },
    {
      shortName: 'no-ignored-draw',
      ownerPackage: '@systemfsoftware/oxlint-plugin-property-testing',
      distRuleKey: 'no-ignored-draw',
      leafRecommendedKey: '@systemfsoftware/oxlint-plugin-property-testing/no-ignored-draw',
      suitePath: 'oxlint-plugin-property-testing/src/rules/__tests__/no-ignored-draw.test.ts',
      corpusSpecifier: '../no-ignored-draw.corpus.js',
      invalidPattern: 'invalid:\\[\\.\\.\\.NO_IGNORED_DRAW_INVALID,?\\]',
      cases: NO_IGNORED_DRAW_INVALID,
      tester: 'property',
    },
  ]
}

export type GateDecision = 'fire' | 'pending' | 'erasure'
export interface DecidedRule {
  readonly manifest: RuleManifest
  readonly decision: GateDecision
  readonly reason: string
}

export const shortNameOf = (key: string): string => {
  const parts = key.split('/')
  const last = parts[parts.length - 1]
  if (last === undefined || last.length === 0) {
    throw new Error(`firing corpus cannot read a short name off recommended key '${key}'`)
  }
  return last
}

const isErrorSeverity = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value === 'error'
  }
  if (Array.isArray(value)) {
    return value[0] === 'error'
  }
  return false
}

export const decideAll = (
  manifest: readonly RuleManifest[],
  publishedRules: Readonly<Record<string, unknown>>,
  leafRecommended: Readonly<Record<string, unknown>>,
): readonly DecidedRule[] =>
  manifest.map((entry) => {
    const published = Object.keys(publishedRules).filter(
      (key) => shortNameOf(key) === entry.shortName && isErrorSeverity(publishedRules[key]),
    )
    if (published.length > 0) {
      return {
        manifest: entry,
        decision: 'fire',
        reason: `recommended at error as ${published.join(', ')}`,
      }
    }
    if (isErrorSeverity(leafRecommended[entry.leafRecommendedKey])) {
      return {
        manifest: entry,
        decision: 'erasure',
        reason:
          `the leaf recommends ${entry.leafRecommendedKey} at error but no published recommended entry carries ${entry.shortName}`,
      }
    }
    return {
      manifest: entry,
      decision: 'pending',
      reason:
        `registered but not yet enrolled: the leaf does not recommend ${entry.shortName}, so the published preset carries no entry`,
    }
  })
