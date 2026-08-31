import { it } from '@effect/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'

import { EDIT_TOOL_NAMES } from '../constants.ts'
import { EditTarget, LintEditCommand, type LintPlan } from '../flow.schema.ts'
import { lintPlan } from '../lint-edit.workflow.ts'
import type { UnsupportedToolError } from '../lint-edit.workflow.ts'

const lintableEditOf = (
  parts: {
    readonly toolName: string
    readonly filePath: string
    readonly exists: boolean
    readonly denoShebang: boolean
    readonly extension: string
    readonly configPath: string | null
  },
): LintEditCommand =>
  new LintEditCommand({
    edit: {
      _tag: 'LintableEdit',
      target: EditTarget.make({ toolName: parts.toolName, filePath: parts.filePath }),
      facts: {
        exists: parts.exists,
        denoShebang: parts.denoShebang,
        extension: parts.extension,
        configPath: parts.configPath,
      },
    },
  })

const decisionOn = (
  command: LintEditCommand,
): Result.Result<LintPlan, UnsupportedToolError> => lintPlan(command)

const isSuccessFor = (
  command: LintEditCommand,
  predicate: (plan: LintPlan) => boolean,
): boolean =>
  Result.match(decisionOn(command), {
    onFailure: () => false,
    onSuccess: predicate,
  })

const isSkipFor = (
  command: LintEditCommand,
  reason: 'file-missing' | 'no-oxlint-config' | 'not-lintable-extension' | 'oversized-input' | 'unreadable-input',
): boolean =>
  isSuccessFor(command, (decision) =>
    Match.value(decision).pipe(
      Match.tag('Skip', ({ reason: skipped }) => skipped === reason),
      Match.tag('RunDeno', () => false),
      Match.tag('RunOxlint', () => false),
      Match.exhaustive,
    ))

it.prop(
  '∀c_ParsedEdit_≡VariantConsistentDecision',
  [fc.oneof(
    fc.constant(new LintEditCommand({ edit: { _tag: 'OversizedEdit' } })),
    fc.constant(new LintEditCommand({ edit: { _tag: 'UnreadableEdit' } })),
    fc.record({
      toolName: fc.constantFrom(...EDIT_TOOL_NAMES),
      filePath: fc.string({ minLength: 1 }),
      exists: fc.boolean(),
      denoShebang: fc.boolean(),
      extension: fc.string({ maxLength: 8 }),
      configPath: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
    }).map(lintableEditOf),
  )],
  ([command]) =>
    Match.value(command.edit).pipe(
      Match.tag('OversizedEdit', () => isSkipFor(command, 'oversized-input')),
      Match.tag('UnreadableEdit', () => isSkipFor(command, 'unreadable-input')),
      Match.tag('LintableEdit', () =>
        Result.match(decisionOn(command), {
          onFailure: () => false,
          onSuccess: () => true,
        })),
      Match.exhaustive,
    ),
)

it.prop(
  '∀c_UnlistedTool_≡FailCarryingName',
  [
    fc.record({
      toolName: fc.stringMatching(/^[a-z]{1,8}$/).map((suffix) => `unlisted-${suffix}`),
      filePath: fc.string({ minLength: 1 }),
      exists: fc.boolean(),
      denoShebang: fc.boolean(),
      extension: fc.string({ maxLength: 8 }),
      configPath: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
    }).map((parts) => ({ command: lintableEditOf(parts), toolName: parts.toolName })),
  ],
  ([{ command, toolName }]) =>
    Result.match(decisionOn(command), {
      onFailure: (error) => error.toolName === toolName,
      onSuccess: () => false,
    }),
)

it.prop(
  '∀c_ListedTool_≡Success',
  [
    fc.record({
      toolName: fc.constantFrom(...EDIT_TOOL_NAMES),
      filePath: fc.string({ minLength: 1 }),
      exists: fc.boolean(),
      denoShebang: fc.boolean(),
      extension: fc.string({ maxLength: 8 }),
      configPath: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
    }).map(lintableEditOf),
  ],
  ([command]) => Result.isSuccess(decisionOn(command)),
)

