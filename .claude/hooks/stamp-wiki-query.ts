#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write
// PostToolUse hook: records that a wiki-scoped corpus query actually ran.
// guard-protected-writes.ts reads this stamp to gate plan writes, so it is
// written after the command ran, never when one was merely intended.
// Always exits 0 — a PostToolUse hook cannot undo a command that already ran.

import { ensureDirSync } from '@std/fs'
import { dirname } from '@std/path/posix'
import { toText } from '@std/streams'
import { stampPath } from './guard-protected-writes.ts'

const WIKI_SCOPED = /qmd\s+(?:query|search|vsearch)[^|;&]*(?:-c|--collection)(?:\s+|=)wiki\b/

export interface StampPayload {
  readonly tool_input?: { readonly command?: string }
  readonly session_id?: string
}

export const isWikiScopedQuery = (command: string): boolean => WIKI_SCOPED.test(command)

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let payload: StampPayload
  try {
    payload = JSON.parse(raw) as StampPayload
  } catch {
    Deno.exit(0)
  }

  if (!isWikiScopedQuery(payload.tool_input?.command ?? '')) Deno.exit(0)

  const path = stampPath(payload.session_id ?? 'nosession', Deno.env.get('TMPDIR') ?? '/tmp')
  try {
    ensureDirSync(dirname(path))
    Deno.writeTextFileSync(path, '')
  } catch {
    Deno.exit(0)
  }
  Deno.exit(0)
}
