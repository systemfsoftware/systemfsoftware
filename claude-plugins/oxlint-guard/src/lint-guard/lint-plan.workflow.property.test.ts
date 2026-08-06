import { describe, it } from '@effect/vitest'
import * as Arbitrary from 'effect/Arbitrary'
import * as Either from 'effect/Either'
import * as fc from 'effect/FastCheck'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { LintableExtension, ToolName } from '../edit-command.schema.js'
import { decideLintPlan } from './lint-plan.workflow.js'
import type { LintFacts, LintPlanDecision } from './lint-plan.workflow.js'

// The lockfile -> install command contract, stated independently of the workflow's
// private mapping so a drift in either side fails this test.
const INSTALL_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['pnpm-lock.yaml', 'pnpm add -D oxlint'],
  ['package-lock.json', 'npm install -D oxlint'],
  ['yarn.lock', 'yarn add -D oxlint'],
  ['bun.lockb', 'bun add -d oxlint'],
  ['bun.lock', 'bun add -d oxlint'],
])

const NO_LOCKFILE_HINT = 'install oxlint as a dev dependency of this project'

const hintFor = (lockfile: Option.Option<string>): string =>
  Option.match(lockfile, {
    onNone: () => NO_LOCKFILE_HINT,
    onSome: (name) => INSTALL_COMMANDS.get(name) ?? NO_LOCKFILE_HINT,
  })

const arbitraryOptionString: fc.Arbitrary<Option.Option<string>> = fc.oneof(
  fc.constant(Option.none<string>()),
  fc.string().map(Option.some),
)

const arbitraryLintableExtension: fc.Arbitrary<string> = fc
  .constantFrom(...LintableExtension.literals)
  .chain((ext) => fc.oneof(fc.constant(ext), fc.constant(ext.toUpperCase())))

const arbitraryNonLintableExtension: fc.Arbitrary<string> = fc
  .string()
  .filter((ext) => !S.is(LintableExtension)(ext.toLowerCase()))

const arbitraryDenoShebang: fc.Arbitrary<string> = fc.oneof(
  fc.constant('#!/usr/bin/env -S deno run --allow-net'),
  fc.constant('#!/usr/bin/env deno run'),
  fc.constant('#!/usr/bin/deno'),
  fc.constant('#!deno'),
  fc
    .string()
    .filter((suffix) => !suffix.includes('\n'))
    .map((suffix) => `#!${suffix} deno ${suffix}`),
)

const arbitraryNonDenoFirstLine: fc.Arbitrary<Option.Option<string>> = fc.oneof(
  fc.constant(Option.none<string>()),
  fc
    .string()
    .filter((line) => !/^#!.*\bdeno\b/.test(line))
    .map(Option.some),
)

const arbitraryLintFacts: fc.Arbitrary<LintFacts> = fc.record({
  toolName: Arbitrary.make(ToolName),
  resolvedPath: fc.string(),
  extension: fc.string(),
  exists: fc.boolean(),
  firstLine: arbitraryOptionString,
  configPath: arbitraryOptionString,
  oxlintBinary: arbitraryOptionString,
  lockfile: arbitraryOptionString,
})

const tagOf = (decision: LintPlanDecision): string | null =>
  Match.value(decision).pipe(
    Match.tag('Right', ({ right }) => right._tag),
    Match.tag('Left', ({ left }) => left._tag),
    Match.exhaustive,
  )

describe('decideLintPlan — skip decisions', () => {
  it.prop(
    '∀facts_FileMissingSkip_=Skip',
    [arbitraryLintFacts],
    ([facts]) => tagOf(decideLintPlan({ ...facts, exists: false })) === 'Skip',
  )

  it.prop(
    '∀facts_NonLintableExtensionSkip_=Skip',
    [arbitraryLintFacts, arbitraryNonLintableExtension],
    ([facts, extension]) =>
      Either.match(decideLintPlan({ ...facts, exists: true, extension }), {
        onLeft: () => false,
        onRight: (plan) => plan._tag === 'Skip' && plan.reason === 'not-lintable-extension',
      }),
  )

  it.prop(
    '∀facts_NonLintablePrecedence_=Skip',
    [arbitraryLintFacts, arbitraryNonLintableExtension],
    ([facts, extension]) =>
      tagOf(
        decideLintPlan({
          ...facts,
          exists: true,
          extension,
          configPath: Option.none(),
          oxlintBinary: Option.none(),
        }),
      ) === 'Skip',
  )

  it.prop(
    '∀facts_LintableExtensionNoSkip_≠Skip',
    [arbitraryLintFacts, arbitraryLintableExtension],
    ([facts, extension]) =>
      Either.match(decideLintPlan({ ...facts, exists: true, extension }), {
        onLeft: () => true,
        onRight: (plan) => !(plan._tag === 'Skip' && plan.reason === 'not-lintable-extension'),
      }),
  )
})

describe('decideLintPlan — deno route', () => {
  it.prop(
    '∀facts_DenoShebangRoute_=RunDeno',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryDenoShebang],
    ([facts, extension, firstLine]) =>
      Either.match(decideLintPlan({ ...facts, exists: true, extension, firstLine: Option.some(firstLine) }), {
        onLeft: () => false,
        onRight: (plan) => plan._tag === 'RunDeno' && plan.filePath === facts.resolvedPath,
      }),
  )

  it.prop(
    '∀facts_DenoShebangPrecedence_=RunDeno',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryDenoShebang],
    ([facts, extension, firstLine]) =>
      tagOf(
        decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine: Option.some(firstLine),
          configPath: Option.none(),
          oxlintBinary: Option.none(),
        }),
      ) === 'RunDeno',
  )

  it.prop(
    '∀facts_NonDenoShebang_≠RunDeno',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryNonDenoFirstLine],
    ([facts, extension, firstLine]) =>
      Either.match(decideLintPlan({ ...facts, exists: true, extension, firstLine }), {
        onLeft: () => true,
        onRight: (plan) => plan._tag !== 'RunDeno',
      }),
  )
})

