# repos/AGENTS.md — vendored subtree map

Vendored git subtrees, read-only. Root `AGENTS.md` governs (REPO-S3: amend upstream, never edit `repos/<name>/` content). The `AGENTS.md` files inside each subtree are vendored roots — upstream documentation, not leaves. This file is ours.

## Directory Map

| Subtree       | Upstream                     | Ref policy                          |
| ------------- | ---------------------------- | ----------------------------------- |
| `constitution/` | systemfsoftware/constitution | `main` (rolling)                    |
| `deno-std/`   | denoland/std                 | `release-` tags (monthly snapshots) |
| `effect/`     | Effect-TS/effect             | `effect@3.` tags (v3 line)          |
| `oh-my-pi/`   | can1357/oh-my-pi             | `v` tags                            |
| `oxc/`        | oxc-project/oxc              | `main` (rolling)                    |
| `storybook/`  | storybookjs/storybook        | `v` tags                            |
| `tsdown/`     | rolldown/tsdown              | `v` tags                            |

## Deltas

- **Read-only.** Every file under a subtree is an upstream snapshot; local edits get clobbered on the next pull (REPO-S3).
- **Registry.** `subtrees.toml` at the repo root is the source of truth — one `[[repos]]` block per subtree. Add or remove a subtree only via the git-subtree-vendor skill's scripts; it resolves refs, validates the config, and commits the registration.
- **Updates.** The git-subtree-vendor skill owns the workflow and its gotchas (vendor refs, hooks, foreign tags, gitlinks). This leaf only maps.
