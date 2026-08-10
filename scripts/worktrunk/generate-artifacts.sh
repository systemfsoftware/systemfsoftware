#!/usr/bin/env bash
# Worktrunk post-start: generate all build artifacts.
# Invoked by .config/wt.toml. Arg: worktree_path
#
# A fresh worktree has none of the gitignored generated files that checks
# depend on. `pnpm build` (or equivalent) produces every one of them so
# tests and checks are green out of the box.
# This must run AFTER install-deps.sh.

set -e

WORKTREE_PATH="${1:?worktree_path required}"

echo "generate-artifacts: generating build artifacts..."
cd "$WORKTREE_PATH"

if [[ -f "pnpm-lock.yaml" ]]; then
    corepack pnpm build
elif [[ -f "package-lock.json" ]]; then
    npm run build
elif [[ -f "yarn.lock" ]]; then
    yarn build
elif [[ -f "bun.lock" ]]; then
    bun run build
elif [[ -f "Cargo.toml" ]]; then
    cargo build
elif [[ -f "go.mod" ]]; then
    go build ./...
else
    echo "generate-artifacts: no recognized build system, skipping"
fi

echo "generate-artifacts: done"
