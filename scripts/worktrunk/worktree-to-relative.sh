#!/usr/bin/env bash
# Worktrunk utility: convert all .git/worktrees/*/gitdir paths to relative.
# Useful after moving the primary repo or when worktrees live on a shared mount.
# Idempotent — safe to run multiple times.

set -e

WORKTREE_PATH="${1:-$(pwd)}"
PRIMARY_PATH=$(cd "$WORKTREE_PATH" && git rev-parse --git-common-dir 2>/dev/null)
PRIMARY_PATH=$(cd "$PRIMARY_PATH/.." && pwd 2>/dev/null)

[[ -z "$PRIMARY_PATH" || ! -d "$PRIMARY_PATH/.git" ]] && {
    echo "error: not a git repo at $PRIMARY_PATH"
    exit 1
}

WORKTREES_DIR="$PRIMARY_PATH/.git/worktrees"
[[ ! -d "$WORKTREES_DIR" ]] && { echo "no worktrees"; exit 0; }

COUNT=0
for wt_gitdir_file in "$WORKTREES_DIR"/*/gitdir; do
    [[ -f "$wt_gitdir_file" ]] || continue
    target=$(cat "$wt_gitdir_file")
    [[ "$target" != /* ]] && continue

    base_dir=$(dirname "$wt_gitdir_file")
    rel_path=$(realpath --relative-to="$base_dir" "$target" 2>/dev/null) || continue
    echo "$rel_path" > "$wt_gitdir_file"
    echo "  gitdir: $(basename "$base_dir") -> $rel_path"
    ((COUNT++))
done

echo "converted $COUNT worktree gitdir files"
