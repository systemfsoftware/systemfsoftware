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

const findProjectResidual = (text: string): string | undefined =>
  text.includes(PROJECT_FOLDER_TOKEN) ? PROJECT_FOLDER_TOKEN : undefined

const findLookupResidual = (text: string): string | undefined => text.includes(LOOKUP_TOKEN) ? LOOKUP_TOKEN : undefined

const findPatternResidual = (text: string): string | undefined => {
  const match = TOKEN_PATTERN.exec(text)
  return match === null ? undefined : match[0]
}

const findStrayOpen = (text: string): string | undefined => text.includes('<') ? '<' : undefined

const findStrayClose = (text: string): string | undefined => text.includes('>') ? '>' : undefined

const findStrayAngle = (text: string): string | undefined => {
  const open = findStrayOpen(text)
  return open ?? findStrayClose(text)
}

const findKnownResidual = (text: string): string | undefined => {
  const project = findProjectResidual(text)
  return project ?? findLookupResidual(text)
}

const findPatternOrStray = (text: string): string | undefined => {
  const pattern = findPatternResidual(text)
  return pattern ?? findStrayAngle(text)
}

const findResidualToken = (text: string): string | undefined => {
  const known = findKnownResidual(text)
  return known ?? findPatternOrStray(text)
}

const finishExpansion = (
  expanded: string,
  configPath: string,
): Result.Result<string, UnresolvedTokenError> => {
  const residual = findResidualToken(expanded)
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
}
