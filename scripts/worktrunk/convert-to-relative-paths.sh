#!/usr/bin/env bash
# Worktrunk utility: bulk-convert worktrees on a shared mount.
# Iterates all worktree dirs under a shared root and converts .git files
# from absolute to relative paths.
# Idempotent — safe to run multiple times.

set -e

SHARED_ROOT="${1:-$(pwd)}"

if [[ ! -d "$SHARED_ROOT" ]]; then
    echo "error: $SHARED_ROOT is not a directory"
    exit 1
fi

COUNT=0
for git_file in "$SHARED_ROOT"/*/.git; do
    [[ -f "$git_file" ]] || continue
    gitdir_line=$(head -1 "$git_file")
    [[ "$gitdir_line" != gitdir:* ]] && continue

    abs_path="${gitdir_line#gitdir: }"
    [[ "$abs_path" != /* ]] && continue

    worktree_path=$(dirname "$git_file")
    rel_path=$(realpath --relative-to="$worktree_path" "$abs_path" 2>/dev/null) || continue
    echo "gitdir: $rel_path" > "$git_file"
    echo "  $worktree_path/.git -> $rel_path"
    ((COUNT++))
done

echo "converted $COUNT worktree .git files"
