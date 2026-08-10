import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import * as Either from 'effect/Either'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { FilePath } from '../../edit-command.schema.js'
import {
  ContentlessDecision,
  type ContentPair,
  type Extractable,
  PairsDecision,
  UnrecoverableError,
} from '../extraction.workflow.js'
import { DecideCommand } from '../verdict-command.schema.js'
import { type CannotVerify, decide, type Verdict } from '../verdict.workflow.js'

const pathOf = (value: string): FilePath => {
  const decoded = S.decodeUnknownEither(FilePath)(value)
  if (Either.isLeft(decoded)) {
    throw new Error(`test path failed to decode: ${String(decoded.left)}`)
  }
  return decoded.right
}

const commandOf = (targetPath: FilePath, extraction: Extractable): DecideCommand =>
  new DecideCommand({ targetPath, extraction: Either.right(extraction) })

const contentPair = (oldSide: Option.Option<string>, newSide: string): ContentPair => ({
  _tag: 'ContentPair',
  oldSide,
  newSide,
})

const pair = (oldSide: string, newSide: string): ContentPair => contentPair(Option.some(oldSide), newSide)

const pairsOf = (...ps: ContentPair[]): Extractable => {
  const head = ps[0]
  return head === undefined ? new ContentlessDecision() : new PairsDecision({ pairs: [head, ...ps.slice(1)] })
}

const CONFIG_PATHS = [
  'oxlint.config.ts',
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  '.oxlintrc.json',
  'oxlint.json',
] as const

const NON_CONFIG_PATHS = [
  'src/index.ts',
  'README.md',
  'package.json',
  'other.config.ts',
  'lib/util.ts',
  'foo.json',
] as const

const severityArb = fc.oneof(
  fc.constant('off'),
  fc.constant('allow'),
  fc.constant('warn'),
  fc.constant('error'),
  fc.constant('deny'),
  fc.constant(0),
  fc.constant(1),
  fc.constant(2),
  fc.constant(['off']),
  fc.constant(['allow']),
  fc.constant([0]),
  fc.constant(['warn']),
  fc.constant(['error', { args: 'none' }]),
  fc.constant(['deny']),
  fc.constant([1]),
  fc.constant([2]),
  fc.constant([0, { args: 'none' }]),
)

const rulesMapArb = fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), severityArb)

const jsonConfig = (rules: Record<string, unknown>): string => JSON.stringify({ rules })

const isOff = (severity: unknown): boolean =>
  severity === 'off' ||
  severity === 'allow' ||
  severity === 0 ||
  (Array.isArray(severity) && severity.length > 0 && isOff(severity[0]))

// The rule names that went from non-off to off between two configs. Computed
// at module level so a property predicate pays one top-level call instead of
// an iteration over a drawn value with a free `isOff` call inside.
const rulesThatWentOff = (oldRules: Record<string, unknown>, newRules: Record<string, unknown>): string[] =>
  Object.entries(newRules)
    .filter(([name, severity]) => isOff(severity) && !isOff(oldRules[name]))
    .map(([name]) => name)

const extractionArb: fc.Arbitrary<Extractable> = fc.oneof(
  fc.constant<Extractable>(new ContentlessDecision()),
  fc.tuple(fc.string(), fc.string()).map(([oldSide, newSide]): Extractable => pairsOf(pair(oldSide, newSide))),
)

const isBlockWith = (outcome: Either.Either<Verdict, CannotVerify>, rule: string): boolean =>
  Either.isRight(outcome) &&
  outcome.right._tag === 'Block' &&
  outcome.right.rules.includes(rule)

