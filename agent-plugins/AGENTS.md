# AGENTS.md — `agent-plugins/`

Standalone, distributable agent-plugins.org plugins: Deno-runtime only, no pnpm-workspace membership, installed as a folder so consumers never see the monorepo. Root `AGENTS.md` governs; this file carries only the delta. User-facing contract (install, exit codes, safe workflow): each plugin's README.

## Rules

| ID         | Rule                                                                                                                                                                                                   | Gate                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **AGT-C1** | Shipped config files (`deno.jsonc`, `plugin.json`, `hooks.json`) carry no comments; a config rationale moves to the README or this file — never deleted with the comment.                              | `review` — read each shipped config as installed and reject commentary                                   |
| **AGT-L1** | Shipped plugin files reference the repo with absolute URLs; only files inside the plugin folder (LICENSE) link relatively.                                                                             | `review` — open each link from the plugin folder as a consumer would                                     |
| **AGT-H1** | `plugin.json` (agent-plugins.org manifest) and `hooks.json` stay at the plugin root; never move hooks into a reverse-domain namespaced directory — no client reads one, so a namespaced copy is inert. | `review`                                                                                                 |
| **AGT-D1** | Every plugin `deno.jsonc` keeps `nodeModulesDir: "none"`, no `name`/`version`/`exports`, and `publish.exclude: ["**"]`.                                                                                | `deno publish --dry-run` refuses with "Missing 'name' field"; `review` — `nodeModulesDir` stays `"none"` |
| **AGT-G1** | `agent-plugins/` is outside the pnpm workspace but inside the root `dprint` scan: format new files with `pnpm exec dprint fmt <files>` before committing.                                              | `pnpm check:local`                                                                                       |

## Verification

Per-plugin: `deno task check` from the plugin directory (type-check + lint); `deno task test` where the plugin carries a suite. Root gate: `pnpm check:local` after any change.
