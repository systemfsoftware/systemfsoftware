import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import type * as Path from 'effect/Path'

import type { LogLevel } from './collector/message-router.schema.js'

const redText = (text: string): string => `\u001B[31m${text}\u001B[39m`

const yellowText = (text: string): string => `\u001B[33m${text}\u001B[39m`

const cyanText = (text: string): string => `\u001B[36m${text}\u001B[39m`

const greenText = (text: string): string => `\u001B[32m${text}\u001B[39m`

const boldText = (text: string): string => `\u001B[1m${text}\u001B[22m`

export const bannerText = (version: string): string =>
  '\n' + boldText(`api-extractor ${version} ` + cyanText(' - https://api-extractor.com/') + '\n')

const upwardOnlyPathPattern = /^[./\\]+$/

const isUpwardOnly = (relativePath: string): boolean =>
  relativePath.length === 0 || upwardOnlyPathPattern.test(relativePath)

const formatConcisely = (pathToConvert: string, baseFolder: string, path: Path.Path): string =>
  Match.value(path.relative(pathToConvert, baseFolder)).pipe(
    Match.when(isUpwardOnly, () => `./${path.relative(baseFolder, pathToConvert).replace(/\\/g, '/')}`),
    Match.orElse(() => path.resolve(pathToConvert)),
  )

export const configPathText = dual<
  (baseFolder: string, path: Path.Path) => (configFilePath: string) => string,
  (configFilePath: string, baseFolder: string, path: Path.Path) => string
>(
  3,
  (configFilePath: string, baseFolder: string, path: Path.Path): string =>
    `Using configuration from ${formatConcisely(configFilePath, baseFolder, path)}`,
)

export const bundledTypeScriptText = (version: string): string =>
  `Analysis will use the bundled TypeScript version ${version}`

export const compilerVersionNoticeText = (targetVersion: string): string =>
  `*** The target project appears to use TypeScript ${targetVersion} which is newer than the` +
  ` bundled compiler engine; consider upgrading API Extractor.`

export const completedSuccessfullyText = (): string => '\nAPI Extractor completed successfully'

export const completedWithErrorsText = (): string => '\n' + redText('API Extractor completed with errors')

export const completedWithWarningsText = (): string => '\n' + yellowText('API Extractor completed with warnings')

export const generatingApiReportText = dual<
  (reportPath: string) => (variant: string) => string,
  (variant: string, reportPath: string) => string
>(2, (variant: string, reportPath: string): string => `Generating ${variant} API report: ${reportPath}`)

export const apiReportUpdatedText = (reportShortPath: string): string =>
  `You have changed the API signature for this project. Updating ${reportShortPath}`

export const apiReportDriftText = dual<
  (expectedShortPath: string) => (actualShortPath: string) => string,
  (actualShortPath: string, expectedShortPath: string) => string
>(
  2,
  (actualShortPath: string, expectedShortPath: string): string =>
    `You have changed the API signature for this project. Please copy the file "${actualShortPath}"` +
    ` to "${expectedShortPath}", or perform a local build (which does this automatically).` +
    ` See the Git repo documentation for more info.`,
)

export const apiReportMissingText = dual<
  (expectedShortPath: string) => (actualShortPath: string) => string,
  (actualShortPath: string, expectedShortPath: string) => string
>(
  2,
  (actualShortPath: string, expectedShortPath: string): string =>
    `The API report file is missing. Please copy the file "${actualShortPath}"` +
    ` to "${expectedShortPath}", or perform a local build (which does this automatically).` +
    ` See the Git repo documentation for more info.`,
)

export const apiReportCreatedText = (reportPath: string): string =>
  `The API report file was missing, so a new file was created. Please add this file to Git:\n${reportPath}`

export const apiReportFolderMissingText = (reportDirectory: string): string =>
  `Unable to create the API report file. Please make sure the target folder exists:\n${reportDirectory}`

export const apiReportUnchangedText = (reportTempShortPath: string): string =>
  `The API report is up to date: ${reportTempShortPath}`

export const apiReportDiffText = (patch: string): string => `Changes to the API report:\n\n${patch}`

export const writingDtsRollupText = (outputPath: string): string => `Writing package typings: ${outputPath}`

export const errorReportText = (message: string): string => '\n' + redText(`ERROR: ${message.trim()}`)

export const debugReportText = (stack: string): string => '\n' + stack

export const initExistsHeaderText = (): string => redText('The output file already exists:')

export const initPathBlockText = (targetPath: string): string => `\n  ${targetPath}\n`

export const initWritesFileText = (targetPath: string): string => greenText('Writing file: ') + targetPath

export const initRecommendedLocationText = (): string =>
  '\nThe recommended location for this file is in the project\'s "config" subfolder,\n' +
  'or else in the top-level folder with package.json.'

const levelFormatter: Readonly<Record<LogLevel, (text: string) => string>> = {
  none: (text) => text,
  error: (text) => redText(`Error: ${text}`),
  warning: (text) => yellowText(`Warning: ${text}`),
  info: (text) => text,
  verbose: (text) => cyanText(text),
}

export const consoleLineText = dual<
  (text: string) => (level: LogLevel) => string,
  (level: LogLevel, text: string) => string
>(2, (level: LogLevel, text: string): string => levelFormatter[level](text))
