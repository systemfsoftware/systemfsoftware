#!/usr/bin/env -S deno run

import { parse } from 'npm:just-bash@3.2.0'
import type { CommandNode, ScriptNode, SimpleCommandNode, WordNode } from 'npm:just-bash@3.2.0'

type WordPart = WordNode['parts'][number]

const URL_PATTERN = /^(https?:\/\/|git@|git:\/\/)/

const VALUE_FLAGS: Record<string, true> = {
  '--prefix': true,
  '-m': true,
  '--message': true,
}

export interface ParsedSubtreeArgs {
  readonly subcommand: string
  readonly prefix: string
  readonly hasSign: boolean
  readonly hasSquash: boolean
  readonly repoArg: string
  readonly isUrl: boolean
}

function findRepoArg(args: readonly string[], afterIndex: number): string {
  for (let i = afterIndex + 1; i < args.length; i++) {
    const a = args[i]!
    if (VALUE_FLAGS[a] && i + 1 < args.length) {
      i++
      continue
    }
    if (a === '--gpg-sign' && i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
      i++
      continue
    }
    if (a.startsWith('-')) continue
    return a
  }
  return ''
}

export function parseSubtreeArgs(args: readonly string[]): ParsedSubtreeArgs {
  const subIdx = args.indexOf('subtree')
  const subcommand = subIdx === -1 ? (args[0] ?? '') : (args[subIdx + 1] ?? '')

  const prefixArg = args.find(a => a.startsWith('--prefix='))
  let prefix = ''
  if (prefixArg) {
    prefix = prefixArg.slice('--prefix='.length)
  } else {
    const prefixIdx = args.indexOf('--prefix')
    if (prefixIdx !== -1 && prefixIdx + 1 < args.length) {
      prefix = args[prefixIdx + 1]!
    }
  }

  const hasSign = args.includes('-S') || args.some(a => a.startsWith('--gpg-sign'))
  const hasSquash = args.includes('--squash')

  const subPos = subIdx === -1 ? 0 : subIdx + 1
  const repoArg = subcommand === 'add' || subcommand === 'pull' ? findRepoArg(args, subPos) : ''
  const isUrl = repoArg.length > 0 && URL_PATTERN.test(repoArg)

  return { subcommand, prefix, hasSign, hasSquash, repoArg, isUrl }
}

export interface ValidationResult {
  readonly valid: boolean
  readonly reason: string
}

function missingSignMsg(subcommand: string, prefix: string): string {
  return (
    `git subtree ${subcommand} without -S/--gpg-sign.\n` +
    'git subtree creates commits via internal git commit-tree which bypasses\n' +
    `commit.gpgsign config. Result: UNSIGNED commits — GitHub push rejection.\n` +
    `Add -S: git subtree ${subcommand} --prefix=${prefix} <upstream> <branch> --squash -S -m "..."`
  )
}

function missingSquashMsg(subcommand: string, prefix: string): string {
  return (
    `git subtree ${subcommand} without --squash.\n` +
    'Pulls entire upstream commit history into repo object store (thousands of commits).\n' +
    'Always use --squash for vendored subtrees.\n' +
    `Add --squash: git subtree ${subcommand} --prefix=${prefix} <upstream> <branch> --squash -S -m "..."`
  )
}

