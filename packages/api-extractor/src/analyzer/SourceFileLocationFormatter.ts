import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import type * as ts from 'typescript'

import { convertToSlashes, isUnderOrEqual, relative } from './path-helpers.js'

export interface ISourceFileLocationFormatOptions {
  sourceFileLine?: number | undefined
  sourceFileColumn?: number | undefined
  workingPackageFolderPath?: string | undefined
}

const truthy = <A>(value: A): boolean => Boolean(value)

const relativeToWorkingPackage = (
  sourceFilePath: string,
  workingPackageFolderPath: string | undefined,
): string =>
  Option.fromUndefinedOr(workingPackageFolderPath).pipe(
    Option.filter((workingPackageFolderPath) => workingPackageFolderPath.length > 0),
    Option.filter((workingPackageFolderPath) => isUnderOrEqual(sourceFilePath, workingPackageFolderPath)),
    Option.map((workingPackageFolderPath) => relative(workingPackageFolderPath, sourceFilePath)),
    Option.getOrElse(() => sourceFilePath),
  )

const columnSuffix = (options: ISourceFileLocationFormatOptions): string =>
  Option.fromUndefinedOr(options.sourceFileColumn).pipe(
    Option.filter(truthy),
    Option.map((sourceFileColumn) => `:${sourceFileColumn}`),
    Option.getOrElse(() => ''),
  )

const lineSuffix = (options: ISourceFileLocationFormatOptions): string =>
  Option.fromUndefinedOr(options.sourceFileLine).pipe(
    Option.filter(truthy),
    Option.map((sourceFileLine) => `:${sourceFileLine}${columnSuffix(options)}`),
    Option.getOrElse(() => ''),
  )

export const formatPath = dual<
  (options?: ISourceFileLocationFormatOptions) => (sourceFilePath: string) => string,
  (sourceFilePath: string, options?: ISourceFileLocationFormatOptions) => string
>((args) => typeof args[0] === 'string', (sourceFilePath, options): string => {
  const resolved: ISourceFileLocationFormatOptions = options ?? {}
  return convertToSlashes(relativeToWorkingPackage(sourceFilePath, resolved.workingPackageFolderPath)) +
    lineSuffix(resolved)
})

export const formatDeclaration = dual<
  (workingPackageFolderPath?: string) => (node: ts.Node) => string,
  (node: ts.Node, workingPackageFolderPath?: string) => string
>((args) => typeof args[0] !== 'string', (node, workingPackageFolderPath): string => {
  const sourceFile: ts.SourceFile = node.getSourceFile()
  const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(node.getStart())

  return formatPath(sourceFile.fileName, {
    sourceFileLine: lineAndCharacter.line + 1,
    sourceFileColumn: lineAndCharacter.character + 1,
    workingPackageFolderPath,
  })
})
