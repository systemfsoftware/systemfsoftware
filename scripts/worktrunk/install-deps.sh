#!/usr/bin/env bash
# Worktrunk pre-start: install dependencies.
# Invoked by .config/wt.toml. Arg: worktree_path

set -e

WORKTREE_PATH="${1:?worktree_path required}"

echo "install-deps: installing dependencies in worktree..."
cd "$WORKTREE_PATH"

# Detect package manager and run install.
if [[ -f "pnpm-lock.yaml" ]]; then
    corepack pnpm install --frozen-lockfile
elif [[ -f "package-lock.json" ]]; then
    npm ci
elif [[ -f "yarn.lock" ]]; then
    yarn install --frozen-lockfile
elif [[ -f "bun.lock" ]]; then
    bun install --frozen-lockfile
elif [[ -f "Cargo.toml" ]]; then
    cargo build
elif [[ -f "go.mod" ]]; then
    go mod download
elif [[ -f "Gemfile" ]]; then
    bundle install
elif [[ -f "pyproject.toml" || -f "requirements.txt" ]]; then
    pip install -e . 2>/dev/null || pip install -r requirements.txt 2>/dev/null || true
else
    echo "install-deps: no recognized package manager, skipping"
fi

echo "install-deps: done"
