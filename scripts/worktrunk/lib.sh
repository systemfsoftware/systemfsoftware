#!/usr/bin/env bash
# Shared helpers for Worktrunk hook scripts.
# Source from scripts/worktrunk/*.sh

# Returns 0 (prints primary path to stdout) if worktree; 1 if main repo.
resolve_primary_repo() {
    local worktree_root="$1"
    local git_dir git_common_dir
    git_dir="$(cd "$worktree_root" && git rev-parse --git-dir)"
    git_common_dir="$(cd "$worktree_root" && git rev-parse --git-common-dir)"
    if [[ "$git_dir" == "$git_common_dir" ]]; then
        return 1
    fi
    (cd "$worktree_root" && cd "$git_common_dir/.." && pwd)
}
