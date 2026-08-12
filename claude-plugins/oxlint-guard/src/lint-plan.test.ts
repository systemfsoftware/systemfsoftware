import * as fc from 'fast-check'
import * as v from 'valibot'
import { decideLintPlan, type LintFacts, type LintPlanDecision } from './lint-plan.ts'
import { LINTABLE_EXTENSIONS, type ToolName, ToolNameSchema } from './schemas.ts'

// The lockfile -> install command contract, stated independently of the workflow's
// private mapping so a drift in either side fails this test.
const INSTALL_COMMANDS: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm add -D oxlint',
  'package-lock.json': 'npm install -D oxlint',
  'yarn.lock': 'yarn add -D oxlint',
  'bun.lockb': 'bun add -d oxlint',
  'bun.lock': 'bun add -d oxlint',
}

const NO_LOCKFILE_HINT = 'install oxlint as a dev dependency of this project'

const hintFor = (lockfile: string | undefined): string =>
  lockfile === undefined ? NO_LOCKFILE_HINT : INSTALL_COMMANDS[lockfile] ?? NO_LOCKFILE_HINT

const EDIT_TOOL = v.parse(ToolNameSchema, 'Edit')
const WRITE_TOOL = v.parse(ToolNameSchema, 'Write')

const arbitraryToolName: fc.Arbitrary<ToolName> = fc
  .string({ minLength: 1 })
  .map((name) => v.parse(ToolNameSchema, name))

const arbitraryOptionString: fc.Arbitrary<string | undefined> = fc.oneof(fc.constant(undefined), fc.string())

const arbitraryLintableExtension: fc.Arbitrary<string> = fc
  .constantFrom(...LINTABLE_EXTENSIONS)
  .chain((extension) => fc.oneof(fc.constant(extension), fc.constant(extension.toUpperCase())))

// Every generated value carries a '.' that none of the eight lintable extensions
// contain, so the case-insensitive membership check can never accept it.
const arbitraryNonLintableExtension: fc.Arbitrary<string> = fc.string().map((base) => base + '.')

const arbitraryDenoShebang: fc.Arbitrary<string> = fc.oneof(
  fc.constant('#!deno'),
  fc.constant('#!/usr/bin/env deno run'),
  fc.constant('#!/usr/bin/deno'),
  fc.string().map((suffix) => `#!deno ${suffix}`),
)

// An 'x'-prefixed line cannot start with '#!', and undefined means no first line:
// neither can satisfy the deno-shebang regex.
const arbitraryNonDenoFirstLine: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.string().map((line) => 'x' + line),
)

const arbitraryLintFacts: fc.Arbitrary<LintFacts> = fc.record({
  toolName: arbitraryToolName,
  resolvedPath: fc.string(),
  extension: fc.string(),
  exists: fc.boolean(),
  firstLine: arbitraryOptionString,
  configPath: arbitraryOptionString,
  oxlintBinary: arbitraryOptionString,
  lockfile: arbitraryOptionString,
  denoConfig: arbitraryOptionString,
})

const tagOf = (decision: LintPlanDecision): string => (decision.ok ? decision.value._tag : decision.error._tag)

const noBinaryFacts = (lockfile: string | undefined): LintFacts => ({
  toolName: EDIT_TOOL,
  resolvedPath: '/p/src/a.ts',
  extension: 'ts',
  exists: true,
  firstLine: undefined,
  configPath: '/p/oxlint.config.mjs',
  oxlintBinary: undefined,
  lockfile,
  denoConfig: undefined,
})

Deno.test('∀facts_FileMissingSkip_=Skip — a missing file always skips with reason file-missing', () => {
  fc.assert(
    fc.property(arbitraryLintFacts, (facts) => {
      const decision = decideLintPlan({ ...facts, exists: false })
      return decision.ok && decision.value._tag === 'Skip' && decision.value.reason === 'file-missing'
    }),
  )
})

Deno.test('∀facts_NonLintableExtensionSkip_=Skip — a non-lintable extension skips with the exact reason', () => {
  fc.assert(
    fc.property(arbitraryLintFacts, arbitraryNonLintableExtension, (facts, extension) => {
      const decision = decideLintPlan({ ...facts, exists: true, extension })
      return decision.ok && decision.value._tag === 'Skip' && decision.value.reason === 'not-lintable-extension'
    }),
  )
})

Deno.test('∀facts_NonLintablePrecedence_=Skip — a non-lintable extension precedes every later arm', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryNonLintableExtension,
      (facts, extension) => tagOf(decideLintPlan({ ...facts, exists: true, extension })) === 'Skip',
    ),
  )
})

Deno.test('∀facts_LintableExtensionNoSkip_≠Skip — a lintable extension never skips for the extension reason', () => {
  fc.assert(
    fc.property(arbitraryLintFacts, arbitraryLintableExtension, (facts, extension) => {
      const decision = decideLintPlan({ ...facts, exists: true, extension })
      return !decision.ok || decision.value._tag !== 'Skip' || decision.value.reason !== 'not-lintable-extension'
    }),
  )
})

Deno.test('∀facts_DenoShebangRoute_=RunDeno — a deno shebang routes to RunDeno with the resolved path', () => {
  fc.assert(
    fc.property(arbitraryLintFacts, arbitraryLintableExtension, arbitraryDenoShebang, (facts, extension, firstLine) => {
      const decision = decideLintPlan({ ...facts, exists: true, extension, firstLine })
      return decision.ok && decision.value._tag === 'RunDeno' && decision.value.filePath === facts.resolvedPath
    }),
  )
})

