import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { UnresolvedTokenError } from '../errors/config.schema.js'

export type TokenName = 'projectFolder' | 'packageName' | 'unscopedPackageName'

export interface TokenContext {
  readonly projectFolder: string
  readonly packageName: string
  readonly unscopedPackageName: string
}

export const UNKNOWN_PACKAGE_NAME = 'unknown-package'

export const PROJECT_FOLDER_TOKEN = '<projectFolder>'

export const LOOKUP_TOKEN = '<lookup>'

export type JoinSegments = (folder: string, rest: string) => string

const defaultJoin: JoinSegments = (folder, rest) => {
  const head = folder.replace(/[/\\]+$/, '')
  const tail = rest.replace(/^[/\\]+/, '')
  return Match.value(tail.length === 0).pipe(
    Match.when(true, () => head),
    Match.when(false, () => `${head}/${tail}`),
    Match.exhaustive,
  )
}

const TOKEN_PATTERN = /<[^<>]*>/

const stripScopePrefix = (name: string): string =>
  Match.value(name.indexOf('/') > 0).pipe(
    Match.when(true, () => name.slice(name.indexOf('/') + 1)),
    Match.when(false, () => name),
    Match.exhaustive,
  )

export const unscopedPackageName = (packageName: string): string =>
  Match.value(packageName.startsWith('@')).pipe(
    Match.when(true, () => stripScopePrefix(packageName)),
    Match.when(false, () => packageName),
    Match.exhaustive,
  )

const substituteNamedTokens = (text: string, context: TokenContext): string =>
  text
    .replaceAll('<unscopedPackageName>', context.unscopedPackageName)
    .replaceAll('<packageName>', context.packageName)

const substituteProjectFolder = (
  text: string,
  folder: string,
  join: JoinSegments,
): string =>
  Match.value(text.startsWith(PROJECT_FOLDER_TOKEN)).pipe(
    Match.when(true, () => join(folder, text.slice(PROJECT_FOLDER_TOKEN.length))),
    Match.when(false, () => text),
    Match.exhaustive,
  )

const ProjectFolderTag = { _tag: 'ProjectFolder' } as const
type ProjectFolderTag = typeof ProjectFolderTag
interface ProjectFolderProbe extends ProjectFolderTag {}

const LookupTag = { _tag: 'Lookup' } as const
type LookupTag = typeof LookupTag
interface LookupProbe extends LookupTag {}

const PatternTag = { _tag: 'Pattern' } as const
type PatternTag = typeof PatternTag
interface PatternProbe extends PatternTag {}

const StrayOpenTag = { _tag: 'StrayOpen' } as const
type StrayOpenTag = typeof StrayOpenTag
interface StrayOpenProbe extends StrayOpenTag {}

const StrayCloseTag = { _tag: 'StrayClose' } as const
type StrayCloseTag = typeof StrayCloseTag
interface StrayCloseProbe extends StrayCloseTag {}

type ResidualProbe =
  | ProjectFolderProbe
  | LookupProbe
  | PatternProbe
  | StrayOpenProbe
  | StrayCloseProbe

const RESIDUAL_PROBES: readonly ResidualProbe[] = [
  ProjectFolderTag,
  LookupTag,
  PatternTag,
  StrayOpenTag,
  StrayCloseTag,
]

const residualWhen = (
  text: string,
  holds: (candidate: string) => boolean,
  residual: string,
): Option.Option<string> => Option.map(Option.filter(Option.some(text), holds), () => residual)

const probeResidual = (text: string, probe: ResidualProbe): Option.Option<string> =>
  Match.value(probe).pipe(
    Match.tag('ProjectFolder', () =>
      residualWhen(text, (candidate) => candidate.includes(PROJECT_FOLDER_TOKEN), PROJECT_FOLDER_TOKEN)),
    Match.tag('Lookup', () => residualWhen(text, (candidate) => candidate.includes(LOOKUP_TOKEN), LOOKUP_TOKEN)),
    Match.tag('Pattern', () => Option.fromNullishOr(TOKEN_PATTERN.exec(text)?.[0])),
    Match.tag('StrayOpen', () => residualWhen(text, (candidate) => candidate.includes('<'), '<')),
    Match.tag('StrayClose', () => residualWhen(text, (candidate) => candidate.includes('>'), '>')),
    Match.exhaustive,
  )

const findMatchingToken = (text: string): Option.Option<string> =>
  Option.flatMap(
    Arr.findFirst(RESIDUAL_PROBES, (candidate) => Option.isSome(probeResidual(text, candidate))),
    (probe) => probeResidual(text, probe),
  )

const finishExpansion = (
  expanded: string,
  configPath: string,
): Result.Result<string, UnresolvedTokenError> =>
  Option.match(findMatchingToken(expanded), {
    onNone: () => Result.succeed(expanded),
    onSome: (residual) => Result.fail(new UnresolvedTokenError({ token: residual, configPath })),
  })

