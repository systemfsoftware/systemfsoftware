# Evidence: a working Astryx app

Source: `systemfsoftware/wireblast` at `91c50bf42`, `apps/web`. Paths below are relative to `apps/web`. This file is storage: it is never read as a rule. It names files and lines; the product's own values (colors, fonts, theme name) are deliberately not copied into the pack.

## Setup (astryx-styles-and-providers-load-at-every-root.md)

| File:line                      | What it shows                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `src/index.css:1-2`            | the global stylesheet begins with `@import "@astryxdesign/core/reset.css"` then `@astryxdesign/core/astryx.css`       |
| `src/index.css:3`              | the font package is imported in the same stylesheet, because the theme names a family and does not load it            |
| `src/main.ts:5-6`              | the entry imports `./index.css`, then the generated theme CSS                                                         |
| `src/ThemedApp.tsx:1-3`        | `LayerProvider`, `LinkProvider` and `Theme` imported from `@astryxdesign/core/Layer`, `/Link`, `/theme`               |
| `src/ThemedApp.tsx:15-21`      | the root nests `Theme` (theme and mode) > `LinkProvider component={Link}` (TanStack Router) > `LayerProvider` > `App` |
| `.storybook/preview.tsx:1-3`   | the preview imports the same three providers                                                                          |
| `.storybook/preview.tsx:15-16` | the preview imports the same global stylesheet and generated theme CSS                                                |
| `.storybook/preview.tsx:46-53` | every story is wrapped in `LinkProvider`, `Theme` (mode from the story's theme global) and `LayerProvider`            |
| `AGENTS.md:93-95`              | the CLI-written block: "SETUP ... without these, components render unstyled", with the two imports                    |

## Theme (astryx-themes-are-defined-and-built-before-typecheck.md)

| File:line                         | What it shows                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/theme/<name>-theme.ts:1-2`   | `defineTheme` from `@astryxdesign/core/theme`, `neutralTheme` from `@astryxdesign/theme-neutral`         |
| `src/theme/<name>-theme.ts:13-15` | `export default defineTheme({ name, extends: neutralTheme, ... })`                                       |
| `src/theme/<name>-theme.ts:17-29` | typography, motion, radius and color written as differences from the base                                |
| `src/theme/<name>-theme.ts:31-57` | per-component overrides under `components`, keyed by component and variant, valued by tokens             |
| `package.json:20`                 | `theme:build`: `astryx theme build <theme source> --out <theme>.css`                                     |
| `package.json:21-22`              | `pretypecheck` and `prebuild` both run `theme:build`                                                     |
| `.gitignore:9-12`                 | the generated `.js`, `.css`, `.d.ts` and `.variants.d.ts` are ignored, so a skipped build cannot resolve |
| `src/atoms/appearance.atom.ts:2`  | the app imports the generated theme object, not the source file                                          |
| `AGENTS.md:108`                   | "Brand/accent via `astryx theme` — never override --color-* in :root"                                    |

## StyleX build (stylex-compiles-at-build-into-the-entry-stylesheet.md)

| File:line                               | What it shows                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `vite.config.ts:2`                      | `import stylex from '@stylexjs/unplugin'`                                                                                      |
| `vite.config.ts:36-39`                  | `stylex.vite({ useCSSLayers: true, cssInjectionTarget: (fileName) => /(^\|\/)(index\|preview)-[\w-]+\.css$/.test(fileName) })` |
| `vite.config.ts:51`                     | the entry-CSS guard plugin is registered                                                                                       |
| `vite-plugin-stylex-entry-css.ts:5-10`  | why: the unplugin's default target is hash-blind, falls back to the first emitted CSS asset, and dev hides the fault           |
| `vite-plugin-stylex-entry-css.ts:11`    | the marker: the StyleX sheet's `@layer priority` block                                                                         |
| `vite-plugin-stylex-entry-css.ts:36-47` | build-only, runs in `closeBundle` over every emitted `.html` and `.css` under `outDir`                                         |
| `vite-plugin-stylex-entry-css.ts:53-58` | throws when no stylesheet holds the sheet                                                                                      |
| `vite-plugin-stylex-entry-css.ts:66-73` | throws when the sheet is in a stylesheet no built document links                                                               |
| `vite-plugin-stylex-entry-css.ts:75-84` | throws when a document links stylesheets but not the StyleX one                                                                |

## Component usage (astryx-components-first-styles-from-typed-vars.md)

| File:line                 | What it shows                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md:12`            | WEB8: StyleX, props first, typed vars keyed by raw custom-property name, `xstyle` or `stylex.props` never both, never beside `style`/`className` |
| `AGENTS.md:97-100`        | the CLI workflow: `astryx build`, `astryx template`, `astryx component` before writing UI                                                        |
| `AGENTS.md:103-106`       | no layout `<div>`; frame first with an app shell; dense data as rows; status as dot or token                                                     |
| `AGENTS.md:107`           | custom styling: props first, else StyleX with typed vars, no raw hex or px                                                                       |
| `AGENTS.md:109`           | the self-check before finishing                                                                                                                  |
| `AGENTS.md:112-117`       | `search`, `component --list`, `docs <topic>`, `swizzle`, `upgrade --apply`                                                                       |
| `src/theme/panel.ts:1-11` | a style object built only from `colorVars`, `radiusVars` and `spacingVars` keyed by custom-property name                                         |

## Navigation (navigation-is-href-on-astryx-components.md)

| File:line              | What it shows                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md:8`          | WEB4: in-app navigation is `href` on an Astryx component; never `onClick={() => navigate(...)}`, never a `#` href |
| `AGENTS.md:45`         | the Navigation section WEB4 points to                                                                             |
| `src/ThemedApp.tsx:16` | `LinkProvider component={Link}` routes Astryx hrefs through the router                                            |

## Upstream behaviour checked in the Astryx source (github.com/facebook/astryx at `fccd771`)

| File                                                  | What it shows                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/Link/useLinkComponent.test.tsx:78` | "returns native `<a>` by default (no provider, no as)": without `LinkProvider` a link is a plain anchor          |
| `packages/core/src/Link/Link.test.tsx:52-87`          | a `Link` without `href` falls back to a `type="button"` element                                                  |
| `packages/core/src/Layer/LayerProvider.tsx:33-47`     | `LayerProvider` is the app-level provider for toast, sheet and imperative modals; optional, with a lazy fallback |
