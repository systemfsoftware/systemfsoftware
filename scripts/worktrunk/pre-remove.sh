#!/usr/bin/env bash
# Worktrunk pre-remove: unregister this worktree from the primary's .repos/.
# Invoked by .config/wt.toml. Args: worktree_path [primary_worktree_path]
#
# Runs inside the worktree being removed. Only removes the .repos/<branch>
# symlink if it points back at this worktree — never touches a real dir.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/worktrunk/lib.sh
. "$SCRIPT_DIR/lib.sh"

WORKTREE_PATH="${1:?worktree_path required}"
PRIMARY_PATH="${2:-$(resolve_primary_repo "$WORKTREE_PATH" 2>/dev/null || true)}"

if [[ -z "$PRIMARY_PATH" ]]; then
    echo "pre-remove: no primary, skipping"
    exit 0
fi

branch="$(git -C "$WORKTREE_PATH" branch --show-current 2>/dev/null || true)"
[[ -z "$branch" ]] && exit 0
name="${branch//\//-}"
name="${name//\\/-}"

link="$PRIMARY_PATH/.repos/$name"
if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "$WORKTREE_PATH" ]]; then
    rm "$link"
    echo "pre-remove: removed .repos/$name"
else
    echo "pre-remove: .repos/$name not pointing here, skipping"
fi
