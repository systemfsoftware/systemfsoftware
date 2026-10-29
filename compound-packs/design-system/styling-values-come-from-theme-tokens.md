---
title: Every color, surface, border, radius, spacing and type value in an Astryx app is a design-system prop or a Tailwind utility the Astryx token bridge registers
applies_when:
  - styling a screen or component in an app that renders @astryxdesign/core with Tailwind
  - adding a className, a style prop or a CSS declaration that sets a color, size or spacing
  - needing a design-system token no Tailwind utility exposes
tags: [design-system, astryx, tailwind, tokens]
---

A visual value no component prop expresses is a Tailwind utility registered by @astryxdesign/core/tailwind-theme.css (for example bg-surface, text-secondary, border-border, rounded-lg, shadow-md, bg-blue-subtle, p-4). It is never a hex, rgb(), hsl() or oklch() color, a px or rem literal for spacing, radius or font size, a Tailwind default palette color (bg-blue-500, text-slate-700), or an arbitrary-value bracket ([var(--...)], [#...], [12px]).

A design-system token the bridge does not expose gets a variable in the global stylesheet's @theme inline block whose value is that token's var(), and is then used as a utility.

Decision test: search every className, style prop and CSS declaration the diff adds for a color function or hex literal, a numeric px or rem length, a Tailwind default palette name with a numeric shade, or a square-bracket arbitrary value. Any hit fails.

Defect it prevents: a literal or default-palette value ignores the brand and the color mode, so it stays the same when the theme or dark mode changes; a bracketed var() is unchecked, so a misspelled token name silently renders nothing.

```tsx
// WRONG
<Text className='text-[#5b5b66] mt-[12px]'>Last saved 2 minutes ago</Text>
```

```tsx
// RIGHT
<Text color='secondary' className='mt-3'>Last saved 2 minutes ago</Text>
```

```css
/* RIGHT: a token the bridge lacks becomes a utility */
@theme inline {
  --color-focus-ring: var(--color-accent);
}
```

Source: @astryxdesign/core README, "Next.js + Tailwind" (tailwind-theme.css maps system tokens to Tailwind utilities via @theme reference inline; table of mappings; spacing based on var(--spacing-1)); Tailwind CSS docs, Theme variables (@theme inline).

Gate: judge
