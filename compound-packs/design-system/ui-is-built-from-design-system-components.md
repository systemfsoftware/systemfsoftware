---
title: Every control and layout an Astryx app renders is an @astryxdesign/core component, never a hand-built lookalike, an ejected copy or another component library
applies_when:
  - building a screen, form, dialog, menu or layout in an app that renders @astryxdesign/core
  - adding a UI component library, or copying component source into the app
  - running astryx swizzle on a component
tags: [design-system, astryx, components, layout]
---

Render an element whose role an `@astryxdesign/core` component serves (button, link, text input, select, checkbox, dialog, drawer, menu, tabs, tooltip, toast, card, badge, stack or other layout) as that component. Never hand-build an element doing the same job, keep a copy of the component's source in the app (`astryx swizzle` output included), or use a component from another library such as shadcn/ui. A lookalike misses the package's fixes, keyboard and screen-reader behaviour, theme overrides and codemods. `npx @astryxdesign/cli component --list` lists what exists.

Set spacing between children, alignment and group padding through the props of Astryx layout components (`Stack`, `VStack`, `HStack`, `Layout`, `Card` padding), never a `div` or `span` given flex, gap or padding classes to do what those props do.

```tsx
// WRONG
<div className='flex flex-col gap-3 p-4'><button className='rounded-md bg-surface px-3' onClick={save}>Save</button></div>
// RIGHT
<VStack gap={3} padding={4}><Button label='Save' onClick={save} /></VStack>
```
