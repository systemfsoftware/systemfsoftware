#!/usr/bin/env node
/**
 * Stable bin entry. pnpm links `.bin` shims during install, and it silently
 * skips any whose target is missing at that moment — so pointing `bin.attw`
 * straight at `dist/index.mjs` leaves every consumer without an `attw` on a
 * freshly cloned tree, where `dist/` does not exist until the build runs.
 * A later install does not repair it, not even `--force`: pnpm considers the
 * package already linked. This file is committed, so the shim is always
 * created, and the build output is resolved when the command actually runs.
 */
await import('../dist/index.mjs')