const expandNonEmpty = (
  trimmed: string,
  context: TokenContext,
  configPath: string,
  join: JoinSegments,
): Result.Result<string, UnresolvedTokenError> => {
  const named = substituteNamedTokens(trimmed, context)
  const expanded = substituteProjectFolder(named, context.projectFolder, join)
  return finishExpansion(expanded, configPath)
}

const dispatchExpansion = (
  trimmed: string,
  context: TokenContext,
  configPath: string,
  join: JoinSegments,
): Result.Result<string, UnresolvedTokenError> =>
  Match.value(trimmed.length === 0).pipe(
    Match.when(true, () => Result.succeed('')),
    Match.when(false, () => expandNonEmpty(trimmed, context, configPath, join)),
    Match.exhaustive,
  )

export const expandTokens = (
  value: string,
  context: TokenContext,
  configPath: string,
  join: JoinSegments = defaultJoin,
): Result.Result<string, UnresolvedTokenError> => dispatchExpansion(value.trim(), context, configPath, join)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema: S } = await import('effect')

  const normalizeAngleFree = (raw: string): string => raw.replaceAll('<', '').replaceAll('>', '')

  const applySubstitutions = (value: string, ctx: TokenContext): string => {
    const trimmed = value.trim()
    return Match.value(trimmed.length === 0).pipe(
      Match.when(true, () => ''),
      Match.when(false, () =>
        substituteProjectFolder(substituteNamedTokens(trimmed, ctx), ctx.projectFolder, defaultJoin)),
      Match.exhaustive,
    )
  }

  const cleanContext = (ctx: TokenContext): TokenContext => ({
    projectFolder: normalizeAngleFree(ctx.projectFolder),
    packageName: normalizeAngleFree(ctx.packageName),
    unscopedPackageName: normalizeAngleFree(ctx.unscopedPackageName),
  })

  it.prop(
    '∀scoped_UnscopedStripsScope_≡Stripped',
    [S.String, S.String],
    ([rawScope, rawName]) => {
      const scope = normalizeAngleFree(rawScope).replaceAll('/', '')
      const name = normalizeAngleFree(rawName).replaceAll('/', '')
      const scoped = `@${scope}/${name}`
      const matches = unscopedPackageName(scoped) === name
      const plain = unscopedPackageName(name) === name
      return matches && plain
    },
  )

  it.prop(
    '∀applied_SubstitutionsMatches_≡Expanded',
    [S.String, S.Struct({
      projectFolder: S.String,
      packageName: S.String,
      unscopedPackageName: S.String,
    })],
    ([raw, ctx]) => {
      const rawClean = normalizeAngleFree(raw)
      const cleanCtx = cleanContext(ctx)
      const applied = applySubstitutions(rawClean, cleanCtx)
      return Result.match(expandTokens(rawClean, cleanCtx, 'config.json'), {
        onSuccess: (out) => out === applied,
        onFailure: () => false,
      })
    },
  )

  it.prop(
    '∀text_Expansion_≡Total',
    [S.String, S.Struct({
      projectFolder: S.String,
      packageName: S.String,
      unscopedPackageName: S.String,
    })],
    ([raw, ctx]) =>
      Result.match(expandTokens(raw, ctx, 'config.json'), {
        onSuccess: (out) => typeof out === 'string',
        onFailure: (err) =>
          Match.value(err).pipe(
            Match.tag('UnresolvedTokenError', (e) => e.token.length > 0 && e.configPath === 'config.json'),
            Match.exhaustive,
          ),
      }),
  )

  it.prop(
    '∀body_StrayOpen_≡NamesOpenBracket',
    [S.String, S.Struct({
      projectFolder: S.String,
      packageName: S.String,
      unscopedPackageName: S.String,
    })],
    ([rawBody, ctx]) => {
      const body = normalizeAngleFree(rawBody)
      return Result.match(expandTokens(`<${body}`, cleanContext(ctx), 'config.json'), {
        onSuccess: () => false,
        onFailure: (err) => err.token === '<' && err.configPath === 'config.json',
      })
    },
  )

  it.prop(
    '∀body_StrayClose_≡NamesCloseBracket',
    [S.String, S.Struct({
      projectFolder: S.String,
      packageName: S.String,
      unscopedPackageName: S.String,
    })],
    ([rawBody, ctx]) => {
      const body = normalizeAngleFree(rawBody)
      return Result.match(expandTokens(`>${body}`, cleanContext(ctx), 'config.json'), {
        onSuccess: () => false,
        onFailure: (err) => err.token === '>' && err.configPath === 'config.json',
      })
    },
  )

  it.prop(
    '∀tokenFree_Expansion_≡Idempotent',
    [S.String, S.Struct({
      projectFolder: S.String,
      packageName: S.String,
      unscopedPackageName: S.String,
    })],
    ([raw, ctx]) => {
      const cleanCtx = cleanContext(ctx)
      return Result.match(expandTokens(normalizeAngleFree(raw), cleanCtx, 'config.json'), {
        onSuccess: (expanded) =>
          Result.match(expandTokens(expanded, cleanCtx, 'config.json'), {
            onSuccess: (again) => again === expanded,
            onFailure: () => false,
          }),
        onFailure: () => false,
      })
    },
  )
}
