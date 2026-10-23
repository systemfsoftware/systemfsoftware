# Evidence: a working Astryx app

Source for the setup, theme, component usage and navigation rows: `systemfsoftware/wireblast` at `91c50bf42`, `apps/web`; paths in those tables are relative to `apps/web`. This file is storage: it is never read as a rule. It names files and lines; the product's own values (colors, fonts, theme name) are deliberately not copied into the pack.

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

## Stylesheet and layer order (astryx-is-consumed-as-prebuilt-css-under-tailwind-with-one-layer-order.md)

Source for these rows is the Astryx clone at `fccd7713e` (see `upstream.md`), `apps/example-vite-tailwind` and `apps/example-nextjs-tailwind`.

| File:line                                   | What it shows                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `example-vite-tailwind/src/index.css:9`     | `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;` is the first at-rule                          |
| `example-vite-tailwind/src/index.css:11-12` | `tailwindcss/theme.css` imported `layer(theme)`, `tailwindcss/preflight.css` imported `layer(base)`                          |
| `example-vite-tailwind/src/index.css:13-14` | `@astryxdesign/core/reset.css` then `@astryxdesign/core/astryx.css`                                                          |
| `example-vite-tailwind/src/index.css:15`    | the theme CSS (`@astryxdesign/theme-neutral/theme.css`)                                                                      |
| `example-vite-tailwind/src/index.css:16`    | `@astryxdesign/core/tailwind-theme.css`, the token bridge                                                                    |
| `example-vite-tailwind/src/index.css:17`    | `tailwindcss/utilities.css` imported `layer(utilities)`, last                                                                |
| `example-vite-tailwind/src/App.tsx:20-22`   | the header comment: Astryx components for UI, Tailwind utilities for layout, bridge classes `bg-surface`, `text-primary`     |
| `example-vite-tailwind/src/App.tsx:30`      | `<main className="min-h-screen bg-body p-8">`: a bridge class on a layout element                                            |
| `example-nextjs-tailwind/README.md:14`      | the same seven-layer declaration, "declaring all layers upfront"                                                             |
| `example-nextjs-tailwind/README.md:30`      | without the declaration Astryx layers are created after Tailwind's and `className="bg-red-500"` on an Astryx component fails |
| `example-nextjs-tailwind/README.md:49-65`   | the bridge: `rounded-lg bg-surface p-4` and `text-primary` instead of `bg-[var(--color-background-surface)]`                 |
| `example-nextjs-tailwind/README.md:79-84`   | every Astryx component accepts `className`; utilities in the `utilities` layer override `astryx-base`                        |

## Compiled Tailwind sheet for tests (storybook-and-browser-tests-load-the-compiled-tailwind-sheet.md)

Two repos that already do it. Pinned to the commits read on 2026-10-23.

| Repo at commit, file:line                                                                     | What it shows                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| younna-ai-social-media `25c2b99`, `apps/web/package.json:8`                                   | `"compile-css": "npx @tailwindcss/cli -i ./src/styles/global.css -o ./tests/dist/tailwind-compiled.css"`                                                                                                           |
| younna-ai-social-media `25c2b99`, `apps/web/package.json:7`                                   | `prepare` runs `turbo run compile-css` for the web app, so an install produces the sheet                                                                                                                           |
| younna-ai-social-media `25c2b99`, `apps/web/package.json:93`                                  | `@tailwindcss/cli` is a devDependency                                                                                                                                                                              |
| younna-ai-social-media `25c2b99`, `apps/kol-web/.gitignore:32-33`                             | `# Tailwind compiled CSS for tests` then `tests/dist/`: the output is ignored                                                                                                                                      |
| younna-ai-social-media `25c2b99`, `apps/web/tests/setup.ts:1`                                 | the browser test setup begins with `import './dist/tailwind-compiled.css'`                                                                                                                                         |
| younna-ai-master `a5c979e69`, `apps/ontario-compliance/web/package.json:13`                   | `compile-css` writes `./.storybook/dist/tailwind-compiled.css` with `pnpm exec tailwindcss`                                                                                                                        |
| younna-ai-master `a5c979e69`, `apps/ontario-compliance/web/package.json:14-16,19-24`          | `test`, `test:run`, `test:coverage`, `test:storybook`, `test:watch`, `test:fast`, `test:changed`, `test:gate`, `test:story` each start `pnpm compile-css && vitest ...` (the `unit` and `offline` projects do not) |
| younna-ai-master `a5c979e69`, `apps/ontario-compliance/web/package.json:74`                   | `@tailwindcss/cli` is a devDependency                                                                                                                                                                              |
| younna-ai-master `a5c979e69`, `apps/ontario-compliance/web/.storybook/preview.ts:1`           | the Storybook preview's first line imports `./dist/tailwind-compiled.css`                                                                                                                                          |
| younna-ai-master `a5c979e69`, `apps/ontario-compliance/web/.storybook/vitest.setup.ts:1`      | the Vitest setup's first line imports the same sheet                                                                                                                                                               |
| younna-ai-master `a5c979e69`, `apps/ontario-compliance/web/vitest.config.ts:34`               | `setupFiles: ['./.storybook/vitest.setup.ts']` wires the setup into the browser run                                                                                                                                |
| younna-ai-master `a5c979e69`, `.gitignore:201` and `apps/ontario-compliance/web/.gitignore:1` | `apps/ontario-compliance/web/.storybook/dist/` and `dist` are ignored                                                                                                                                              |

## Component usage (astryx-components-first-styles-from-typed-vars.md)

| File:line           | What it shows                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `AGENTS.md:97-100`  | the CLI workflow: `astryx build`, `astryx template`, `astryx component` before writing UI    |
| `AGENTS.md:103-106` | no layout `<div>`; frame first with an app shell; dense data as rows; status as dot or token |
| `AGENTS.md:107`     | custom styling: props first, no raw hex or px                                                |
| `AGENTS.md:109`     | the self-check before finishing                                                              |
| `AGENTS.md:112-117` | `search`, `component --list`, `docs <topic>`, `swizzle`, `upgrade --apply`                   |

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
