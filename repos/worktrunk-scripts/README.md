# worktrunk-config

> Deno worktree hooks for `worktrunk` automating environment setup, warm-copy indexing, and path isolation.

When creating isolated git worktrees, new checkouts often start cold: index databases must be rebuilt from scratch, nested `.git` references break across directory boundaries, and development dependencies require manual setup. This repository provides executable TypeScript hooks that wire into `worktrunk` lifecycle events (`pre-start`, `post-start`, `post-switch`, `pre-merge`) to make every worktree immediately ready for development.

```toml
# .config/wt.toml
[hooks]
pre-start = "deno run --allow-read --allow-write --allow-run --allow-env ./scripts/pre-start.ts {{worktree_path}} {{primary_worktree_path}}"
post-start = "deno run --allow-read --allow-write --allow-run --allow-env ./scripts/copy-codegraph.ts {{worktree_path}} {{primary_worktree_path}}"
post-switch = "deno run --allow-run ./scripts/post-switch.ts {{worktree_path}}"
pre-merge = "deno run --allow-read --allow-write --allow-run ./scripts/pre-merge.ts {{worktree_path}}"
```

## Quick Start

Ensure [Deno](https://deno.land/) is installed on your workstation, then verify the codebase:

```bash
git clone https://github.com/systemfsoftware/worktrunk-scripts.git
cd worktrunk-scripts
deno task check
```

The hooks execute directly with `deno run` using explicit permission flags declared in each script's shebang.

## Design

Scripts under `scripts/` are standalone CLI entrypoints invoked by `worktrunk` lifecycle events. Shared helpers (git resolution, relative path mapping, filesystem utilities) live under `scripts/lib/`.

## Configuration

In your primary repository, configure `worktrunk` to call the desired hook scripts in `.config/wt.toml`. Every script accepts standard arguments supplied by the runner:

```bash
deno run --allow-read --allow-write --allow-run --allow-env ./scripts/<hook-name>.ts <worktree_path> [primary_path]
```

If the secondary `primary_path` argument is omitted, the hook automatically resolves the primary repository root using the shared git common directory.

## Quality Gates

Code formatting and linting are enforced via `dprint` and `deno lint`:

```bash
deno task fmt       # Format all files using dprint
deno task check     # Run dprint verification and deno lint
```

## Contributing

Development setup, conventions, and workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE) for terms.
