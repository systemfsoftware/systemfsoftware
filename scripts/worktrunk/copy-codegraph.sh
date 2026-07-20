#!/usr/bin/env bash
# Worktrunk pre-start: warm-start the CodeGraph index.
# Invoked by .config/wt.toml. Args: worktree_path [primary_worktree_path]
#
# .codegraph/ is gitignored, so a new worktree starts with no index and the
# daemon would cold-index the whole tree (~400MB, minutes). The new branch
# shares the primary's code, so the primary's index is a valid warm start.
#
# Only the durable DB is copied — never the transient daemon state. sqlite3
# .backup takes a consistent snapshot even while that daemon writes.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/worktrunk/lib.sh
. "$SCRIPT_DIR/lib.sh"

WORKTREE_PATH="${1:?worktree_path required}"
PRIMARY_PATH="${2:-$(resolve_primary_repo "$WORKTREE_PATH" 2>/dev/null)}"

if [[ -z "$PRIMARY_PATH" || "$PRIMARY_PATH" == "$WORKTREE_PATH" ]]; then
    echo "copy-codegraph: no separate primary worktree, skipping"
    exit 0
fi

SRC_DB="$PRIMARY_PATH/.codegraph/codegraph.db"
DST_DIR="$WORKTREE_PATH/.codegraph"
DST_DB="$DST_DIR/codegraph.db"

if [[ ! -f "$SRC_DB" ]]; then
    echo "copy-codegraph: no primary index at $SRC_DB, skipping (daemon will index fresh)"
    exit 0
fi

if [[ -f "$DST_DB" ]]; then
    echo "copy-codegraph: worktree already has an index, skipping"
    exit 0
fi

mkdir -p "$DST_DIR"

if command -v sqlite3 &>/dev/null; then
    if sqlite3 "$SRC_DB" ".backup '$DST_DB'" 2>/dev/null; then
        echo "copy-codegraph: index warm-started (sqlite backup)"
        exit 0
    fi
    echo "copy-codegraph: sqlite backup failed, falling back to reflink copy"
fi

if cp --reflink=auto "$SRC_DB" "$DST_DB" 2>/dev/null; then
    echo "copy-codegraph: index warm-started (reflink copy)"
else
    echo "copy-codegraph: could not copy index, skipping (daemon will index fresh)"
fi