it.prop(
  '∀c_MissingFile_≡SkipFileMissing',
  [
    fc.record({
      toolName: fc.constantFrom(...EDIT_TOOL_NAMES),
      filePath: fc.string({ minLength: 1 }),
    }).map(({ toolName, filePath }) =>
      lintableEditOf({
        toolName,
        filePath,
        exists: false,
        denoShebang: true,
        extension: 'ts',
        configPath: '/p/oxlint.config.ts',
      })
    ),
  ],
  ([command]) => isSkipFor(command, 'file-missing'),
)

it.prop(
  '∀c_DenoShebang_≡RunDenoIdentity',
  [
    fc.record({
      filePath: fc.string({ minLength: 1 }),
    }).map(({ filePath }) => {
      const command = lintableEditOf({
        toolName: 'Write',
        filePath,
        exists: true,
        denoShebang: true,
        extension: 'ts',
        configPath: '/p/oxlint.config.ts',
      })
      return { command, filePath }
    }),
  ],
  ([{ command, filePath }]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag('RunDeno', ({ filePath: planned }) => planned === filePath),
        Match.tag('Skip', () => false),
        Match.tag('RunOxlint', () => false),
        Match.exhaustive,
      )),
)

it.prop(
  '∀c_NoConfig_≡SkipNoConfig',
  [
    fc.record({
      toolName: fc.constantFrom(...EDIT_TOOL_NAMES),
      filePath: fc.string({ minLength: 1 }),
    }).map(({ toolName, filePath }) =>
      lintableEditOf({ toolName, filePath, exists: true, denoShebang: false, extension: 'ts', configPath: null })
    ),
  ],
  ([command]) => isSkipFor(command, 'no-oxlint-config'),
)

it.prop(
  '∀c_WithConfig_≡RunOxlintIdentity',
  [
    fc.record({
      filePath: fc.string({ minLength: 1 }),
    }).map(({ filePath }) => {
      const command = lintableEditOf({
        toolName: 'Write',
        filePath,
        exists: true,
        denoShebang: false,
        extension: 'ts',
        configPath: '/project/oxlint.config.ts',
      })
      return { command, filePath, configPath: '/project/oxlint.config.ts' }
    }),
  ],
  ([{ command, filePath, configPath }]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag(
          'RunOxlint',
          ({ filePath: planned, configPath: plannedConfig }) => planned === filePath && plannedConfig === configPath,
        ),
        Match.tag('Skip', () => false),
        Match.tag('RunDeno', () => false),
        Match.exhaustive,
      )),
)

it.prop(
  '∀c_MissingFile_≡PrecedesShebang',
  [
    fc.record({
      toolName: fc.constantFrom(...EDIT_TOOL_NAMES),
      filePath: fc.string({ minLength: 1 }),
    }).map(({ toolName, filePath }) =>
      lintableEditOf({
        toolName,
        filePath,
        exists: false,
        denoShebang: true,
        extension: 'ts',
        configPath: '/p/oxlint.config.ts',
      })
    ),
  ],
  ([command]) => isSkipFor(command, 'file-missing'),
)

it.prop(
  '∀c_NotLintableExtension_≡PrecedesConfig',
  [
    fc.record({
      toolName: fc.constantFrom(...EDIT_TOOL_NAMES),
      filePath: fc.string({ minLength: 1 }),
    }).map(({ toolName, filePath }) =>
      lintableEditOf({
        toolName,
        filePath,
        exists: true,
        denoShebang: false,
        extension: 'md',
        configPath: '/p/oxlint.config.ts',
      })
    ),
  ],
  ([command]) => isSkipFor(command, 'not-lintable-extension'),
)
