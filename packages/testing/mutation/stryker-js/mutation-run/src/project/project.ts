import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { propertyPath } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import type { MutationTestResult } from 'mutation-testing-report-schema'

import { makeProjectFile, type ProjectFile, withContent } from './project-file.js'

export interface Project {
  readonly fileDescriptions: FileDescriptions
  readonly incrementalReport: MutationTestResult | undefined
  readonly testFiles: readonly string[]
  readonly files: ReadonlyMap<string, ProjectFile>
  readonly filesToMutate: ReadonlyMap<string, ProjectFile>
}

export function makeProject(
  fileDescriptions: FileDescriptions,
  incrementalReport?: MutationTestResult,
  testFiles: readonly string[] = [],
): Project {
  const files = new Map<string, ProjectFile>()
  const filesToMutate = new Map<string, ProjectFile>()
  for (const [name, desc] of Object.entries(fileDescriptions)) {
    const file = makeProjectFile(name, desc.mutate)
    files.set(name, file)
    if (desc.mutate) {
      filesToMutate.set(name, file)
    }
  }
  return {
    fileDescriptions,
    incrementalReport,
    testFiles,
    files,
    filesToMutate,
  }
}

export function isProjectEmpty(project: Project): boolean {
  return project.files.size === 0
}

export function logProjectFiles(
  project: Project,
  log: Logger,
  ignoreRules: readonly string[],
  force: boolean,
  mutatePatterns: readonly string[],
  testFilePatterns: readonly string[] = [],
  basePath: string,
): void {
  if (isProjectEmpty(project)) {
    log.warn(
      `No files found in directory ${basePath} using ignore rules: ${JSON.stringify(ignoreRules)}.
      Make sure you run Stryker from the root directory of your project with the correct "${
        propertyPath<StrykerOptions>()('ignorePatterns')
      }".`.replace(/\s+/g, ' ').trim(),
    )
  } else {
    if (project.filesToMutate.size) {
      const incrementalInfo = project.incrementalReport
        ? ` using incremental report with ${
          Object.values(project.incrementalReport.files).reduce((total, { mutants }) => total + mutants.length, 0)
        } mutant(s), and ${
          Object.values(project.incrementalReport.testFiles ?? {}).reduce((total, { tests }) => total + tests.length, 0)
        } test(s)${force ? '. Force mode is activated, all mutants will be retested' : ''}`
        : ''
      log.info(`Found ${project.filesToMutate.size} of ${project.files.size} file(s) to be mutated${incrementalInfo}.`)
    } else {
      const msg =
        `Warning: No files found for mutation with the given glob expressions. As a result, a dry-run will be performed without actually modifying anything.
          If you intended to mutate files, please check and adjust the configuration.
          Current glob pattern(s) used:
          ${new Intl.ListFormat('en').format(mutatePatterns.map((pattern) => `"${pattern}"`))}.

          To enable file mutation, consider configuring the \`${
          propertyPath<StrykerOptions>()('mutate')
        }\` property in your configuration file or using the --mutate option via the command line.`.replace(/\s+/g, ' ')
          .trim()
      log.warn(msg)
    }
    if (project.testFiles.length > 0) {
      log.info(`Found ${project.testFiles.length} test file(s) matching --testFiles patterns.`)
    }
    if (log.isDebugEnabled()) {
      log.debug(`All input files: ${JSON.stringify([...project.files.keys()], null, 2)}`)
      log.debug(`Files to mutate: ${JSON.stringify([...project.filesToMutate.keys()], null, 2)}`)
      if (project.testFiles.length > 0) {
        log.debug(`Test files: ${JSON.stringify(project.testFiles, null, 2)}`)
      }
    }
  }
}

export function withFile(project: Project, file: ProjectFile): Project {
  const files = new Map(project.files)
  files.set(file.name, file)
  const filesToMutate = new Map(project.filesToMutate)
  if (file.mutate) {
    filesToMutate.set(file.name, file)
  } else {
    filesToMutate.delete(file.name)
  }
  return { ...project, files, filesToMutate }
}

export function withInstrumentedFiles(
  project: Project,
  instrumented: Iterable<{ readonly name: string; readonly content: string }>,
): Project {
  let next = project
  for (const { name, content } of instrumented) {
    const existing = next.files.get(name)
    if (existing === undefined) {
      continue
    }
    const updated = withContent(existing, content)
    next = withFile(next, updated)
  }
  return next
}
