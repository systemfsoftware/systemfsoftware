/**
 * Sandbox.workflow — pure decision for the Sandbox capability.
 *
 * Maps a file list plus sandbox layout into the concrete write plan
 * (which files go where and which need a backup). No I/O; the caller
 * drives the decision through `Workflow.make`.
 */

import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class SandboxCommand extends S.TaggedClass<SandboxCommand>()('SandboxCommand', {
  fileEntries: S.Array(S.Struct({ name: S.String, hasChanges: S.Boolean })),
  basePath: S.String,
  workingDirectory: S.String,
  backupDirectory: S.String,
  inPlace: S.Boolean,
}) {}

export class SandboxDecision extends S.TaggedClass<SandboxDecision>()('SandboxDecision', {
  entries: S.Array(
    S.Struct({ original: S.String, target: S.String, needsBackup: S.Boolean }),
  ),
}) {}

export class SandboxError extends S.TaggedError<SandboxError>()('SandboxError', {
  message: S.String,
}) {}

const relativeOf = (basePath: string, fileName: string): string => {
  if (fileName === basePath) {
    return ''
  }
  if (fileName.startsWith(`${basePath}/`)) {
    return fileName.slice(basePath.length + 1)
  }
  if (fileName.startsWith(basePath)) {
    const trimmed = fileName.slice(basePath.length)
    if (trimmed.startsWith('/')) {
      return trimmed.slice(1)
    }
    return trimmed
  }
  return fileName
}

const joinPosix = (dir: string, relative: string): string => {
  if (relative.length === 0) {
    return dir
  }
  if (dir.endsWith('/')) {
    return `${dir}${relative}`
  }
  return `${dir}/${relative}`
}

const targetFor = (
  inPlace: boolean,
  name: string,
  basePath: string,
  workingDirectory: string,
): string => {
  if (inPlace) {
    return name
  }
  const relative = relativeOf(basePath, name)
  return joinPosix(workingDirectory, relative)
}

const needsBackupFor = (inPlace: boolean, hasChanges: boolean): boolean => {
  if (inPlace) {
    if (hasChanges) {
      return true
    }
  }
  return false
}

const decide = (command: SandboxCommand): Result.Result<SandboxDecision, SandboxError> =>
  Result.succeed(
    new SandboxDecision({
      entries: command.fileEntries.map((entry) => ({
        original: entry.name,
        target: targetFor(command.inPlace, entry.name, command.basePath, command.workingDirectory),
        needsBackup: needsBackupFor(command.inPlace, entry.hasChanges),
      })),
    }),
  )

export const sandboxWorkflow = Workflow.make(SandboxCommand, decide)
