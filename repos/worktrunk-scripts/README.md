# worktrunk-scripts

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

Deno hooks for [worktrunk](https://github.com/max-sixty/worktrunk). A new `git worktree` starts empty: its `.git` pointer is absolute, its gitdir links are broken once a directory moves, and its dependencies and codegraph index are missing. These scripts run on worktrunk's lifecycle events and set each new worktree up.

## What each hook does

| Script              | Event                           | What it does                                                                                                                                                        |
| :------------------ | :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pre-start.ts`      | before a worktree is created    | Makes the worktree's `.git` pointer and gitdir links relative, then links the shared entries it needs from the primary worktree. Skips any entry the primary lacks. |
| `copy-codegraph.ts` | after it starts                 | Provisions a codegraph MCP instance for the worktree. If the codegraph MCP is unavailable, it logs that and skips.                                                  |
| `post-switch.ts`    | after switching into a worktree | Runs the post-switch step for that worktree.                                                                                                                        |
| `pre-merge.ts`      | before a merge                  | Removes the worktree's symlinked entries, then stages the rest with `git add -A`.                                                                                   |

Three more scripts are standalone and can be wired the same way: `install-deps.ts` installs dependencies for the package manager it recognizes, `run-package-script.ts` runs one named `package.json` script through the lockfile's package manager, and `generate-artifacts.ts` runs the build system it recognizes. Each skips when it recognizes none. A repo sets the install flags for `install-deps.ts` in its `package.json`, under `"worktrunk": { "installArgs": [...] }`. `run-package-script.ts <worktree_path> <script> [--best-effort]` skips when the repo's `package.json` has no such script, and `--best-effort` logs a failing script without failing the hook. `worktree-to-relative.ts` and `convert-to-relative-paths.ts` rewrite existing worktrees' `.git` paths to relative ones, once, and are idempotent.

## Use it

Install [Deno](https://deno.land/) and worktrunk, then point `.config/wt.toml` in your primary repository at the scripts:

```toml
[hooks]
pre-start = "deno run --allow-read --allow-write --allow-run --allow-env ./scripts/pre-start.ts {{worktree_path}} {{primary_worktree_path}}"
post-start = "deno run --allow-read --allow-write --allow-run --allow-env ./scripts/copy-codegraph.ts {{worktree_path}} {{primary_worktree_path}}"
post-switch = "deno run --allow-run ./scripts/post-switch.ts {{worktree_path}}"
pre-merge = "deno run --allow-read --allow-write --allow-run ./scripts/pre-merge.ts {{worktree_path}}"
```

Each script takes the worktree path as its first argument. `pre-start.ts` and `copy-codegraph.ts` also take the primary worktree path as an optional second argument. When it is omitted, the script finds the primary repository from the shared git common directory.

Every script declares its Deno permissions in its shebang and runs without `-A`. To check the scripts, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Setup, the check command and the layout rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0. See [LICENSE](LICENSE).
