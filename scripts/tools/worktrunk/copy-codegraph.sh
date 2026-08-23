#!/usr/bin/env bash
# Worktrunk post-start: warm-start the CodeGraph index and register the worktree as a codegraph project.
# Invoked by .config/wt.toml. Args: worktree_path [primary_worktree_path]
#
# .codegraph/ is gitignored, so a new worktree starts with no index and the
# daemon would cold-build the whole tree (~600MB, minutes). The new branch
# shares the primary's code, so the primary's index is a valid warm start.
#
# The warm copy alone registers nothing: `codegraph init` owns the project's
# registration (`.codegraph/` project config, daemon awareness; the DB itself
# stores paths project-relative, verified from codegraph's source, which is
# what makes the copied index a valid warm start in another worktree). It is
# an idempotent no-op once a codegraph.db exists — post-copy it prints
# "Already initialized" and exits 0 without rebuilding — so it runs
# unconditionally at the end, and it is what builds the index when there was
# no primary to copy.
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
# must never leave a partial file, because the "already warm" guard below is
# what the next run consults, and a 0-byte leftover there suppresses the
# warm-start forever (codegraph init still recovers the index on the next run).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/tools/worktrunk/lib.sh
. "$SCRIPT_DIR/lib.sh"

WORKTREE_PATH="${1:?worktree_path required}"
PRIMARY_PATH="${2:-$(resolve_primary_repo "$WORKTREE_PATH" 2>/dev/null || true)}"

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

# Warm-start: copy the primary's index when one exists. Every skip or failure
# falls through to `codegraph init` below, which is the final guarantee.
SRC_DB="$PRIMARY_PATH/.codegraph/codegraph.db"
DST_DIR="$WORKTREE_PATH/.codegraph"
DST_DB="$DST_DIR/codegraph.db"

if [[ -z "$PRIMARY_PATH" || "$PRIMARY_PATH" == "$WORKTREE_PATH" ]]; then
    echo "copy-codegraph: no separate primary worktree, skipping warm copy (codegraph init will build fresh)"
elif [[ ! -s "$SRC_DB" ]]; then
    echo "copy-codegraph: no primary index at $SRC_DB, skipping warm copy (codegraph init will build fresh)"
elif [[ -s "$DST_DB" ]]; then
    echo "copy-codegraph: worktree already has an index, skipping warm copy"
    else
        mkdir -p "$DST_DIR"

        # Sweep partials a previous interrupted run left behind; the trap
        # below only knows this PID's temp name.
        rm -f "$DST_DIR"/codegraph.db.partial.*

        TMP_DB="$DST_DB.partial.$$"
        trap 'rm -f "$TMP_DB"' EXIT HUP INT TERM

    if command -v sqlite3 >/dev/null 2>&1 &&
        sqlite3 "$SRC_DB" ".backup '$TMP_DB'" 2>/dev/null &&
        [[ -s "$TMP_DB" ]]; then
        MECHANISM="sqlite backup, consistent snapshot"
    elif rm -f "$TMP_DB" && cp --reflink=always "$SRC_DB" "$TMP_DB" 2>/dev/null; then
        MECHANISM="reflink, no data moved"
        # sqlite3 .backup was tried and failed above; reflink/cp snapshots are
        # not transactional against a live WAL, so verify when we can. sqlite3
        # absent means the daemon's own first open will detect corruption and
        # rebuild — either way this stays best-effort.
        if command -v sqlite3 >/dev/null 2>&1 &&
            ! sqlite3 "$TMP_DB" "PRAGMA quick_check;" 2>/dev/null | grep -q "^ok"; then
            echo "copy-codegraph: integrity check failed on copied index, dropping it (codegraph init will rebuild fresh)"
            rm -f "$TMP_DB"
            MECHANISM=""
        fi
    elif rm -f "$TMP_DB" && cp "$SRC_DB" "$TMP_DB" 2>/dev/null; then
        MECHANISM="full byte copy, no reflink on this filesystem"
        # Same integrity gate as the reflink branch above.
        if command -v sqlite3 >/dev/null 2>&1 &&
            ! sqlite3 "$TMP_DB" "PRAGMA quick_check;" 2>/dev/null | grep -q "^ok"; then
            echo "copy-codegraph: integrity check failed on copied index, dropping it (full init will rebuild)"
            rm -f "$TMP_DB"
            MECHANISM=""
        fi
    else
        echo "copy-codegraph: every copy mechanism failed, skipping DB copy (codegraph init will build fresh)"
    fi

    if [[ -s "$TMP_DB" ]] && mv "$TMP_DB" "$DST_DB"; then
        echo "copy-codegraph: index warm-started ($MECHANISM)"
    elif [[ -n "${MECHANISM:-}" ]]; then
        echo "copy-codegraph: index copied but rename failed, dropping it (codegraph init will build fresh)"
    fi
fi

# Canonical project init — the step the DB copy cannot replace (see header).
# Runtime-guarded: a machine with codegraph off PATH skips with a log line,
# never a silent "command not found".
CG_BIN="$(command -v codegraph 2>/dev/null || true)"
if [[ -z "$CG_BIN" && -x "$HOME/.local/bin/codegraph" ]]; then
    CG_BIN="$HOME/.local/bin/codegraph"
fi
if [[ -n "$CG_BIN" ]]; then
    # The CLI derives the instance from ITS cwd (folder="$(pwd)"), not from an
    # argument — cd into the worktree so the instance matches the socket path
    # the MCP provisioning above wrote.
    (cd "$WORKTREE_PATH" && "$CG_BIN" init) \
        || echo "copy-codegraph: codegraph init failed (rc=$?) — index left to the daemon"
else
    echo "copy-codegraph: codegraph CLI not found, skipping init (daemon will index fresh)"
fi