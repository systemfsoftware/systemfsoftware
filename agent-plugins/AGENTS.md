# AGENTS.md — `agent-plugins/`

> **Location:** `agent-plugins/` — standalone, distributable agent-plugins.org plugins. Deno-runtime only; no pnpm-workspace membership.
>
> A plugin is installed as a folder (marketplace or `/plugin install`); consumers never see the monorepo. Universal agent rules live in the root `AGENTS.md`; this file carries only the `agent-plugins/` delta. User-facing contract (install, exit codes, safe workflow): each plugin's README.

## Shipped artifacts

```yaml
- id: AGT-C1
  title: Shipped config carries no commentary
  do: ship plugin config files (deno.jsonc, plugin.json, hooks.json) comment-free
  dont: lose a config rationale — it moves to the README or this file, it is never deleted with the comment
  harm: "Measured 2026-08-13: a comment block in git-subtrees' `deno.jsonc` was rejected at review. The failure is silent — no gate fires on a config comment — and the impulse is the norm, so the rejection reads as arbitrary without this rule"
  check: review — the reviewer reads each shipped config as installed and rejects commentary
```

```yaml
- id: AGT-L1
  title: Links survive standalone install
  do: reference the repo from shipped plugin files with absolute URLs; only files shipped inside the plugin folder (LICENSE) link relatively
  dont: reference anything outside the plugin folder (repo root, sibling plugins) with a relative path
  harm: "Measured 2026-08-13: `../../AGENTS.md` in git-subtrees' README resolved to nothing once the plugin was installed standalone; nothing validates links at commit, so the break surfaces only in the consumer's context"
  check: review — the reviewer opens each link from the plugin folder as a consumer would and rejects dead targets
```

## Layout and supply chain

```yaml
- id: AGT-H1
  title: The hybrid layout is intentional
  do: keep the root `plugin.json` (agent-plugins.org manifest) and `hooks/hooks.json` at the plugin root
  dont: move hooks into a reverse-domain namespaced directory — no client reads one today, so a namespaced copy is inert
  harm: unmeasured — derived from the loader's read paths (repos/oh-my-pi/packages/coding-agent/src/discovery/agent-plugin-format.ts reads standard-governed roots), not from a measured break; a spec-pure move would silently disable the guard for every consumer
  check: review — the reviewer confirms hooks stay at the plugin root and no namespaced copy was added
```

```yaml
- id: AGT-D1
  title: deno.jsonc invariants hold
  do: 'keep `nodeModulesDir: "none"` and no `name`/`version`/`exports` plus `publish.exclude: ["**"]` in every plugin config'
  dont: "flip `nodeModulesDir` to \"auto\" — a consumer's `node_modules` copy can then shadow the pinned `npm:` version; add package identity — `deno publish` becomes reachable"
  harm: silent supply-chain behavior change; the identity half fails loudly (check below), the `nodeModulesDir` half has no mechanical gate
  check: run `deno publish --dry-run` — refuses with "Missing 'name' field" (verified 2026-08-13); review — the reviewer confirms `nodeModulesDir` stays "none"
```

## Gates

- **AGT-G1** — `agent-plugins/` is outside the pnpm workspace but inside the root `dprint` scan: format new files with `pnpm exec dprint fmt <files>` before committing. Violating fails loudly — `pnpm check:local` is the check.
- **Verification** — per-plugin: `deno task check` from the plugin directory (type-check + lint; Deno resolves `just-bash` via the plugin's own deno.jsonc regardless of cwd). Root gate: `pnpm check:local` after any change.
