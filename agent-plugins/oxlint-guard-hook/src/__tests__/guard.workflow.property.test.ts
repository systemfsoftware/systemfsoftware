import { it } from '@effect/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import { EDIT_TOOL_NAMES } from '../constants.ts'
import { GuardCommand } from '../flow.schema.ts'
import type { GuardPlan } from '../flow.schema.ts'
import { guardPlan } from '../guard.workflow.ts'
import type { GuardUnsupportedToolError } from '../guard.workflow.ts'

const commandArb = S.toArbitrary(GuardCommand)(fc)

const listedToolWith = (overrides: {
  readonly exists?: boolean
  readonly denoShebang?: boolean
  readonly extension?: string
  readonly configPath?: string | null
}) =>
  commandArb.chain((c) => {
    let configPath = c.configPath
    if ('configPath' in overrides) {
      configPath = overrides.configPath ?? null
    }
    return fc.constantFrom(...EDIT_TOOL_NAMES).map((toolName) =>
      new GuardCommand({
        toolName,
        filePath: c.filePath,
        exists: overrides.exists ?? c.exists,
        denoShebang: overrides.denoShebang ?? c.denoShebang,
        extension: overrides.extension ?? c.extension,
        configPath,
      })
    )
  })

const decisionOn = (
  command: GuardCommand,
): Result.Result<GuardPlan, GuardUnsupportedToolError> => guardPlan(command)

const isSuccessFor = (
  command: GuardCommand,
  predicate: (plan: GuardPlan) => boolean,
): boolean =>
  Result.match(decisionOn(command), {
    onFailure: () => false,
    onSuccess: predicate,
  })

it.prop(
  '∀c_UnlistedTool_≡FailCarryingName',
  [commandArb.chain((c) => {
    let filePath = c.filePath
    if (filePath === '') {
      filePath = 'placeholder.ts'
    }
    return fc.stringMatching(/^[a-z]{1,8}$/).map((suffix) =>
      new GuardCommand({
        toolName: `unlisted-${suffix}`,
        filePath,
        exists: c.exists,
        denoShebang: c.denoShebang,
        extension: c.extension,
        configPath: c.configPath,
      })
    )
  })],
  ([command]) =>
    Result.match(decisionOn(command), {
      onFailure: (error) => error.toolName === command.toolName,
      onSuccess: () => false,
    }),
)

it.prop(
  '∀c_ListedTool_≡Success',
  [listedToolWith({})],
  ([command]) => Result.isSuccess(decisionOn(command)),
)

it.prop(
  '∀c_MissingFile_≡SkipFileMissing',
  [listedToolWith({ exists: false })],
  ([command]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag('Skip', ({ reason }) => reason === 'file-missing'),
        Match.orElse(() => false),
      )),
)

it.prop(
  '∀c_DenoShebang_≡RunDenoIdentity',
  [listedToolWith({ exists: true, denoShebang: true, extension: 'ts' })],
  ([command]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag('RunDeno', ({ filePath }) => filePath === command.filePath),
        Match.orElse(() => false),
      )),
)

it.prop(
  '∀c_NoConfig_≡SkipNoConfig',
  [listedToolWith({
    exists: true,
    denoShebang: false,
    extension: 'ts',
    configPath: null,
  })],
  ([command]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag('Skip', ({ reason }) => reason === 'no-oxlint-config'),
        Match.orElse(() => false),
      )),
)

it.prop(
  '∀c_WithConfig_≡RunOxlintIdentity',
  [listedToolWith({
    exists: true,
    denoShebang: false,
    extension: 'ts',
    configPath: '/root/oxlint.config.mts',
  })],
  ([command]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag(
          'RunOxlint',
          ({ filePath, configPath }) => filePath === command.filePath && configPath === command.configPath,
        ),
        Match.orElse(() => false),
      )),
)

it.prop(
  '∀c_MissingFile_≡PrecedesShebang',
  [listedToolWith({
    exists: false,
    denoShebang: true,
    extension: 'ts',
    configPath: null,
  })],
  ([command]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag('Skip', ({ reason }) => reason === 'file-missing'),
        Match.orElse(() => false),
      )),
)

it.prop(
  '∀c_DenoShebang_≡PrecedesNoConfig',
  [listedToolWith({
    exists: true,
    denoShebang: true,
    extension: 'ts',
    configPath: null,
  })],
  ([command]) =>
    isSuccessFor(command, (decision) =>
      Match.value(decision).pipe(
        Match.tag('RunDeno', () => true),
        Match.orElse(() => false),
      )),
)
