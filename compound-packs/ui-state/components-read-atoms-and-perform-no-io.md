---
title: Component and hook code reads data through runtime atoms, performs no I/O, and never copies a read value into React state
applies_when:
  - writing or reviewing a React component or hook in an effect-atom application
  - a component needs server data, persisted state or a browser storage value
tags: [ui-state, atom, io, react]
---

React component and hook modules in an application (.tsx and .ts alike) never call XMLHttpRequest, WebSocket, EventSource, localStorage, sessionStorage, indexedDB or document.cookie, and a .ts hook module never calls fetch. I/O is an Effect service in the app's Layer, read through a runtime atom. fetch in a .tsx module and imports of React server-state libraries are refused by `@systemfsoftware/oxlint-config-recommended` (no-restricted-globals, no-restricted-properties, no-restricted-imports), whose messages name this rule.

A value read from an atom, an Effect service or a server is never copied into useState, useReducer or useRef. The component reads it where it uses it, with useAtomValue or useAtomSuspense.

Client-persisted state is an Atom.kvs atom on the app's runtime, with KeyValueStore provided in the app's Layer.

The review judge decides from the diff whether a piece of React state holds such a copy. An uncertain case escalates.

The effect-atom bindings' own implementation (packages/atom/effect-atom, packages/atom/effect-atom-react) is the runtime edge and is not governed by this rule.

```
WRONG
const [pending, setPending] = useState(0)
useEffect(() => {
  fetch(`/demand/${sku}`).then((r) => r.json()).then((body) => setPending(body.pending))
}, [sku])
```

```
RIGHT
const pending = useAtomSuspense(demandAtom(sku))
```

Gate: judge