describe('decide — target filtering', () => {
  it.prop(
    '∀p_NonConfig_=AllowRegardless',
    [fc.constantFrom(...NON_CONFIG_PATHS), extractionArb],
    ([path, extraction]) => {
      const outcome = decide(commandOf(pathOf(path), extraction))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀c_ContentlessConfig_=Allow',
    [fc.constantFrom(...CONFIG_PATHS)],
    ([path]) => {
      const outcome = decide(commandOf(pathOf(path), new ContentlessDecision()))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀u_UnrecoverableConfig_=FailClosed',
    [fc.constantFrom(...CONFIG_PATHS), fc.string({ maxLength: 30 })],
    ([path, reason]) => {
      const outcome = decide(
        new DecideCommand({ targetPath: pathOf(path), extraction: Either.left(new UnrecoverableError({ reason })) }),
      )
      return Either.isLeft(outcome) &&
        outcome.left._tag === 'UnrecognizedEditShape' &&
        outcome.left.reason === reason
    },
  )
})

describe('decide — JSON configs', () => {
  it.prop(
    '∀j_RulesMaps_=ExactVerdict',
    [rulesMapArb, rulesMapArb],
    ([oldRules, newRules]) => {
      const outcome = decide(
        commandOf(pathOf('oxlint.json'), pairsOf(contentPair(Option.some(jsonConfig(oldRules)), jsonConfig(newRules)))),
      )
      const expected = rulesThatWentOff(oldRules, newRules)
      if (Either.isLeft(outcome)) return false
      const verdict = outcome.right
      if (verdict._tag === 'Allow') return expected.length === 0
      return verdict.rules.length === expected.length && expected.every((name) => verdict.rules.includes(name))
    },
  )

  it.prop(
    '∀j_Downgrade_=Allow',
    [fc.string({ minLength: 1, maxLength: 12 })],
    ([rule]) => {
      const outcome = decide(
        commandOf(
          pathOf('.oxlintrc.json'),
          pairsOf(pair(jsonConfig({ [rule]: 'error' }), jsonConfig({ [rule]: 'warn' }))),
        ),
      )
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀j_OptionsOnly_=Allow',
    [fc.string({ minLength: 1, maxLength: 12 })],
    ([rule]) => {
      const outcome = decide(
        commandOf(
          pathOf('oxlint.json'),
          pairsOf(
            pair(
              jsonConfig({ [rule]: ['error', { args: 'none' }] }),
              jsonConfig({ [rule]: ['error', { args: 'after-used' }] }),
            ),
          ),
        ),
      )
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀j_IgnorePatternsOnly_=Allow',
    [rulesMapArb],
    ([rules]) => {
      const oldSide = JSON.stringify({ rules, ignorePatterns: ['dist'] })
      const newSide = JSON.stringify({ rules, ignorePatterns: ['dist', 'build'] })
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀j_NewFileWithOff_=Block',
    [fc.string({ minLength: 1, maxLength: 12 })],
    ([rule]) => {
      const outcome = decide(
        commandOf(pathOf('oxlint.json'), pairsOf(contentPair(Option.none(), jsonConfig({ [rule]: 'off' })))),
      )
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀j_NewFileBenign_=Allow',
    [fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.constantFrom('warn', 'error'))],
    ([rules]) => {
      const outcome = decide(
        commandOf(pathOf('.oxlintrc.json'), pairsOf(contentPair(Option.none(), jsonConfig(rules)))),
      )
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀j_UnparseableSide_=FailClosed',
    [fc.constantFrom('old', 'new')],
    ([side]) => {
      const oldSide = side === 'old' ? Option.some('not json {') : Option.some('{"rules":{}}')
      const newSide = side === 'new' ? 'not json {' : '{"rules":{}}'
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(contentPair(oldSide, newSide))))
      return Either.isLeft(outcome) && outcome.left._tag === 'UnparseableJson'
    },
  )

  it.prop(
    '∀j_NonObjectJson_=FailClosed',
    [fc.constantFrom('[1,2,3]', '"plain"', 'null')],
    ([newSide]) => {
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair('{"rules":{}}', newSide))))
      return Either.isLeft(outcome) && outcome.left._tag === 'UnparseableJson'
    },
  )

  it.prop(
    '∀j_DisabledSpelling_=Block',
    [fc.constantFrom('off', 'allow', 0, ['off'], ['allow'], [0])],
    ([severity]) => {
      const outcome = decide(
        commandOf(
          pathOf('oxlint.json'),
          pairsOf(pair(jsonConfig({ eqeqeq: 'warn' }), jsonConfig({ eqeqeq: severity }))),
        ),
      )
      return isBlockWith(outcome, 'eqeqeq')
    },
  )

  it.prop(
    '∀j_EnabledSpelling_=Allow',
    [fc.constantFrom('deny', 'error', 'warn', 1, 2, ['deny'], ['error'], ['warn'], [1], [2])],
    ([severity]) => {
      const replaced = decide(
        commandOf(
          pathOf('oxlint.json'),
          pairsOf(pair(jsonConfig({ eqeqeq: 'warn' }), jsonConfig({ eqeqeq: severity }))),
        ),
      )
      const fresh = decide(
        commandOf(pathOf('oxlint.json'), pairsOf(contentPair(Option.none(), jsonConfig({ eqeqeq: severity })))),
      )
      return Either.isRight(replaced) && replaced.right._tag === 'Allow' &&
        Either.isRight(fresh) && fresh.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀j_OverrideRulesOff_=Block',
    [fc.string({ minLength: 1, maxLength: 12 })],
    ([rule]) => {
      const oldSide = JSON.stringify({ rules: {}, overrides: [{ files: ['*.ts'], rules: { [rule]: 'warn' } }] })
      const newSide = JSON.stringify({ rules: {}, overrides: [{ files: ['*.ts'], rules: { [rule]: 'off' } }] })
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀j_OverrideOffPreserved_=Allow',
    [fc.string({ minLength: 1, maxLength: 12 })],
    ([rule]) => {
      const side = JSON.stringify({ rules: {}, overrides: [{ files: ['*.ts'], rules: { [rule]: 'off' } }] })
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair(side, side))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀j_OverrideMalformed_=FailClosed',
    [fc.constantFrom('rules', 'overrides')],
    ([key]) => {
      const newSide = key === 'rules'
        ? '{"rules":[],"overrides":[]}'
        : '{"rules":{},"overrides":"nope"}'
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair('{"rules":{}}', newSide))))
      return Either.isLeft(outcome) && outcome.left._tag === 'UnparseableJson'
    },
  )
})

