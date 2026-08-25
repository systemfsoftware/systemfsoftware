import type { Mutant, Position } from '@systemfsoftware/stryker-js-plugin-api/core'

export interface ScriptFile {
  readonly fileName: string
  readonly originalContent: string
  readonly content: string
  readonly modifiedTime: Date
}

export function makeScriptFile(
  content: string,
  fileName: string,
  modifiedTime = new Date(),
): ScriptFile {
  return { content, fileName, originalContent: content, modifiedTime }
}

export function withContent(file: ScriptFile, content: string): ScriptFile {
  return { ...file, content, modifiedTime: new Date() }
}

export function mutateScriptFile(
  file: ScriptFile,
  mutant: Pick<Mutant, 'location' | 'replacement'>,
): ScriptFile {
  const start = getOffset(file, mutant.location.start)
  const end = getOffset(file, mutant.location.end)
  const content = `${file.originalContent.slice(0, start)}${mutant.replacement}${file.originalContent.slice(end)}`
  return { ...file, content, modifiedTime: new Date() }
}

export function resetScriptFile(file: ScriptFile): ScriptFile {
  return { ...file, content: file.originalContent, modifiedTime: new Date() }
}

function getOffset(file: ScriptFile, pos: Position): number {
  const lines = file.originalContent.split('\n')
  const lineCount = Math.min(pos.line, lines.length)
  let offset = 0
  for (let i = 0; i < lineCount; i++) {
    const line = lines[i]
    if (line === undefined) {
      break
    }
    offset += line.length + 1
  }
  offset += pos.column
  return offset
}
