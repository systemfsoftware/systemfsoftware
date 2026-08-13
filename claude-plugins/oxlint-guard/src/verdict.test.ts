import fc from 'fast-check'
import type { ContentPair, Extractable } from './extraction.ts'
import { ContentlessDecision, PairsDecision, UnrecoverableError } from './extraction.ts'
import { err, ok } from './result.ts'
import type { Result } from './result.ts'
import type { FilePath } from './schemas.ts'
import { decodeEditCommand } from './schemas.ts'
import type { CannotVerify, Verdict } from './verdict.ts'
import { decide, DecideCommand } from './verdict.ts'

const pathOf = (value: string): FilePath => {
  const decoded = decodeEditCommand(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: value } }))
  if (decoded === undefined) {
    throw new Error('test path failed to decode')
  }
  return decoded.filePath
}

const commandOf = (targetPath: FilePath, extraction: Extractable): DecideCommand =>
  DecideCommand({ targetPath, extraction: ok(extraction) })

const contentPair = (oldSide: string | undefined, newSide: string): ContentPair => ({
  _tag: 'ContentPair',
  oldSide,
  newSide,
})

const pair = (oldSide: string, newSide: string): ContentPair => contentPair(oldSide, newSide)

const pairsOf = (...ps: ContentPair[]): Extractable => {
  const head = ps[0]
  return head === undefined ? ContentlessDecision() : PairsDecision({ pairs: [head, ...ps.slice(1)] })
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

// The rule names that went from non-off to off between two configs.
const rulesThatWentOff = (oldRules: Record<string, unknown>, newRules: Record<string, unknown>): string[] =>
  Object.entries(newRules)
    .filter(([name, severity]) => isOff(severity) && !isOff(oldRules[name]))
    .map(([name]) => name)

const extractionArb: fc.Arbitrary<Extractable> = fc.oneof(
  fc.constant<Extractable>(ContentlessDecision()),
  fc.tuple(fc.string(), fc.string()).map(([oldSide, newSide]): Extractable => pairsOf(pair(oldSide, newSide))),
)

const isBlockWith = (outcome: Result<Verdict, CannotVerify>, rule: string): boolean =>
  outcome.ok && outcome.value._tag === 'Block' && outcome.value.rules.includes(rule)

Deno.test('decide target filtering: ∀p_NonConfig_=AllowRegardless', () => {
  fc.assert(
    fc.property(fc.constantFrom(...NON_CONFIG_PATHS), extractionArb, (path, extraction) => {
      const outcome = decide(commandOf(pathOf(path), extraction))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide target filtering: ∀c_ContentlessConfig_=Allow', () => {
  fc.assert(
    fc.property(fc.constantFrom(...CONFIG_PATHS), (path) => {
      const outcome = decide(commandOf(pathOf(path), ContentlessDecision()))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide target filtering: ∀u_UnrecoverableConfig_=FailClosed', () => {
  fc.assert(
    fc.property(fc.constantFrom(...CONFIG_PATHS), fc.string({ maxLength: 30 }), (path, reason) => {
      const outcome = decide(
        DecideCommand({ targetPath: pathOf(path), extraction: err(UnrecoverableError({ reason })) }),
      )
      if (outcome.ok) return false
      return outcome.error._tag === 'UnrecognizedEditShape' && outcome.error.reason === reason
    }),
  )
})

Deno.test('decide JSON configs: ∀j_RulesMaps_=ExactVerdict', () => {
  fc.assert(
    fc.property(rulesMapArb, rulesMapArb, (oldRules, newRules) => {
      const outcome = decide(
        commandOf(pathOf('oxlint.json'), pairsOf(contentPair(jsonConfig(oldRules), jsonConfig(newRules)))),
      )
      const expected = rulesThatWentOff(oldRules, newRules)
      if (!outcome.ok) return false
      const verdict = outcome.value
      if (verdict._tag === 'Allow') return expected.length === 0
      return verdict.rules.length === expected.length && expected.every((name) => verdict.rules.includes(name))
    }),
  )
})

Deno.test('decide JSON configs: ∀j_Downgrade_=Allow', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 12 }), (rule) => {
      const outcome = decide(
        commandOf(
          pathOf('.oxlintrc.json'),
          pairsOf(pair(jsonConfig({ [rule]: 'error' }), jsonConfig({ [rule]: 'warn' }))),
        ),
      )
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_OptionsOnly_=Allow', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 12 }), (rule) => {
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
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_IgnorePatternsOnly_=Allow', () => {
  fc.assert(
    fc.property(rulesMapArb, (rules) => {
      const oldSide = JSON.stringify({ rules, ignorePatterns: ['dist'] })
      const newSide = JSON.stringify({ rules, ignorePatterns: ['dist', 'build'] })
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_NewFileWithOff_=Block', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 12 }), (rule) => {
      const outcome = decide(
        commandOf(pathOf('oxlint.json'), pairsOf(contentPair(undefined, jsonConfig({ [rule]: 'off' })))),
      )
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide JSON configs: ∀j_NewFileBenign_=Allow', () => {
  fc.assert(
    fc.property(
      fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.constantFrom('warn', 'error')),
      (rules) => {
        const outcome = decide(
          commandOf(pathOf('.oxlintrc.json'), pairsOf(contentPair(undefined, jsonConfig(rules)))),
        )
        return outcome.ok && outcome.value._tag === 'Allow'
      },
    ),
  )
})

Deno.test('decide JSON configs: ∀j_UnparseableSide_=FailClosed', () => {
  fc.assert(
    fc.property(fc.constantFrom('old', 'new'), (side) => {
      const oldSide = side === 'old' ? 'not json {' : '{"rules":{}}'
      const newSide = side === 'new' ? 'not json {' : '{"rules":{}}'
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(contentPair(oldSide, newSide))))
      if (outcome.ok) return false
      return outcome.error._tag === 'UnparseableJson'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_NonObjectJson_=FailClosed', () => {
  fc.assert(
    fc.property(fc.constantFrom('[1,2,3]', '"plain"', 'null'), (newSide) => {
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair('{"rules":{}}', newSide))))
      if (outcome.ok) return false
      return outcome.error._tag === 'UnparseableJson'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_DisabledSpelling_=Block', () => {
  fc.assert(
    fc.property(fc.constantFrom('off', 'allow', 0, ['off'], ['allow'], [0]), (severity) => {
      const outcome = decide(
        commandOf(
          pathOf('oxlint.json'),
          pairsOf(pair(jsonConfig({ eqeqeq: 'warn' }), jsonConfig({ eqeqeq: severity }))),
        ),
      )
      return isBlockWith(outcome, 'eqeqeq')
    }),
  )
})

Deno.test('decide JSON configs: ∀j_EnabledSpelling_=Allow', () => {
  fc.assert(
    fc.property(fc.constantFrom('deny', 'error', 'warn', 1, 2, ['deny'], ['error'], ['warn'], [1], [2]), (severity) => {
      const replaced = decide(
        commandOf(
          pathOf('oxlint.json'),
          pairsOf(pair(jsonConfig({ eqeqeq: 'warn' }), jsonConfig({ eqeqeq: severity }))),
        ),
      )
      const fresh = decide(
        commandOf(pathOf('oxlint.json'), pairsOf(contentPair(undefined, jsonConfig({ eqeqeq: severity })))),
      )
      return replaced.ok && replaced.value._tag === 'Allow' && fresh.ok && fresh.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_OverrideRulesOff_=Block', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 12 }), (rule) => {
      const oldSide = JSON.stringify({ rules: {}, overrides: [{ files: ['*.ts'], rules: { [rule]: 'warn' } }] })
      const newSide = JSON.stringify({ rules: {}, overrides: [{ files: ['*.ts'], rules: { [rule]: 'off' } }] })
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide JSON configs: ∀j_OverrideOffPreserved_=Allow', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 12 }), (rule) => {
      const side = JSON.stringify({ rules: {}, overrides: [{ files: ['*.ts'], rules: { [rule]: 'off' } }] })
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair(side, side))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide JSON configs: ∀j_OverrideMalformed_=FailClosed', () => {
  fc.assert(
    fc.property(fc.constantFrom('rules', 'overrides'), (key) => {
      const newSide = key === 'rules' ? '{"rules":[],"overrides":[]}' : '{"rules":{},"overrides":"nope"}'
      const outcome = decide(commandOf(pathOf('oxlint.json'), pairsOf(pair('{"rules":{}}', newSide))))
      if (outcome.ok) return false
      return outcome.error._tag === 'UnparseableJson'
    }),
  )
})

// Rule names are embedded in quoted config keys; quote and newline characters
// cannot appear inside them, so the generator draws from an alphabet that excludes them.
const moduleRuleName = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_@/$.:'.split(''),
    ),
    { minLength: 1, maxLength: 16 },
  )
  .map((chars) => chars.join(''))

// A bare (unquoted) config key must be a JS identifier, so this alphabet is
// narrower than moduleRuleName's: no dash, slash, dot or colon.
const bareKeyRuleName = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'.split('')),
    { minLength: 1, maxLength: 12 },
  )
  .map((chars) => chars.join(''))
  .filter((name) => /^[A-Za-z_$]/.test(name))

Deno.test('decide module configs: ∀m_IdenticalPair_=Allow', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 200 }), (content) => {
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(content, content))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_ModuleNeverFailsClosed_=Right', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 }), (oldContent, newContent) => {
      const outcome = decide(commandOf(pathOf('oxlint.config.cjs'), pairsOf(pair(oldContent, newContent))))
      return outcome.ok
    }),
  )
})

Deno.test('decide module configs: ∀m_OffAdded_=Block', () => {
  fc.assert(
    fc.property(moduleRuleName, fc.constantFrom("'", '"'), (rule, quote) => {
      const newSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}off${quote} } }`
      const oldSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}warn${quote} } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide module configs: ∀m_OffPreserved_=Allow', () => {
  fc.assert(
    fc.property(moduleRuleName, fc.constantFrom("'", '"'), (rule, quote) => {
      const side = `export default { rules: { ${quote}${rule}${quote}: ${quote}off${quote} } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.js'), pairsOf(pair(side, side))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_ArrayOffForm_=Block', () => {
  fc.assert(
    fc.property(moduleRuleName, (rule) => {
      const newSide = `rules: { '${rule}': ['off', { args: 'none' }] }`
      const oldSide = `rules: { '${rule}': 'error' }`
      const outcome = decide(commandOf(pathOf('oxlint.config.mjs'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide module configs: ∀m_BareKeyOff_=Block', () => {
  fc.assert(
    fc.property(bareKeyRuleName, fc.constantFrom("'", '"'), (rule, quote) => {
      const oldSide = `rules: { ${rule}: ${quote}error${quote} }`
      const newSide = `rules: { ${rule}: ${quote}off${quote} }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide module configs: ∀m_OffInComments_=Allow', () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[a-z ]*$/), (comment) => {
      const newSide = `// ${comment}: 'off'\n/* ${comment}: "off" */\nexport default { rules: {} }`
      const oldSide = 'export default { rules: {} }'
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_OxlintDisableComment_=Allow', () => {
  fc.assert(
    fc.property(moduleRuleName, fc.constantFrom('warn', 'error'), (rule, severity) => {
      const oldSide = `export default { rules: { '${rule}': '${severity}' } }`
      const newSide = `// oxlint-disable-next-line ${rule}\nexport default { rules: { '${rule}': '${severity}' } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_Downgrade_=Allow', () => {
  fc.assert(
    fc.property(moduleRuleName, fc.constantFrom("'", '"'), (rule, quote) => {
      const newSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}warn${quote} } }`
      const oldSide = `export default { rules: { ${quote}${rule}${quote}: ${quote}error${quote} } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_OptionsOnly_=Allow', () => {
  fc.assert(
    fc.property(moduleRuleName, (rule) => {
      const newSide = `rules: { '${rule}': ['error', { args: 'after-used' }] }`
      const oldSide = `rules: { '${rule}': ['error', { args: 'none' }] }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_NewFileWithOff_=Block', () => {
  fc.assert(
    fc.property(moduleRuleName, (rule) => {
      const outcome = decide(
        commandOf(
          pathOf('oxlint.config.ts'),
          pairsOf(contentPair(undefined, `export default { rules: { '${rule}': 'off' } }`)),
        ),
      )
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide module configs: ∀m_DisabledSpelling_=Block', () => {
  fc.assert(
    fc.property(
      moduleRuleName,
      fc.constantFrom("'off'", '"off"', "'allow'", '"allow"', '0', "['off']", "['allow']", '[0]'),
      (rule, spelling) => {
        const newSide = `export default { rules: { '${rule}': ${spelling} } }`
        const oldSide = `export default { rules: { '${rule}': 'warn' } }`
        const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
        return isBlockWith(outcome, rule)
      },
    ),
  )
})

Deno.test('decide module configs: ∀m_EnabledSpelling_=Allow', () => {
  fc.assert(
    fc.property(
      moduleRuleName,
      fc.constantFrom("'deny'", '"error"', "'warn'", '1', '2', "['warn']", '[1]', '[2]'),
      (rule, spelling) => {
        const newSide = `export default { rules: { '${rule}': ${spelling} } }`
        const oldSide = `export default { rules: { '${rule}': 'warn' } }`
        const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
        return outcome.ok && outcome.value._tag === 'Allow'
      },
    ),
  )
})

Deno.test('decide module configs: ∀m_OverrideRulesOff_=Block', () => {
  fc.assert(
    fc.property(moduleRuleName, (rule) => {
      const newSide = `export default { rules: {}, overrides: [{ files: ['*.ts'], rules: { '${rule}': 'off' } }] }`
      const oldSide = `export default { rules: {}, overrides: [{ files: ['*.ts'], rules: { '${rule}': 'warn' } }] }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide module configs: ∀m_OffOutsideRulesMap_=Allow', () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/), (key) => {
      const newSide = `const defaults = { ${key}: 'off' }\nexport default { rules: { eqeqeq: 'warn' } }`
      const oldSide = `export default { rules: { eqeqeq: 'warn' } }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide module configs: ∀m_NoRulesMap_=Allow', () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/), (key) => {
      const newSide = `export default { plugins: ['oxlint'], ${key}: 'off' }`
      const oldSide = `export default { plugins: ['oxlint'] }`
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), pairsOf(pair(oldSide, newSide))))
      return outcome.ok && outcome.value._tag === 'Allow'
    }),
  )
})

Deno.test('decide multi-hunk extractions: ∀m_AnyHunkOff_=Block', () => {
  fc.assert(
    fc.property(moduleRuleName, (rule) => {
      const extraction = pairsOf(
        pair(`rules: { '${rule}': 'warn' }`, `rules: { '${rule}': 'warn' }`),
        pair(`rules: { '${rule}': 'warn' }`, `rules: { '${rule}': 'off' }`),
      )
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), extraction))
      return isBlockWith(outcome, rule)
    }),
  )
})

Deno.test('decide multi-hunk extractions: ∀m_AllOffHunksNamed_=Block', () => {
  fc.assert(
    fc.property(moduleRuleName, moduleRuleName, (ruleA, ruleB) => {
      fc.pre(ruleA !== ruleB)
      const extraction = pairsOf(
        pair(`rules: { '${ruleA}': 'warn' }`, `rules: { '${ruleA}': 'off' }`),
        pair(`rules: { '${ruleB}': 'warn' }`, `rules: { '${ruleB}': 'off' }`),
      )
      const outcome = decide(commandOf(pathOf('oxlint.config.ts'), extraction))
      return outcome.ok &&
        outcome.value._tag === 'Block' &&
        outcome.value.rules.includes(ruleA) &&
        outcome.value.rules.includes(ruleB)
    }),
  )
})

Deno.test('decide multi-hunk extractions: ∀j_JsonHunkOff_=Block', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 12 }), (rule) => {
      const extraction = pairsOf(
        contentPair(jsonConfig({ [rule]: 'warn' }), jsonConfig({ [rule]: 'warn' })),
        contentPair(jsonConfig({ [rule]: 'warn' }), jsonConfig({ [rule]: 'off' })),
      )
      const outcome = decide(commandOf(pathOf('oxlint.json'), extraction))
      return isBlockWith(outcome, rule)
    }),
  )
})
