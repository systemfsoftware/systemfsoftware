#!/usr/bin/env bash
# Worktrunk pre-start: symlink .issues, register worktree in primary's .repos/,
# convert gitdir paths to relative, disable GitKraken-incompatible settings.
# Invoked by .config/wt.toml. Args: worktree_path [primary_worktree_path]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/worktrunk/lib.sh
. "$SCRIPT_DIR/lib.sh"

# Convert main repo's .git/worktrees/<name>/gitdir to relative path
convert_main_repo_gitdir_to_relative() {
    local worktree_path="${1%/}"
    local primary_path="$2"
    local worktrees_dir="$primary_path/.git/worktrees"
    [[ ! -d "$worktrees_dir" ]] && return 0

    local expected="$worktree_path/.git"
    local wt_gitdir_file target base_dir rel_path
    for wt_gitdir_file in "$worktrees_dir"/*/gitdir; do
        [[ -f "$wt_gitdir_file" ]] || continue
        target=$(cat "$wt_gitdir_file")
        [[ "$target" == "$expected" ]] || continue
        [[ "$target" != /* ]] && continue

        base_dir=$(dirname "$wt_gitdir_file")
        rel_path=$(realpath --relative-to="$base_dir" "$target" 2>/dev/null) || continue
        echo "$rel_path" > "$wt_gitdir_file"
        echo "  gitdir: $(basename "$base_dir") -> $rel_path"
    done
}

# Convert worktree's .git file to relative path (prevents GitKraken issues)
convert_worktree_gitfile_to_relative() {
    local worktree_path="${1%/}"
    local git_file="$worktree_path/.git"

    [[ ! -f "$git_file" ]] && return 0
    local gitdir_line
    gitdir_line=$(head -1 "$git_file")
    [[ "$gitdir_line" != gitdir:* ]] && return 0

    local abs_path="${gitdir_line#gitdir: }"
    [[ "$abs_path" != /* ]] && return 0

    local rel_path
    rel_path=$(realpath --relative-to="$worktree_path" "$abs_path" 2>/dev/null) || return 0
    echo "gitdir: $rel_path" > "$git_file"
    echo "  .git -> $rel_path"
}

# Register this worktree in the primary repo's .repos/ directory as a symlink
# named by the (sanitized) branch: .repos/<branch> -> worktree. Lets the main
# checkout reach every active worktree at a stable path.
register_worktree_in_repos() {
    local worktree_path="$1" primary_path="$2"
    local branch
    branch="$(git -C "$worktree_path" branch --show-current 2>/dev/null || true)"
    [[ -z "$branch" ]] && return 0

    # Mirror the worktree sanitize filter: replace / and \ with -.
    local name="${branch//\//-}"
    name="${name//\\/-}"

    local repos_dir="$primary_path/.repos"
    mkdir -p "$repos_dir"
    ln -sfn "$worktree_path" "$repos_dir/$name"
    echo "pre-start: .repos/$name -> $worktree_path"
}

WORKTREE_PATH="${1:?worktree_path required}"
PRIMARY_PATH="${2:-$(resolve_primary_repo "$WORKTREE_PATH" 2>/dev/null)}"

[[ -n "$PRIMARY_PATH" ]] && convert_main_repo_gitdir_to_relative "$WORKTREE_PATH" "$PRIMARY_PATH"
[[ -n "$PRIMARY_PATH" ]] && convert_worktree_gitfile_to_relative "$WORKTREE_PATH"

# Unset extensions.relativeWorktrees so GitKraken (libgit2) can open the repo.
# Worktrunk/Git sets this when creating worktrees; libgit2 doesn't support it yet.
git -C "$WORKTREE_PATH" config --unset extensions.relativeWorktrees 2>/dev/null || true

if [[ -z "$PRIMARY_PATH" ]]; then
    echo "pre-start: running in primary repo (not a worktree) — done"
    exit 0
fi

register_worktree_in_repos "$WORKTREE_PATH" "$PRIMARY_PATH"

# Symlink the .issues directory if it exists in the primary repo.
ISSUES_DIR="$PRIMARY_PATH/.issues"
WORKTREE_ISSUES="$WORKTREE_PATH/.issues"

if [[ ! -d "$ISSUES_DIR" ]]; then
    echo "pre-start: no .issues directory in primary, skipping symlink"
    exit 0
fi
RELATIVE_ISSUES=$(realpath --relative-to="$WORKTREE_PATH" "$ISSUES_DIR")
[[ -e "$WORKTREE_ISSUES" ]] && rm -rf "$WORKTREE_ISSUES"
ln -s "$RELATIVE_ISSUES" "$WORKTREE_ISSUES"
echo "pre-start: symlinked .issues -> $RELATIVE_ISSUES"
