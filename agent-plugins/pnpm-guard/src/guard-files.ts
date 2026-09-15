#!/usr/bin/env -S deno run --allow-read

import * as path from '@std/path'
import { decodePayload, denoExists, isRecord, readStdin, STDIN_CAP_BYTES } from './payload.ts'
import type { EditCommand, StdinResult } from './payload.ts'
import { evaluateGuardPair, formatPolicyVerdict } from './policy.ts'
import type { GuardSources, PolicyVerdict } from './policy.ts'

interface Hunk {
  readonly oldString: string
  readonly newString: string
}

interface ContentPair {
  readonly oldSide: string | undefined
  readonly newSide: string
}

type Extraction =
  | { readonly tag: 'pairs'; readonly pairs: ContentPair[] }
  | { readonly tag: 'contentless' }
  | { readonly tag: 'unrecoverable'; readonly reason: string }

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const toPairs = (pairs: ContentPair[]): Extraction =>
  pairs.length > 0 ? { tag: 'pairs', pairs } : { tag: 'contentless' }

const replaceFirst = (buffer: string, oldString: string, newString: string): string | undefined => {
  const index = buffer.indexOf(oldString)
  return index === -1 ? undefined : buffer.slice(0, index) + newString + buffer.slice(index + oldString.length)
}

type ApplyResult = { readonly tag: 'ok'; readonly content: string } | {
  readonly tag: 'unrecoverable'
  readonly reason: string
}

const applyHunks = (buffer: string, hunks: readonly Hunk[]): ApplyResult => {
  let current = buffer
  for (const hunk of hunks) {
    const next = replaceFirst(current, hunk.oldString, hunk.newString)
    if (next === undefined) {
      return {
        tag: 'unrecoverable',
        reason: `hunk old_string ${JSON.stringify(hunk.oldString)} is not present in the on-disk config content`,
      }
    }
    current = next
  }
  return { tag: 'ok', content: current }
}

const MISSING_OLD_SIDE =
  'there is no on-disk config content to apply the edit to, so the edited result cannot be reconstructed'

const reconstructedPair = (diskContent: string | undefined, hunks: readonly Hunk[]): Extraction => {
  if (diskContent === undefined) {
    return { tag: 'unrecoverable', reason: MISSING_OLD_SIDE }
  }
  const applied = applyHunks(diskContent, hunks)
  return applied.tag === 'ok'
    ? { tag: 'pairs', pairs: [{ oldSide: diskContent, newSide: applied.content }] }
    : applied
}

const hunkFromRecord = (
  record: Record<string, unknown>,
): Hunk | undefined | { tag: 'unrecoverable'; reason: string } => {
  const oldString = record['old_string']
  const newString = record['new_string']
  if (oldString === undefined && newString === undefined) {
    return undefined
  }
  if (typeof oldString === 'string' && typeof newString === 'string') {
    return { oldString, newString }
  }
  return { tag: 'unrecoverable', reason: 'an edit entry is not a valid before/after pair' }
}

const extractEditShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const hunk = hunkFromRecord(input)
  if (hunk === undefined) {
    return { tag: 'contentless' }
  }
  if ('tag' in hunk) {
    return hunk
  }
  return reconstructedPair(diskContent, [hunk])
}

const extractWriteShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const content = input['content']
  if (content === undefined) {
    return { tag: 'contentless' }
  }
  if (typeof content !== 'string') {
    return { tag: 'unrecoverable', reason: 'Write/Create payload carries non-string content' }
  }
  return toPairs([{ oldSide: diskContent, newSide: content }])
}

const entryRecord = (entry: unknown): Record<string, unknown> | undefined => isRecord(entry) ? entry : undefined

const entryHunk = (entry: unknown): Hunk | undefined | { tag: 'unrecoverable'; reason: string } => {
  const record = entryRecord(entry)
  if (record === undefined) {
    return { tag: 'unrecoverable', reason: 'a MultiEdit/Update entry is not a valid before/after pair' }
  }
  return hunkFromRecord(record)
}

type HunkCollection = { readonly tag: 'ok'; readonly hunks: Hunk[] } | {
  readonly tag: 'unrecoverable'
  readonly reason: string
}

type HunkExtractor = (entry: unknown) => Hunk | undefined | { readonly tag: 'unrecoverable'; readonly reason: string }

const collectHunks = (entries: readonly unknown[], toHunk: HunkExtractor): HunkCollection => {
  const hunks: Hunk[] = []
  for (const entry of entries) {
    const hunk = toHunk(entry)
    if (hunk === undefined) {
      continue
    }
    if ('tag' in hunk) {
      return hunk
    }
    hunks.push(hunk)
  }
  return { tag: 'ok', hunks }
}

