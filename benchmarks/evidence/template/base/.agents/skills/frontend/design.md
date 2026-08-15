# Design

Design serves the product's work. Most subjects here are operational interfaces, so prefer clear hierarchy, dense readable information, restrained motion, and predictable controls over landing-page spectacle.

## Set The Dials

Record one coherent direction:

```ts
export const DESIGN = {
  variance: 4, // 1 symmetric, 10 deliberately asymmetric
  motion: 2,   // 1 static, 10 cinematic
  density: 6,  // 1 airy, 10 information-dense
} as const;
```

Choose values from the product and apply them consistently. Customize radius, palette, shadow, and type scale instead of shipping a component library's default theme. Use one component system.

## Avoid Generated-Interface Tells

- no neon glow, gradient headline, fake product screenshot, custom cursor, or pure black;
- no repeated row of three identical feature cards;
- no decorative grid, rotated text, numbered eyebrow, scroll cue, version badge, or meaningless status dot;
- no generic brand, placeholder person, suspiciously round metric, or marketing filler;
- no oversized heading used in place of real hierarchy;
- no raw em dash or en dash in user-facing copy; and
- no hand-drawn SVG when an established icon set already provides the symbol.

Remove decoration that has no product meaning.

## Accessibility

Use semantic controls:

```tsx
<button
  type="button"
  onClick={onSelect}
  className="focus-visible:ring-2"
>
  Select
</button>
```

Never replace a button with a clickable `div`. Provide:

- visible keyboard focus;
- labels associated with every input;
- sufficient contrast at the actual size and weight;
- phone-sized hit targets;
- keyboard access to every interaction;
- meaningful loading, error, and status announcements; and
- reduced-motion behavior.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

If dark mode exists, design and verify it independently. Forward surfaces become lighter than the background, borders provide separation, and accents normally need less saturation.

## Preflight

Before completion:

- the interface matches its recorded dials;
- every screen was inspected at mobile, tablet, and desktop widths;
- required controls, states, and copy are visible and usable;
- focus, labels, contrast, hit targets, and reduced motion were checked;
- fixture content is realistic; and
- no decorative pattern above survived without a product reason.
