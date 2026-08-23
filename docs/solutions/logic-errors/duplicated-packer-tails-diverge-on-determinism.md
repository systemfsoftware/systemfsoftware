---
title: Two entrypoints to one packer diverged on gzip mtime while the docstring claimed both zeroed it
date: 2026-08-23
category: docs/solutions/logic-errors
module: in-memory npm package
problem_type: logic_error
component: tooling
symptoms:
  - "The same authored file tree packs to different bytes depending on which entrypoint is called"
  - "A tarball's gzip header carries the wall-clock time, so byte comparison of two runs never matches"
  - "The module docstring advertises `mtime 0` and one of the two entrypoints does not honour it"
root_cause: copy_paste_divergence
resolution_type: code_change
severity: medium
tags: [determinism, gzip, tarball, copy-paste, docstring-drift, npm-package]
---

# Two entrypoints to one packer diverged on gzip mtime while the docstring claimed both zeroed it

## Problem

An in-process ustar + gzip packer exposed two entrypoints over the same
machinery: one taking a built package object, one taking a raw file map. Both
built the same entry list, sorted it identically, and called the same tar
writer. Only one passed `{ mtime: 0 }` to `gzipSync`.

The module's own docstring listed `mtime 0` as a property of the packer, and
the package README advertised "sorted entry names, zeroed mtime" for both
entrypoints. The file-map entrypoint had never honoured it.

Nothing failed. Every test passed, because the tests extract the tarball and
compare its contents — and the gzip header's MTIME field is not part of the
extracted contents. The divergence is invisible to any assertion that does not
compare the compressed bytes.

## Root cause

The two entrypoints were copy-paste siblings. Each carried its own tail:

```ts
// entrypoint A
entries.sort(byName)
const tar = buildTar(entries)
return gzipSync(tar, { mtime: 0 })

// entrypoint B — same three steps, one argument short
entries.sort(byName)
return gzipSync(buildTar(entries))
```

Nothing forced the two tails to agree. The shared steps were shared by
convention, not by construction, so a property added to one — the zeroed mtime
— did not reach the other. The docstring was written once, describing the
intended behaviour of "the packer", and then described only one of its two
doors.

This is the copy-paste failure mode in its quiet form. The loud form is two
copies drifting in logic a reader can see. The quiet form is two copies drifting
in an argument, where the drift is a property nobody asserts.

## Solution

Collapse the shared tail into one function and let both entrypoints call it, so
the property is structural rather than remembered:

```ts
/** Sort by entry name, lay out the ustar blocks, and gzip with a zeroed mtime. */
function packEntries(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return gzipSync(buildTar(entries), { mtime: 0 })
}
```

Both entrypoints end with `return packEntries(entries)`. There is now one place
the mtime is set, so the docstring's claim is true of every caller by
construction.

## Verifying a claim the test suite cannot see

The round-trip tests could not catch this and still cannot: they assert on
extracted contents, and the defect lives in the container's header. The check
has to read the bytes the claim is about — the gzip MTIME field is bytes 4-7,
little-endian:

```ts
const mtimeOf = (bytes) => bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)
```

Both entrypoints now report `0`. Before the fix, the file-map entrypoint
reported the current epoch second.

## Prevention

- When two functions share a tail, extract the tail. A property that must hold
  for both is only reliable when there is one place to set it.
- A docstring describing "the X" when there are two doors into X is a claim
  about both. Either make it true of both or name which door it describes.
- A determinism claim needs an assertion that compares the bytes the claim is
  about. A round-trip test proves the payload survives; it says nothing about
  the envelope. If the advertised property is byte-level, the test has to be
  byte-level.
- Reach for this check whenever a packer, serialiser, or archive writer claims
  reproducibility: the timestamp fields are the usual leak, and they are
  invisible to content-level assertions.
