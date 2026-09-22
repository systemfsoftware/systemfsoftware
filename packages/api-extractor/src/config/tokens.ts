import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { UnresolvedTokenError } from '../errors/config.js'

export type TokenName = 'projectFolder' | 'packageName' | 'unscopedPackageName'

export interface TokenContext {
  readonly projectFolder: string
  readonly packageName: string
  readonly unscopedPackageName: string
}

export const UNKNOWN_PACKAGE_NAME = 'unknown-package'

export type JoinSegments = (folder: string, rest: string) => string

const defaultJoin: JoinSegments = (folder, rest) => {
  const head = folder.replace(/[/\\]+$/, '')
  const tail = rest.replace(/^[/\\]+/, '')
  const empty = tail.length === 0
  return empty ? head : `${head}/${tail}`
}

const PROJECT_FOLDER_TOKEN = '<projectFolder>'
const LOOKUP_TOKEN = '<lookup>'
const TOKEN_PATTERN = /<[^<>]*>/

const stripScopePrefix = (name: string): string => {
  const slash = name.indexOf('/')
  const valid = slash > 0
  return valid ? name.slice(slash + 1) : name
}

export const unscopedPackageName = (packageName: string): string => {
  const isScoped = packageName.startsWith('@')
  return isScoped ? stripScopePrefix(packageName) : packageName
}

const substituteNamedTokens = (text: string, context: TokenContext): string =>
  text
    .replaceAll('<unscopedPackageName>', context.unscopedPackageName)
    .replaceAll('<packageName>', context.packageName)

const substituteProjectFolder = (
  text: string,
  folder: string,
  join: JoinSegments,
): string => {
  const atStart = text.startsWith(PROJECT_FOLDER_TOKEN)
  return atStart ? join(folder, text.slice(PROJECT_FOLDER_TOKEN.length)) : text
}

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

const probeResidual = (text: string, probe: ResidualProbe): string | undefined =>
  Match.value(probe).pipe(
    Match.tag('ProjectFolder', () => (text.includes(PROJECT_FOLDER_TOKEN) ? PROJECT_FOLDER_TOKEN : undefined)),
    Match.tag('Lookup', () => (text.includes(LOOKUP_TOKEN) ? LOOKUP_TOKEN : undefined)),
    Match.tag('Pattern', () => TOKEN_PATTERN.exec(text)?.[0]),
    Match.tag('StrayOpen', () => (text.includes('<') ? '<' : undefined)),
    Match.tag('StrayClose', () => (text.includes('>') ? '>' : undefined)),
    Match.exhaustive,
  )

const findMatchingToken = (text: string): string | undefined => {
  const probe = RESIDUAL_PROBES.find((candidate) => probeResidual(text, candidate) !== undefined)
  return probe === undefined ? undefined : probeResidual(text, probe)
}

const finishExpansion = (
  expanded: string,
  configPath: string,
): Result.Result<string, UnresolvedTokenError> => {
  const residual = findMatchingToken(expanded)
  return residual === undefined
    ? Result.succeed(expanded)
    : Result.fail(new UnresolvedTokenError({ token: residual, configPath }))
}

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
): Result.Result<string, UnresolvedTokenError> => {
  const empty = trimmed.length === 0
  return empty ? Result.succeed('') : expandNonEmpty(trimmed, context, configPath, join)
}

export const expandTokens = (
  value: string,
  context: TokenContext,
  configPath: string,
  join: JoinSegments = defaultJoin,
): Result.Result<string, UnresolvedTokenError> => dispatchExpansion(value.trim(), context, configPath, join)

const normalizeAngleFree = (raw: string): string => raw.replaceAll('<', '').replaceAll('>', '')

const applySubstitutions = (value: string, ctx: TokenContext): string => {
  const trimmed = value.trim()
  const empty = trimmed.length === 0
  return empty ? '' : substituteProjectFolder(substituteNamedTokens(trimmed, ctx), ctx.projectFolder, defaultJoin)
}

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema: S } = await import('effect')

  const ContextSchema = S.Struct({
    projectFolder: S.String,
    packageName: S.String,
    unscopedPackageName: S.String,
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
    [S.String, ContextSchema],
    ([raw, ctx]) => {
      const rawClean = normalizeAngleFree(raw)
      const projectClean = normalizeAngleFree(ctx.projectFolder)
      const pkgClean = normalizeAngleFree(ctx.packageName)
      const unscopedClean = normalizeAngleFree(ctx.unscopedPackageName)
      const cleanCtx: TokenContext = {
        projectFolder: projectClean,
        packageName: pkgClean,
        unscopedPackageName: unscopedClean,
      }
      const applied = applySubstitutions(rawClean, cleanCtx)
      const res = expandTokens(rawClean, cleanCtx, 'config.json')
      return Result.match(res, {
        onSuccess: (out) => out === applied,
        onFailure: () => false,
      })
    },
  )

  const cleanContext = (ctx: TokenContext): TokenContext => ({
    projectFolder: normalizeAngleFree(ctx.projectFolder),
    packageName: normalizeAngleFree(ctx.packageName),
    unscopedPackageName: normalizeAngleFree(ctx.unscopedPackageName),
  })

  it.prop(
    '∀text_Expansion_≡Total',
    [S.String, ContextSchema],
    ([raw, ctx]) => {
      const res = expandTokens(raw, ctx, 'config.json')
      return Result.match(res, {
        onSuccess: (out) => typeof out === 'string',
        onFailure: (err) =>
          Match.value(err).pipe(
            Match.tag('UnresolvedTokenError', (e) => e.token.length > 0 && e.configPath === 'config.json'),
            Match.exhaustive,
          ),
      })
    },
  )
  it.prop(
    '∀body_StrayOpen_≡NamesOpenBracket',
    [S.String, ContextSchema],
    ([rawBody, ctx]) => {
      const body = normalizeAngleFree(rawBody)
      const res = expandTokens(`<${body}`, cleanContext(ctx), 'config.json')
      return Result.match(res, {
        onSuccess: () => false,
        onFailure: (err) => err.token === '<' && err.configPath === 'config.json',
      })
    },
  )

  it.prop(
    '∀body_StrayClose_≡NamesCloseBracket',
    [S.String, ContextSchema],
    ([rawBody, ctx]) => {
      const body = normalizeAngleFree(rawBody)
      const res = expandTokens(`>${body}`, cleanContext(ctx), 'config.json')
      return Result.match(res, {
        onSuccess: () => false,
        onFailure: (err) => err.token === '>' && err.configPath === 'config.json',
      })
    },
  )

  it.prop(
    '∀tokenFree_Expansion_≡Idempotent',
    [S.String, ContextSchema],
    ([raw, ctx]) => {
      const cleanCtx = cleanContext(ctx)
      const once = expandTokens(normalizeAngleFree(raw), cleanCtx, 'config.json')
      return Result.match(once, {
        onSuccess: (expanded) => {
          const twice = expandTokens(expanded, cleanCtx, 'config.json')
          return Result.match(twice, {
            onSuccess: (again) => again === expanded,
            onFailure: () => false,
          })
        },
        onFailure: () => false,
      })
    },
  )
}
