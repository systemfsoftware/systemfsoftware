---
title: Every root that renders Astryx imports its stylesheets in order and wraps the tree in Theme, LayerProvider and LinkProvider
applies_when:
  - setting up an app, a new entry point or a Storybook preview that depends on @astryxdesign/core
  - Astryx components render in a serif font, black text or native button chrome
  - moving, splitting or rewriting an app entry or a Storybook preview that renders @astryxdesign components
tags: [astryx, setup, css, theme, provider, storybook]
---

Astryx ships its component styles as pre-built CSS. Importing a component brings its markup, not its styles; without the stylesheets the components render unstyled. The Astryx CLI writes this warning into an agent's `AGENTS.md` ("without these, components render unstyled") and agents still skipped it.

1. **Stylesheets, in order, once per root.** The app's global stylesheet starts with:

   ```css
   @import "@astryxdesign/core/reset.css";
   @import "@astryxdesign/core/astryx.css";
   ```

   and the theme's CSS follows them: a base theme's `theme.css` (for example `@astryxdesign/theme-neutral/theme.css`) or the CSS the repo's theme build generates (pack: astryx, astryx-themes-are-defined-and-built-before-typecheck.md). The order is the cascade: `reset.css` is `@layer reset`, `astryx.css` is `@layer astryx-base`, theme CSS is `@layer astryx-theme`, so a theme imported first loses to the base styles. The app entry imports the global stylesheet, then the theme CSS.
2. **Providers at the root.** The root component wraps the app in `Theme` (with the theme object and the light, dark or system mode), `LinkProvider` (given the router's link component, so Astryx links route client-side) and `LayerProvider` (toasts, sheets and imperative modals). Upstream marks `LayerProvider` optional, with hooks falling back to a self-mounting viewport; it is mounted once at the root anyway, because toast placement and any `inset` for a bar over a viewport edge are declared on it once.
3. **The Storybook preview is a root.** `.storybook/preview.tsx` imports the same global stylesheet and theme CSS and wraps every story in the same `Theme`, `LinkProvider` and `LayerProvider`, with the story's theme global choosing the mode. A preview that skips them makes every story pass on an unstyled render.
4. **Fonts.** The theme names a font family; it does not load the font file. The app loads it (a package such as `@fontsource-variable/<family>` imported in the global stylesheet, or a link), or every viewer silently falls back to the next family in the stack.

```tsx
import { LayerProvider } from '@astryxdesign/core/Layer'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import { Link as RouterLink } from '@tanstack/react-router' // or the router the app uses
import { appTheme } from './theme/app-theme' // placeholder: the module the theme build generates

export function Root({ mode, children }: { mode: 'light' | 'dark' | 'system'; children: React.ReactNode }) {
  return (
    <Theme theme={appTheme} mode={mode}>
      <LinkProvider component={RouterLink}>
        <LayerProvider>{children}</LayerProvider>
      </LinkProvider>
    </Theme>
  )
}
```

The general form of this rule, for any design system, is (pack: ui-craft, a-design-system-renders-only-with-its-styles-loaded.md) when a repo enrolls that pack; this rule does not depend on it.

Gate: none yet. The fact it would read: in a real-browser story rendered through the preview, the computed `font-family` of an Astryx `Text` begins with the theme's body family and the computed `color` of its text equals `--color-text-primary` resolved on the themed root (browser defaults `serif` and `rgb(0, 0, 0)` fail); and from the emitted build, the stylesheet every built HTML document links contains the `astryx-base` layer.

Evidence: `evidence/reference-app.md` (setup rows), `evidence/upstream.md` (Quick Start).
