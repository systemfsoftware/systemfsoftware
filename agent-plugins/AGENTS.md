# agent-plugins/ — gotchas

The root `AGENTS.md` governs; this leaf carries only the delta — what is
specifically wrong in this directory and what an ancestor does not state.

Plugins here are standalone-distributable. Consumers install the plugin
folder via the marketplace or `/plugin install`; they never see the monorepo.

- **Shipped config carries no commentary.** `deno.jsonc`, `plugin.json` and
  `hooks.json` are installed artifacts; rationale lives in the README or this
  file, never in config comments. (Rejected this session: a comment block in
  git-subtrees' `deno.jsonc`.)
- **Links must survive standalone install.** Any reference to the repo uses
  an absolute URL; only files shipped inside the plugin (`LICENSE`) stay
  relative. (Broken this session: `../../AGENTS.md` in the plugin README.)
- **The hybrid layout is intentional.** Root `plugin.json` (agent-plugins.org
  spec) plus `hooks/hooks.json` at the plugin root. Do not "purify" hooks
  into a reverse-domain namespaced directory: no client reads one today, so
  a namespaced copy is inert.
- **`deno.jsonc` invariants hold.** `nodeModulesDir: "none"` keeps the pinned
  `npm:` version winning over a consumer's `node_modules`; no `name`/
  `version`/`exports` plus `publish.exclude: ["**"]` means the plugin cannot
  reach JSR by accident. Touching either is a silent supply-chain change.
- **Root gates still cover these files.** `agent-plugins/` is outside the
  pnpm workspace but inside the root `dprint` scan; format new files with
  the root `dprint` before committing.