const pairFromHunks = (diskContent: string | undefined, hunks: readonly Hunk[]): Extraction =>
  hunks.length > 0 ? reconstructedPair(diskContent, hunks) : { tag: 'contentless' }

const extractMultiShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const edits = input['edits']
  if (edits === undefined) {
    return extractEditShape(input, diskContent)
  }
  if (!isArray(edits)) {
    return { tag: 'unrecoverable', reason: 'MultiEdit/Update payload carries non-array edits' }
  }
  const collected = collectHunks(edits, entryHunk)
  return collected.tag === 'ok' ? pairFromHunks(diskContent, collected.hunks) : collected
}

const findReplaceHunk = (entry: unknown): Hunk | undefined | { tag: 'unrecoverable'; reason: string } => {
  const record = entryRecord(entry)
  if (record === undefined) {
    return { tag: 'unrecoverable', reason: 'a morph file_edits entry is not a valid find/replace pair' }
  }
  const find = record['find']
  const replace = record['replace']
  if (find === undefined && replace === undefined) {
    return undefined
  }
  if (typeof find === 'string' && typeof replace === 'string') {
    return { oldString: find, newString: replace }
  }
  return { tag: 'unrecoverable', reason: 'a morph file_edits entry is not a valid find/replace pair' }
}

const extractMorphShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const contentKeys = Object.keys(input).filter((key) => key !== 'file_path')
  if (contentKeys.length === 0) {
    return { tag: 'contentless' }
  }
  const edits = input['edits']
  const fileEdits = input['file_edits']
  if (isArray(edits)) {
    const collected = collectHunks(edits, entryHunk)
    return collected.tag === 'ok' ? pairFromHunks(diskContent, collected.hunks) : collected
  }
  if (isArray(fileEdits)) {
    const collected = collectHunks(fileEdits, findReplaceHunk)
    return collected.tag === 'ok' ? pairFromHunks(diskContent, collected.hunks) : collected
  }
  return {
    tag: 'unrecoverable',
    reason: `raw morph content (${contentKeys.join(', ')}) cannot be turned into a before/after pair`,
  }
}

const toolShapeOf = (name: string): 'edit' | 'write' | 'create' | 'multi' | 'morph' => {
  switch (name) {
    case 'Edit':
      return 'edit'
    case 'Write':
      return 'write'
    case 'Create':
      return 'create'
    case 'Update':
    case 'MultiEdit':
      return 'multi'
    default:
      return 'morph'
  }
}

const extractPairs = (command: EditCommand, diskContent: string | undefined): Extraction => {
  switch (toolShapeOf(command.toolName)) {
    case 'edit':
      return extractEditShape(command.toolInput, diskContent)
    case 'write':
    case 'create':
      return extractWriteShape(command.toolInput, diskContent)
    case 'multi':
      return extractMultiShape(command.toolInput, diskContent)
    case 'morph':
      return extractMorphShape(command.toolInput, diskContent)
  }
}

const WORKSPACE_BASENAME = 'pnpm-workspace.yaml'
const NPMRC_BASENAME = '.npmrc'
const PNPMFILE_BASENAMES: readonly string[] = ['.pnpmfile.mjs', '.pnpmfile.cjs']
const GUARDED_BASENAMES: readonly string[] = [WORKSPACE_BASENAME, NPMRC_BASENAME, ...PNPMFILE_BASENAMES]

