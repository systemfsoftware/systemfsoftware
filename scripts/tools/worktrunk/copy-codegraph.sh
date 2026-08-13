#!/usr/bin/env bash
# Worktrunk post-start: warm-start the CodeGraph index.
# Invoked by .config/wt.toml. Args: worktree_path [primary_worktree_path]
#
# .codegraph/ is gitignored, so a new worktree starts with no index and the
# daemon would cold-index the whole tree (~600MB, minutes). The new branch
# shares the primary's code, so the primary's index is a valid warm start.
#
# Which copy mechanism works is a property of the filesystem, never an
# assumption. All three are tried best-first at run time and the one that
# actually ran is named in the log:
#   sqlite3 .backup      consistent snapshot; fails where WAL's wal-index needs
#                        a shared mmap the filesystem cannot give it (virtio-fs, 9p)
#   cp --reflink=always  instant on copy-on-write filesystems (btrfs, XFS, ZFS)
#   cp                   works everywhere
# --reflink=auto is deliberately NOT used: it degrades to a full copy in silence,
# which is how this script used to report "reflink copy" for a 581MB read+write.
#
# The copy lands on a temp name and is renamed into place. An interrupted run
# must leave no partial file, because the "already warm" guard below is what the
# next run consults, and a 0-byte leftover there suppresses warm-start forever.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/worktrunk/lib.sh
. "$SCRIPT_DIR/lib.sh"

WORKTREE_PATH="${1:?worktree_path required}"
PRIMARY_PATH="${2:-$(resolve_primary_repo "$WORKTREE_PATH" 2>/dev/null)}"

# Provision the worktree's codegraph MCP entry (instance + worktree-local
# .mcp.json pointing at the instance's HOST socket). Best-effort: runs even
# when the index copy below is skipped (re-run, no separate primary). The
# shared omp-container mcp.json entry is container-scoped (/tmp/codegraph.sock
# — mounted per-CWD by the omp wrapper); a host-side agent running in the
# worktree (Claude Code / opencode reading project-root .mcp.json) needs the
# host socket path. The provisioner is VENDORED next to this script (no user
# config or harness paths referenced from the repo); re-vendor it from the
# omp-infra-bootstrap skill when that script changes.
"$SCRIPT_DIR/codegraph-worktree-mcp.sh" "$WORKTREE_PATH" \
  || echo "copy-codegraph: codegraph MCP provisioning skipped (rc=$?)"

if [[ -z "$PRIMARY_PATH" || "$PRIMARY_PATH" == "$WORKTREE_PATH" ]]; then
    echo "copy-codegraph: no separate primary worktree, skipping"
    exit 0
fi

SRC_DB="$PRIMARY_PATH/.codegraph/codegraph.db"
DST_DIR="$WORKTREE_PATH/.codegraph"
DST_DB="$DST_DIR/codegraph.db"

if [[ ! -s "$SRC_DB" ]]; then
    echo "copy-codegraph: no primary index at $SRC_DB, skipping (daemon will index fresh)"
    exit 0
fi

if [[ -s "$DST_DB" ]]; then
    echo "copy-codegraph: worktree already has an index, skipping"
    exit 0
fi

mkdir -p "$DST_DIR"
rm -f "$DST_DB"

TMP_DB="$DST_DB.partial.$$"
trap 'rm -f "$TMP_DB"' EXIT

if command -v sqlite3 >/dev/null 2>&1 &&
    sqlite3 "$SRC_DB" ".backup '$TMP_DB'" 2>/dev/null &&
    [[ -s "$TMP_DB" ]]; then
    MECHANISM="sqlite backup, consistent snapshot"
elif rm -f "$TMP_DB" && cp --reflink=always "$SRC_DB" "$TMP_DB" 2>/dev/null; then
    MECHANISM="reflink, no data moved"
elif rm -f "$TMP_DB" && cp "$SRC_DB" "$TMP_DB" 2>/dev/null; then
    MECHANISM="full byte copy, no reflink on this filesystem"
else
    echo "copy-codegraph: every copy mechanism failed, skipping (daemon will index fresh)"
    exit 0
fi

mv "$TMP_DB" "$DST_DB"
echo "copy-codegraph: index warm-started ($MECHANISM)"
