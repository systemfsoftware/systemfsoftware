#!/usr/bin/env bash
# Worktrunk pre-merge: remove symlinked files before merge.
# Invoked by .config/wt.toml. Arg: worktree_path

set -e

readonly ISSUE_SYMLINK_GLOBS=("[0-9]*-*.md" "T[0-9a-fA-F]*-*.md")

WORKTREE_PATH="${1:?worktree_path required}"

# Remove symlinked issue files from worktree root
(
    shopt -s nullglob
    for pattern in "${ISSUE_SYMLINK_GLOBS[@]}"; do
        for symlink_path in "$WORKTREE_PATH"/$pattern; do
            [[ -L "$symlink_path" ]] && rm -f "$symlink_path" && echo "pre-merge: removed symlinked issue $(basename "$symlink_path")"
        done
    done
)

# Stage all changes in git
git -C "$WORKTREE_PATH" add -A