function urlBlockedMsg(subcommand: string, prefix: string): string {
  const name = prefix.replace(/^repos\//, '').replace(/\/$/, '') || '<name>'
  return (
    `git subtree ${subcommand} with a URL is BLOCKED.\n` +
    'git subtree does `git fetch <url>` then `git rev-parse FETCH_HEAD` to get the commit.\n' +
    'FETCH_HEAD is a transient file — if the fetch fails partially, races with another\n' +
    'operation, or hits a Git edge case, stale FETCH_HEAD causes the wrong content to be\n' +
    'squashed silently.\n' +
    '\n' +
    'Safe workflow — pre-fetch to a named ref, verify, then subtree:\n' +
    `  1. git fetch <url> <branch>:refs/remotes/vendor/${name}\n` +
    `  2. git ls-tree refs/remotes/vendor/${name} -- package.json   # verify upstream content\n` +
    `  3. git subtree ${subcommand} --prefix=${
      prefix || `repos/${name}`
    } refs/remotes/vendor/${name} --squash -S -m "..."`
  )
}

export function validateSubtree(parsed: ParsedSubtreeArgs): ValidationResult {
  if (parsed.subcommand === 'add' || parsed.subcommand === 'pull') {
    if (!parsed.prefix) {
      return {
        valid: false,
        reason:
          'git subtree add/pull without --prefix.\nThis operates at the repository root — will delete files across the entire repo.\nALWAYS include --prefix pointing to the subtree directory.',
      }
    }
    if (parsed.isUrl) {
      return { valid: false, reason: urlBlockedMsg(parsed.subcommand, parsed.prefix) }
    }
    if (!parsed.hasSign) {
      return { valid: false, reason: missingSignMsg(parsed.subcommand, parsed.prefix) }
    }
    if (!parsed.hasSquash) {
      return { valid: false, reason: missingSquashMsg(parsed.subcommand, parsed.prefix) }
    }
    return { valid: true, reason: '' }
  }

  if (parsed.subcommand === 'push') {
    return {
      valid: false,
      reason:
        'git subtree push writes to the UPSTREAM repository, not the local fork.\nSubtrees are READ-ONLY. Update via: git subtree pull --prefix=<dir> <upstream> <branch> --squash -S',
    }
  }

  return { valid: true, reason: '' }
}

function partText(part: WordPart): { text: string; dynamic: boolean } {
  switch (part.type) {
    case 'Literal':
    case 'SingleQuoted':
    case 'Escaped':
      return { text: part.value, dynamic: false }
    case 'DoubleQuoted': {
      let text = ''
      let dynamic = false
      for (const inner of part.parts) {
        const r = partText(inner)
        text += r.text
        dynamic = dynamic || r.dynamic
      }
      return { text, dynamic }
    }
    default:
      return { text: '', dynamic: true }
  }
}

function wordText(word: WordNode): { text: string; dynamic: boolean } {
  let text = ''
  let dynamic = false
  for (const part of word.parts) {
    const r = partText(part)
    text += r.text
    dynamic = dynamic || r.dynamic
  }
  return { text, dynamic }
}

function collectSubstitutions(word: WordNode, pending: ScriptNode[]): void {
  const stack: WordPart[] = [...word.parts]
  while (stack.length > 0) {
    const part = stack.pop()!
    if (part.type === 'CommandSubstitution') {
      pending.push(part.body)
    } else if (part.type === 'DoubleQuoted') {
      stack.push(...part.parts)
    }
  }
}

function scriptOf(statements: ScriptNode['statements']): ScriptNode {
  return { type: 'Script', statements }
}

function visitCommand(cmd: CommandNode, visit: (cmd: SimpleCommandNode) => void, pending: ScriptNode[]): void {
  switch (cmd.type) {
    case 'SimpleCommand':
      visit(cmd)
      if (cmd.name) collectSubstitutions(cmd.name, pending)
      for (const word of cmd.args) collectSubstitutions(word, pending)
      for (const r of cmd.redirections) {
        if (r.target.type === 'Word') collectSubstitutions(r.target, pending)
      }
      break
    case 'FunctionDef':
      visitCommand(cmd.body, visit, pending)
      break
    case 'If':
      for (const clause of cmd.clauses) {
        pending.push(scriptOf(clause.condition))
        pending.push(scriptOf(clause.body))
      }
      if (cmd.elseBody) pending.push(scriptOf(cmd.elseBody))
      break
    case 'For':
    case 'CStyleFor':
    case 'While':
    case 'Until':
      pending.push(scriptOf(cmd.body))
      if (cmd.type === 'While' || cmd.type === 'Until') pending.push(scriptOf(cmd.condition))
      break
    case 'Case':
      for (const item of cmd.items) pending.push(scriptOf(item.body))
      break
    case 'Subshell':
    case 'Group':
      pending.push(scriptOf(cmd.body))
      break
    default:
      break
  }
}

function visitCommands(script: ScriptNode, visit: (cmd: SimpleCommandNode) => void): void {
  const pending: ScriptNode[] = [script]
  while (pending.length > 0) {
    const s = pending.pop()!
    for (const stmt of s.statements) {
      for (const pipeline of stmt.pipelines) {
        for (const cmd of pipeline.commands) {
          visitCommand(cmd, visit, pending)
        }
      }
    }
  }
}

function commandArgs(cmd: SimpleCommandNode): string[] | null {
  const name = cmd.name ? wordText(cmd.name).text : ''
  if (name !== 'git') return null
  const args: string[] = [name]
  for (const word of cmd.args) {
    const { text, dynamic } = wordText(word)
    if (dynamic && text.startsWith('--prefix=')) {
      args.push('--prefix=<expanded>')
    } else {
      args.push(text)
    }
  }
  return args
}

interface HookPayload {
  readonly tool_name?: string
  readonly tool_input?: { readonly command?: string }
}

if (import.meta.main) {
  const raw = await new Response(Deno.stdin.readable).text()
  let payload: HookPayload
  try {
    payload = JSON.parse(raw) as HookPayload
  } catch {
    Deno.exit(0)
  }

  if (payload.tool_name !== 'Bash') Deno.exit(0)
  const command = payload.tool_input?.command ?? ''
  if (command.length === 0) Deno.exit(0)

  let script: ScriptNode
  try {
    script = parse(command)
  } catch {
    Deno.exit(0)
  }

  visitCommands(script, cmd => {
    const args = commandArgs(cmd)
    if (args === null) return
    const result = validateSubtree(parseSubtreeArgs(args))
    if (!result.valid) {
      console.error(`guard-git-subtree: blocked git subtree invocation\n\n${result.reason}`)
      Deno.exit(2)
    }
  })

  Deno.exit(0)
}
