---
"@systemfsoftware/gritlint": minor
---

Add the `package-topology` pack. Its `exports-map-shape` rule refuses a workspace manifest whose only entry fields are a top-level `main`/`module`/`types`, whose export map has a wildcard subpath, or whose code entry object carries `default` or `import` but no `types`; `one-access-path` refuses a barrel module that re-exports a bare package's symbols; `no-deep-import` refuses an import, re-export, or dynamic import that names a package's build or source directories, or a TypeScript source file rather than a published subpath. Enable it with `"packs": { "package-topology": {} }`.