describe('decideLintPlan — hard failures', () => {
  it.prop(
    '∀facts_NoConfigFailure_=InstallHint',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryNonDenoFirstLine],
    ([facts, extension, firstLine]) =>
      Either.match(
        decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: Option.none(),
        }),
        {
          onLeft: (failure) => failure._tag === 'NoOxlintConfig' && failure.installHint === hintFor(facts.lockfile),
          onRight: () => false,
        },
      ),
  )

  it.prop(
    '∀facts_ConfigMissingPrecedence_=NoOxlintConfig',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryNonDenoFirstLine],
    ([facts, extension, firstLine]) =>
      tagOf(
        decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: Option.none(),
          oxlintBinary: Option.none(),
        }),
      ) === 'NoOxlintConfig',
  )

  it.prop(
    '∀facts_BinaryMissingFailure_=NoOxlintBinary',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryNonDenoFirstLine],
    ([facts, extension, firstLine]) =>
      Either.match(
        decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: Option.some(facts.resolvedPath + '/oxlint.config.mjs'),
          oxlintBinary: Option.none(),
        }),
        {
          onLeft: (failure) => failure._tag === 'NoOxlintBinary' && failure.installHint === hintFor(facts.lockfile),
          onRight: () => false,
        },
      ),
  )
})

describe('decideLintPlan — run route', () => {
  it.prop(
    '∀facts_RunOxlintRoute_=RunOxlint',
    [arbitraryLintFacts, arbitraryLintableExtension, arbitraryNonDenoFirstLine],
    ([facts, extension, firstLine]) =>
      Either.match(
        decideLintPlan({
          ...facts,
          exists: true,
          extension,
          firstLine,
          configPath: Option.some(facts.resolvedPath + '/oxlint.config.mjs'),
          oxlintBinary: Option.some(facts.resolvedPath + '/node_modules/.bin/oxlint'),
        }),
        {
          onLeft: () => false,
          onRight: (plan) =>
            plan._tag === 'RunOxlint' &&
            plan.filePath === facts.resolvedPath &&
            plan.configPath === facts.resolvedPath + '/oxlint.config.mjs' &&
            plan.oxlintBinary === facts.resolvedPath + '/node_modules/.bin/oxlint',
        },
      ),
  )

  it.prop(
    '∀facts_ToolIdentityInvariance_≡Decision',
    [arbitraryLintFacts],
    ([facts]) => {
      const otherTool: LintFacts['toolName'] = facts.toolName === ToolName.make('Edit')
        ? ToolName.make('Write')
        : ToolName.make('Edit')
      const a = decideLintPlan(facts)
      const b = decideLintPlan({ ...facts, toolName: otherTool })
      return Either.match(a, {
        onLeft: (failureA) =>
          Either.match(b, {
            onLeft: (failureB) => failureA._tag === failureB._tag,
            onRight: () => false,
          }),
        onRight: (planA) =>
          Either.match(b, {
            onLeft: () => false,
            onRight: (planB) => planA._tag === planB._tag,
          }),
      })
    },
  )
})

describe('lockfile to install command — pinned through the decision', () => {
  const noBinaryFacts = (lockfile: Option.Option<string>): LintFacts => ({
    toolName: ToolName.make('Edit'),
    resolvedPath: '/p/src/a.ts',
    extension: 'ts',
    exists: true,
    firstLine: Option.none<string>(),
    configPath: Option.some('/p/oxlint.config.mjs'),
    oxlintBinary: Option.none(),
    lockfile,
  })

  it.prop(
    '∀name_InstallHintMapping_∈Table',
    [fc.constantFrom(...INSTALL_COMMANDS.keys())],
    ([name]) =>
      Either.match(decideLintPlan(noBinaryFacts(Option.some(name))), {
        onLeft: (failure) => failure._tag === 'NoOxlintBinary' && failure.installHint === INSTALL_COMMANDS.get(name),
        onRight: () => false,
      }),
  )

  it.prop(
    '∀name_InstallHintMapping_=GenericHint',
    [fc.string()],
    ([name]) =>
      Either.match(decideLintPlan(noBinaryFacts(Option.some(name))), {
        onLeft: (failure) =>
          failure._tag === 'NoOxlintBinary' && failure.installHint === (INSTALL_COMMANDS.get(name) ?? NO_LOCKFILE_HINT),
        onRight: () => false,
      }),
  )

  it.prop(
    '∀lockfile_InstallHintMapping_=GenericHint',
    [fc.constant(Option.none<string>())],
    ([lockfile]) =>
      Either.match(decideLintPlan(noBinaryFacts(lockfile)), {
        onLeft: (failure) => failure._tag === 'NoOxlintBinary' && failure.installHint === NO_LOCKFILE_HINT,
        onRight: () => false,
      }),
  )
})