// Rule names are embedded in quoted config keys; quote and newline characters
// cannot appear inside them, so the generator must exclude those chars.
const moduleRuleName = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((name) => !/["'\n]/.test(name))

describe('decide — module configs', () => {
  it.prop(
    '∀m_IdenticalPair_=Allow',
    [fc.string({ maxLength: 200 })],
    ([content]) => {
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(content, content))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_ModuleNeverFailsClosed_=Right',
    [fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 })],
    ([oldContent, newContent]) => {
      const outcome = decide(commandOf(pathOf('oxlint.config.cjs'), pairsOf(pair(oldContent, newContent))))
      return Either.isRight(outcome)
    },
  )

  it.prop(
    '∀m_OffAdded_=Block',
    [moduleRuleName, fc.constantFrom("'", '"')],
    ([rule, quote]) => {
      const newSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}off${quote} } }`
      const oldSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}warn${quote} } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀m_OffPreserved_=Allow',
    [moduleRuleName, fc.constantFrom("'", '"')],
    ([rule, quote]) => {
      const side = `export default { rules: { ${quote}${rule}${quote}: ${quote}off${quote} } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.js'), pairsOf(pair(side, side))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_ArrayOffForm_=Block',
    [moduleRuleName],
    ([rule]) => {
      const newSide = `rules: { '${rule}': ['off', { args: 'none' }] }`
      const oldSide = `rules: { '${rule}': 'error' }`
      const outcome = decide(commandOf(pathOf('oxlint.config.mjs'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀m_BareKeyOff_=Block',
    [fc.constant('eqeqeq')],
    () => {
      const outcome = decide(
        commandOf(pathOf('oxlint.config.ts'), pairsOf(pair('rules: { eqeqeq: "error" }', 'rules: { eqeqeq: "off" }'))),
      )
      return isBlockWith(outcome, 'eqeqeq')
    },
  )

  it.prop(
    '∀m_OffInComments_=Allow',
    [fc.stringMatching(/^[a-z ]*$/)],
    ([comment]) => {
      const newSide = `// ${comment}: 'off'\n/* ${comment}: "off" */\nexport default { rules: {} }`
      const oldSide = 'export default { rules: {} }'
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_OxlintDisableComment_=Allow',
    [fc.constant(null)],
    () => {
      const newSide = "// oxlint-disable-next-line no-debugger\nexport default { rules: { 'no-debugger': 'warn' } }"
      const oldSide = "export default { rules: { 'no-debugger': 'warn' } }"
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_Downgrade_=Allow',
    [moduleRuleName, fc.constantFrom("'", '"')],
    ([rule, quote]) => {
      const newSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}warn${quote} } }`
      const oldSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}error${quote} } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_OptionsOnly_=Allow',
    [moduleRuleName],
    ([rule]) => {
      const newSide = `rules: { '${rule}': ['error', { args: 'after-used' }] }`
      const oldSide = `rules: { '${rule}': ['error', { args: 'none' }] }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_NewFileWithOff_=Block',
    [moduleRuleName],
    ([rule]) => {
      const outcome = decide(
        commandOf(
          pathOf('oxlint.config.ts'),
          pairsOf(contentPair(Option.none(), `export default { rules: { '${rule}': 'off' } }`)),
        ),
      )
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀m_DisabledSpelling_=Block',
    [moduleRuleName, fc.constantFrom("'off'", '"off"', "'allow'", '"allow"', '0', "['off']", "['allow']", '[0]')],
    ([rule, spelling]) => {
      const newSide = `export default { rules: { '${rule}': ${spelling} } }`
      const oldSide = `export default { rules: { '${rule}': 'warn' } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀m_EnabledSpelling_=Allow',
    [moduleRuleName, fc.constantFrom("'deny'", '"error"', "'warn'", '1', '2', "['warn']", '[1]', '[2]')],
    ([rule, spelling]) => {
      const newSide = `export default { rules: { '${rule}': ${spelling} } }`
      const oldSide = `export default { rules: { '${rule}': 'warn' } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_OverrideRulesOff_=Block',
    [moduleRuleName],
    ([rule]) => {
      const newSide = `export default { rules: {}, overrides: [{ files: ['*.ts'], rules: { '${rule}': 'off' } }] }`
      const oldSide = `export default { rules: {}, overrides: [{ files: ['*.ts'], rules: { '${rule}': 'warn' } }] }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀m_OffOutsideRulesMap_=Allow',
    [fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/)],
    ([key]) => {
      const newSide = `const defaults = { ${key}: 'off' }\nexport default { rules: { eqeqeq: 'warn' } }`
      const oldSide = `export default { rules: { eqeqeq: 'warn' } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀m_NoRulesMap_=Allow',
    [fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/)],
    ([key]) => {
      const newSide = `export default { plugins: ['oxlint'], ${key}: 'off' }`
      const oldSide = `export default { plugins: ['oxlint'] }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return Either.isRight(outcome) && outcome.right._tag === 'Allow'
    },
  )
})

describe('decide — multi-hunk extractions', () => {
  it.prop(
    '∀m_AnyHunkOff_=Block',
    [moduleRuleName],
    ([rule]) => {
      const extraction = pairsOf(
        pair(`rules: { '${rule}': 'warn' }`, `rules: { '${rule}': 'warn' }`),
        pair(`rules: { '${rule}': 'warn' }`, `rules: { '${rule}': 'off' }`),
      )
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), extraction))
      return isBlockWith(outcome, rule)
    },
  )

  it.prop(
    '∀m_AllOffHunksNamed_=Block',
    [moduleRuleName, moduleRuleName],
    ([ruleA, ruleB]) => {
      if (ruleA === ruleB) return true
      const extraction = pairsOf(
        pair(`rules: { '${ruleA}': 'warn' }`, `rules: { '${ruleA}': 'off' }`),
        pair(`rules: { '${ruleB}': 'warn' }`, `rules: { '${ruleB}': 'off' }`),
      )
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), extraction))
      return Either.isRight(outcome) &&
        outcome.right._tag === 'Block' &&
        outcome.right.rules.includes(ruleA) &&
        outcome.right.rules.includes(ruleB)
    },
  )

  it.prop(
    '∀j_JsonHunkOff_=Block',
    [fc.string({ minLength: 1, maxLength: 12 })],
    ([rule]) => {
      const extraction = pairsOf(
        contentPair(Option.some(jsonConfig({ [rule]: 'warn' })), jsonConfig({ [rule]: 'warn' })),
        contentPair(Option.some(jsonConfig({ [rule]: 'warn' })), jsonConfig({ [rule]: 'off' })),
      )
      const outcome = decide(commandOf(pathOf('oxlint.json'), extraction))
      return isBlockWith(outcome, rule)
    },
  )
})
