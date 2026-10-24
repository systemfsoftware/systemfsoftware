---
title: Each story's registry and fake are built before render from the story's parameters and disposed after it
applies_when:
  - writing the preview's loader, decorator or beforeEach
  - a story needs a fake to answer differently or fail
tags: [storybook, registry, fakes, lifecycle]
---

Before render, the preview's loader builds each story's registry with Atom.Registry.make and scheduleTask: AtomReact.scheduleTask, seeded with a fake built from that story's parameters.

The preview's decorator only provides the loaded registry. No decorator, provider or component creates a registry during render (useState, useRef, a key remount).

The preview's beforeEach returns a cleanup that disposes the loaded registry with Atom.Registry.dispose. No beforeEach, afterEach or cleanup resets or changes fake state.

A fake allocates its state while its Layer is built and never closes over a module-scope variable.

A story sets I/O responses and faults only through its parameters. A play function or step never changes a fake mid-story. A peer that changes its answer is configured up front as a sequence of responses.

Gate: judge