const basename = (targetPath: string): string =>
  targetPath.slice(Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\')) + 1)

const isGuardedBasename = (targetPath: string): boolean => GUARDED_BASENAMES.includes(basename(targetPath))

const isPnpmfile = (targetPath: string): boolean => PNPMFILE_BASENAMES.includes(basename(targetPath))

const PLUGIN_MANIFEST_BASENAMES: readonly string[] = ['plugin.json', 'deno.jsonc', 'deno.lock']
const CLAUDE_MANIFEST_BASENAMES: readonly string[] = ['settings.json', 'deno.jsonc', 'deno.lock']

const isEnforcementSurface = (relative: string): boolean => {
  const parts = relative.split('/')
  const head = parts[0] ?? ''
  const marker = parts[2] ?? ''
  if (head === 'agent-plugins' && parts.length >= 3 && (parts[1] ?? '') !== '') {
    return marker === 'src' || marker === 'hooks'
      ? parts.length >= 4
      : parts.length === 3 && PLUGIN_MANIFEST_BASENAMES.includes(marker)
  }
  if (head === '.claude' && (parts[1] ?? '') === 'hooks') {
    return parts.length >= 3
  }
  if (head === '.claude' && parts.length === 2) {
    return CLAUDE_MANIFEST_BASENAMES.includes(parts[1] ?? '')
  }
  return relative === '.claude-plugin/marketplace.json'
}

const humanEditedMessage = (relative: string): string =>
  `Blocked: ${relative} is part of pnpm-guard's enforcement surface (agent-plugins/*/src, agent-plugins/*/hooks, ` +
  'the plugin manifests, .claude/hooks, .claude/settings.json, .claude/deno.jsonc, .claude/deno.lock, and ' +
  '.claude-plugin/marketplace.json). These files are human-edited: ask a human to make this change.'

const pnpmfileVerdict = (pnpmfileName: string): PolicyVerdict => ({
  tag: 'block',
  violations: [{
    setting: pnpmfileName,
    before: 'human-written',
    after: 'agent-written',
    remediation: 'Install-time code is human-written — ask a human to write or review this change.',
  }],
})

const oversizeVerdict: PolicyVerdict = {
  tag: 'cannot-verify',
  reason: `the hook payload exceeded the ${STDIN_CAP_BYTES}-byte input cap`,
}

export interface Fs {
  readonly exists: (target: string) => Promise<boolean>
  readonly readTextFile: (target: string) => Promise<string>
}

const realFs: Fs = {
  exists: denoExists,
  readTextFile: (target) => Deno.readTextFile(target),
}

export interface FileGuardResult {
  readonly exit: 0 | 2
  readonly stderr: string
}

const ALLOW: FileGuardResult = { exit: 0, stderr: '' }

const refuse = (verdict: PolicyVerdict): FileGuardResult => ({
  exit: 2,
  stderr: formatPolicyVerdict(verdict),
})

const relativeTarget = (target: string, root: string): string | undefined => {
  if (!path.isAbsolute(target)) {
    return target
  }
  const relative = path.relative(root, target)
  return relative === '' || relative.startsWith('..') ? undefined : relative
}

const readOldSide = async (fs: Fs, target: string): Promise<string | undefined> => {
  try {
    return await fs.readTextFile(target)
  } catch {
    return undefined
  }
}

const resolveTarget = (root: string, filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.join(root, filePath)

const withEditedSide = (editedBasename: string, edited: string, counterpart: string): GuardSources =>
  editedBasename === WORKSPACE_BASENAME
    ? { workspaceYaml: edited, npmrc: counterpart }
    : { workspaceYaml: counterpart, npmrc: edited }

const decideConfigEdit = async (
  command: EditCommand,
  root: string,
  fs: Fs,
  editedBasename: string,
): Promise<PolicyVerdict> => {
  const counterpartBasename = editedBasename === WORKSPACE_BASENAME ? NPMRC_BASENAME : WORKSPACE_BASENAME
  const diskEdited = await readOldSide(fs, resolveTarget(root, command.filePath))
  const counterpart = (await readOldSide(fs, path.join(root, counterpartBasename))) ?? ''
  const extraction = extractPairs(command, diskEdited)
  switch (extraction.tag) {
    case 'contentless':
      return { tag: 'allow' }
    case 'unrecoverable':
      return { tag: 'cannot-verify', reason: extraction.reason }
    case 'pairs': {
      const pair = extraction.pairs[0]
      return pair === undefined
        ? { tag: 'allow' }
        : evaluateGuardPair(
          withEditedSide(editedBasename, pair.oldSide ?? '', counterpart),
          withEditedSide(editedBasename, pair.newSide, counterpart),
        )
    }
  }
}

export const runFileGuard = async (
  stdin: StdinResult,
  projectRoot: string,
  fs: Fs = realFs,
): Promise<FileGuardResult> => {
  if (stdin.tag === 'too-large') {
    return refuse(oversizeVerdict)
  }
  const command = decodePayload(stdin.content)
  if (command === undefined) {
    return ALLOW
  }
  if (isPnpmfile(command.filePath)) {
    return extractPairs(command, undefined).tag === 'contentless'
      ? ALLOW
      : refuse(pnpmfileVerdict(basename(command.filePath)))
  }
  if (isGuardedBasename(command.filePath)) {
    const verdict = await decideConfigEdit(command, projectRoot, fs, basename(command.filePath))
    return verdict.tag === 'allow' ? ALLOW : refuse(verdict)
  }
  const relative = relativeTarget(command.filePath, projectRoot)
  return relative !== undefined && isEnforcementSurface(relative)
    ? { exit: 2, stderr: humanEditedMessage(relative) }
    : ALLOW
}

if (import.meta.main) {
  try {
    const stdin = await readStdin()
    const result = await runFileGuard(stdin, Deno.cwd())
    if (result.stderr !== '') {
      console.error(result.stderr)
    }
    Deno.exit(result.exit)
  } catch (error) {
    console.error(`pnpm-guard: internal error: ${error instanceof Error ? error.message : String(error)}`)
    Deno.exit(1)
  }
}
