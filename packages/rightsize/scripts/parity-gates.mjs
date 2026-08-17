#!/usr/bin/env node
// Gate 3 — stale `src/...` paths referenced by MAPPING rows.
// Every backticked `src/...` span (in `rs` or `note`) must exist on disk.
// A renamed-away file in the committed mapping rows fails here, so the
// committed parity matrix can never document a dead path.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { MAPPING } from './parity-enumerate.mjs'

export { MAPPING }

const REF_RE = /`([^`]+)`/g

const PKG_ROOT = path.resolve(import.meta.dirname, '..')

/**
 * Every `row-key: ref` pair whose backticked `src/…` span names no file on
 * disk (globs match by suffix).
 *
 * @param {Record<string, { rs?: string, note?: string }>} mapping
 * @returns {string[]}
 */
export const staleMappingPathsFor = (mapping) => {
  const missing = []
  for (const [key, row] of Object.entries(mapping)) {
    const joined = `${row.rs ?? ''}\n${row.note ?? ''}`
    for (const m of joined.matchAll(REF_RE)) {
      const ref = m[1]
      if (!ref.startsWith('src/')) continue
      const norm = ref.slice('src/'.length).replace(/[)`.,]+$/, '')
      const onDisk = hasGlob
        ? readdirSync(PKG_ROOT, { recursive: true }).some((f) => String(f).replaceAll('\\', '/').endsWith(norm))
        : existsSync(path.join(PKG_ROOT, norm))
      if (!onDisk) missing.push(`${key}: ${ref}`)
    }
  }
  return missing
}
