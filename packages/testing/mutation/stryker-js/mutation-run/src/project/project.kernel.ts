import type { FileDescription, FileDescriptions, Location, Position } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Predicate from 'effect/Predicate'
import type { OpenEndLocation } from 'mutation-testing-report-schema'

import { createFileMatcher } from '../config/file-matcher.js'

export const ALWAYS_IGNORE = Object.freeze([
  'node_modules',
  '.git',
  '*.tsbuildinfo',
  '/stryker.log',
  '.next',
  '.nuxt',
  '.svelte-kit',
])

export const IGNORE_PATTERN_CHARACTER = '!'
export const MUTATION_RANGE_REGEX = /(.*?):((\d+)(?::(\d+))?-(\d+)(?::(\d+))?)$/

export function unionFileDescriptions(first: FileDescription, second?: FileDescription): FileDescription {
  if (second) {
    if (Array.isArray(first.mutate) && Array.isArray(second.mutate)) {
      return { mutate: [...second.mutate, ...first.mutate] }
    } else if (second.mutate === true) {
      return { mutate: true }
    }
    return { mutate: first.mutate || second.mutate }
  }
  return first
}

export function intersectFileDescriptions(first: FileDescription, second: FileDescription): FileDescription {
  if (Array.isArray(first.mutate) && Array.isArray(second.mutate)) {
    const secondMutate = second.mutate
    const intersectedRanges = first.mutate
      .flatMap((firstRange) =>
        secondMutate.map((secondRange) => {
          const startLine = Math.max(firstRange.start.line, secondRange.start.line)
          const endLine = Math.min(firstRange.end.line, secondRange.end.line)
          if (startLine > endLine) {
            return
          }
          const startColumn = firstRange.start.line === startLine ? firstRange.start.column : secondRange.start.column
          const endColumn = firstRange.end.line === endLine ? firstRange.end.column : secondRange.end.column
          return {
            start: { line: startLine, column: startColumn },
            end: { line: endLine, column: endColumn },
          }
        })
      )
      .filter(Predicate.isNotNullish)
    return { mutate: intersectedRanges }
  } else if (first.mutate === true) {
    return second
  } else if (second.mutate === true) {
    return first
  }
  return { mutate: false }
}

export function filterMutatePattern(
  fileNames: Iterable<string>,
  mutatePattern: string,
): Map<string, FileDescription> {
  const mutationRangeMatch = MUTATION_RANGE_REGEX.exec(mutatePattern)
  let mutate: FileDescription['mutate'] = true
  if (mutationRangeMatch) {
    const [, newPattern, , startLine, startColumn = '0', endLine, endColumn = Number.MAX_SAFE_INTEGER.toString()] =
      mutationRangeMatch
    mutatePattern = newPattern ?? mutatePattern
    mutate = [
      {
        start: {
          line: parseInt(startLine ?? '1', 10) - 1,
          column: parseInt(startColumn, 10),
        },
        end: { line: parseInt(endLine ?? '1', 10) - 1, column: parseInt(endColumn, 10) },
      },
    ]
  }
  const matches = createFileMatcher(mutatePattern, false)
  const inputFiles = new Map<string, FileDescription>()
  for (const fileName of fileNames) {
    if (matches(fileName)) {
      inputFiles.set(fileName, { mutate })
    }
  }
  return inputFiles
}

export function resolveFileDescriptions(
  inputFileNames: string[],
  mutatePatterns: readonly string[],
  targetMutatePatterns: string[] | undefined,
): FileDescriptions {
  const mutateInputFileMap = new Map<string, FileDescription>()
  inputFileNames.forEach((fileName) => mutateInputFileMap.set(fileName, { mutate: false }))
  for (const pattern of mutatePatterns) {
    if (pattern.startsWith(IGNORE_PATTERN_CHARACTER)) {
      const files = filterMutatePattern(mutateInputFileMap.keys(), pattern.substring(1))
      for (const fileName of files.keys()) {
        mutateInputFileMap.set(fileName, { mutate: false })
      }
    } else {
      const files = filterMutatePattern(inputFileNames, pattern)
      for (const [fileName, file] of files) {
        mutateInputFileMap.set(fileName, unionFileDescriptions(file, mutateInputFileMap.get(fileName)))
      }
    }
  }
  if (targetMutatePatterns) {
    const seen = new Map<string, FileDescription>()
    for (const pattern of targetMutatePatterns) {
      const files = filterMutatePattern(mutateInputFileMap.keys(), pattern)
      for (const [fileName, description] of files) {
        const current = mutateInputFileMap.get(fileName)
        if (current === undefined) continue
        const intersected = intersectFileDescriptions(current, description)
        seen.set(fileName, unionFileDescriptions(intersected, seen.get(fileName)))
      }
    }
    for (const fileName of mutateInputFileMap.keys()) {
      const descriptionInSeen = seen.get(fileName)
      if (descriptionInSeen) {
        mutateInputFileMap.set(fileName, descriptionInSeen)
      } else {
        mutateInputFileMap.set(fileName, { mutate: false })
      }
    }
  }
  return Object.fromEntries(mutateInputFileMap)
}

export function resolveTestFiles(inputFileNames: string[], testFilePatterns: readonly string[]): string[] {
  if (testFilePatterns.length === 0) {
    return []
  }
  const resolvedTestFiles: string[] = []
  for (const pattern of testFilePatterns) {
    const matches = createFileMatcher(pattern, false)
    const matchedFiles = inputFileNames.filter((fileName) => matches(fileName))
    resolvedTestFiles.push(...matchedFiles)
  }
  return [...new Set(resolvedTestFiles)]
}

function reportPositionToStrykerPosition({ line, column }: Position): Position {
  return { line, column }
}

export function reportOpenEndLocationToStrykerLocation({ start, end }: OpenEndLocation): OpenEndLocation {
  if (end === undefined) {
    return { start: reportPositionToStrykerPosition(start) }
  }
  return {
    start: reportPositionToStrykerPosition(start),
    end: reportPositionToStrykerPosition(end),
  }
}

export function reportLocationToStrykerLocation({ start, end }: Location): Location {
  return {
    start: reportPositionToStrykerPosition(start),
    end: reportPositionToStrykerPosition(end),
  }
}
