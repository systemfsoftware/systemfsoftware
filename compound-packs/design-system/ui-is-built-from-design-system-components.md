---
title: Every control and layout an Astryx app renders is an @astryxdesign/core component, never a hand-built lookalike, an ejected copy or another component library
applies_when:
  - building a screen, form, dialog, menu or layout in an app that renders @astryxdesign/core
  - adding a UI component library, or copying component source into the app
  - running astryx swizzle on a component
tags: [design-system, astryx, components, layout]
---

An element whose role is one an @astryxdesign/core component serves (button, link, text input, select, checkbox, dialog, drawer, menu, tabs, tooltip, toast, card, badge, stack or other layout) is that component, imported from @astryxdesign/core. It is never a hand-built element doing the same job, a copy of the component's source kept in the app (astryx swizzle output included), or a component from another library such as shadcn/ui, installed or copied in.

Spacing between children, alignment and padding of a group are set through the props of Astryx layout components (Stack, VStack, HStack, Layout, Card padding); never a div or span given flex, gap or padding classes to do what those props do.

Decision test: for each element the diff adds, name its role. If `npx @astryxdesign/cli component --list` lists a component for that role and the element is not that component imported from @astryxdesign/core, the diff fails. A div or span whose classes are only flex, gap, items-_, justify-_ or p-* around children fails.

Defect it prevents: a lookalike or ejected copy does not receive the package's fixes, keyboard and screen-reader behaviour, theme overrides or upgrade codemods, so it drifts from every other instance of the same control.

```tsx
// WRONG
<div className='flex flex-col gap-3 p-4'>
  <button className='rounded-md bg-surface px-3' onClick={save}>Save</button>
</div>
```

```tsx
// RIGHT
<VStack gap={3} padding={4}>
  <Button label='Save' onClick={save} />
</VStack>
```

Source: @astryxdesign/core README (Component Docs: look a component up with `astryx component`; Astryx CLI: `swizzle` ejects component source for customization).

Gate: judge