Deno.test('∀facts_DenoShebangPrecedence_=RunDeno — a deno shebang precedes the config and binary arms', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryDenoShebang,
      (facts, extension, firstLine) =>
        tagOf(
          decideLintPlan({
            ...facts,
            exists: true,
            extension,
            firstLine,
            configPath: undefined,
            oxlintBinary: undefined,
          }),
        ) ===
          'RunDeno',
    ),
  )
})

Deno.test('∀facts_NonDenoShebang_≠RunDeno — outside a deno workspace, a non-deno first line never routes to RunDeno', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      (facts, extension, firstLine) => {
        const decision = decideLintPlan({ ...facts, exists: true, extension, firstLine, denoConfig: undefined })
        return !decision.ok || decision.value._tag !== 'RunDeno'
      },
    ),
  )
})

Deno.test('∀facts_NoConfigFailure_=InstallHint — a missing config outside a deno workspace fails with the hint', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      (facts, extension, firstLine) => {
        const decision = decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: undefined,
          denoConfig: undefined,
        })
        return !decision.ok && decision.error._tag === 'NoOxlintConfig' &&
          decision.error.installHint === hintFor(facts.lockfile)
      },
    ),
  )
})

Deno.test('∀facts_ConfigMissingPrecedence_=NoOxlintConfig — a missing config reports NoOxlintConfig, not NoOxlintBinary', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      (facts, extension, firstLine) =>
        tagOf(decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: undefined,
          oxlintBinary: undefined,
          denoConfig: undefined,
        })) === 'NoOxlintConfig',
    ),
  )
})

Deno.test('∀facts_DenoWorkspaceFallback_=RunDeno — a deno workspace with no oxlint config lints with deno', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      fc.string({ minLength: 1 }),
      (facts, extension, firstLine, denoConfig) => {
        const decision = decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: undefined,
          denoConfig,
        })
        return decision.ok && decision.value._tag === 'RunDeno' && decision.value.filePath === facts.resolvedPath
      },
    ),
  )
})

Deno.test('∀facts_OxlintOutranksDenoWorkspace_=RunOxlint — an oxlint config wins over a sibling deno workspace', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      fc.string({ minLength: 1 }),
      (facts, extension, firstLine, denoConfig) => {
        const decision = decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: `${facts.resolvedPath}/oxlint.config.mjs`,
          oxlintBinary: `${facts.resolvedPath}/node_modules/.bin/oxlint`,
          denoConfig,
        })
        return decision.ok && decision.value._tag === 'RunOxlint'
      },
    ),
  )
})

Deno.test('∀facts_BinaryMissingFailure_=NoOxlintBinary — a present config with a missing binary reports NoOxlintBinary with the hint', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      (facts, extension, firstLine) => {
        const configPath = facts.resolvedPath + '/oxlint.config.mjs'
        const decision = decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath,
          oxlintBinary: undefined,
        })
        return !decision.ok && decision.error._tag === 'NoOxlintBinary' &&
          decision.error.installHint === hintFor(facts.lockfile)
      },
    ),
  )
})

Deno.test('∀facts_RunOxlintRoute_=RunOxlint — config and binary present route to RunOxlint carrying both', () => {
  fc.assert(
    fc.property(
      arbitraryLintFacts,
      arbitraryLintableExtension,
      arbitraryNonDenoFirstLine,
      (facts, extension, firstLine) => {
        const configPath = facts.resolvedPath + '/oxlint.config.mjs'
        const oxlintBinary = facts.resolvedPath + '/node_modules/.bin/oxlint'
        const decision = decideLintPlan({ ...facts, exists: true, extension, firstLine, configPath, oxlintBinary })
        return decision.ok &&
          decision.value._tag === 'RunOxlint' &&
          decision.value.filePath === facts.resolvedPath &&
          decision.value.configPath === configPath &&
          decision.value.oxlintBinary === oxlintBinary
      },
    ),
  )
})

Deno.test('∀facts_ToolIdentityInvariance_≡Decision — the invoking tool never changes the decision', () => {
  fc.assert(
    fc.property(arbitraryLintFacts, (facts) => {
      const otherTool = facts.toolName === EDIT_TOOL ? WRITE_TOOL : EDIT_TOOL
      const a = decideLintPlan(facts)
      const b = decideLintPlan({ ...facts, toolName: otherTool })
      return JSON.stringify(a) === JSON.stringify(b)
    }),
  )
})

Deno.test('∀name_InstallHintMapping_∈Table — known lockfiles map to their exact install commands', () => {
  fc.assert(
    fc.property(fc.constantFrom(...Object.keys(INSTALL_COMMANDS)), (name) => {
      const decision = decideLintPlan(noBinaryFacts(name))
      return !decision.ok && decision.error._tag === 'NoOxlintBinary' &&
        decision.error.installHint === INSTALL_COMMANDS[name]
    }),
  )
})

Deno.test('∀lockfile_InstallHintMapping_=GenericHint — unknown or missing lockfiles fall back to the generic hint', () => {
  fc.assert(
    fc.property(fc.oneof(fc.constant(undefined), fc.string()), (lockfile) => {
      const decision = decideLintPlan(noBinaryFacts(lockfile))
      return !decision.ok && decision.error._tag === 'NoOxlintBinary' &&
        decision.error.installHint === hintFor(lockfile)
    }),
  )
})
