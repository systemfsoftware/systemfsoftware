---
marp: true
theme: ttsc
paginate: true
size: 16:9
title: "TypeScript Compiler Knowledge Graph"
description: "Give coding agents the exact symbol graph TypeScript already resolved, cutting repository-orientation tokens without returning source bodies."
author: "Jeongho Nam"
keywords: "ttsc, TypeScript, compiler graph, MCP, coding agents"
url: "https://ttsc.dev/slides/graph/"
image: "https://ttsc.dev/og-graph.png"
footer: "@ttsc/graph · ttsc.dev/docs/graph"
---

<!-- _class: lead graph -->
<!-- _paginate: false -->

<div class="eyebrow">@ttsc/graph</div>

# TypeScript Compiler Knowledge Graph

## Give your coding agent the index the compiler already drew

<p class="lede">Declarations, signatures, calls, types, decorators, tests, diagnostics, and source spans through one typed MCP tool.</p>

---

<!-- _class: lead graph -->

<span class="punch">Do not make the agent read the whole repository.</span>

<p class="lede">Most orientation starts as grep, file read, import chase, another grep, and another file read.</p>

---

# The repository crawl loop

<div class="flow">
  <span>Question</span><i>→</i><span>grep</span><i>→</i><span>Read</span><i>→</i><span>import</span><i>→</i><span>Read</span>
</div>

- Each hop replays context.
- Text matches do not resolve aliases, re-exports, or types.
- Broad questions grow with repository size.

---

# The compiler already knows the graph

<div class="cards">
<div class="card"><b>Program</b>Source files, modules, compiler options, diagnostics</div>
<div class="card"><b>TypeChecker</b>Symbols, types, signatures, declarations</div>
<div class="card accent"><b>@ttsc/graph</b>Resolved nodes, edges, tests, and spans</div>
</div>

<br />

`@ttsc/graph` reads the resident TypeScript-Go compiler session.

---

# Compiler-exact relationships

- `tsconfig` path aliases land on the real declaration.
- Barrel re-exports preserve symbol identity.
- pnpm workspace packages and project references resolve normally.
- Symlinks and module-resolution rules are already settled.
- Diagnostics and graph facts describe the same `Program`.

> A syntax index can infer these edges. The compiler has already proved them.

---

# It returns an index, never source bodies

```text
CheckoutService.place
  signature  place(input: IOrderInput): Promise<IOrder>
  declared   src/checkout/CheckoutService.ts:41-88
  calls      Inventory.reserve, Payment.authorize
  testedBy   test_checkout_place
```

- Names, signatures, edges, decorators, tests, and source spans
- No implementation body in the MCP response
- Read the smallest span only when body text is actually needed

---

# Why “index only” matters

<div class="cols">
<div>

## Source bodies

- Output grows with every selected file
- Broad queries spill large context
- The agent must interpret raw implementation again

</div>
<div>

## Graph index

- Output grows with the answer
- Relationships arrive resolved
- A span anchors any necessary follow-up

</div>
</div>

---

<!-- _class: divider -->

# One tool, with an escape hatch

## Guide the decision without replacing the agent's workflow

---

# One MCP surface

```ts
inspect_typescript_graph({
  question,
  draft: { type, reason },
  review,
  request,
});
```

The request is a discriminated union. Choosing its `type` chooses the operation.

---

# The schema carries the reasoning path

<div class="flow">
  <span>Question</span><i>→</i><span>Draft</span><i>→</i><span>Review</span><i>→</i><span>Request</span>
</div>

- `draft` names the smallest operation that looks sufficient.
- `review` can correct an over-broad or off-graph plan.
- `request` commits exactly one typed operation.

Free prose can skip a step. A required schema field cannot.

---

# Seven request types

| Type          | Use it for                         |
| ------------- | ---------------------------------- |
| `tour`        | Broad, one-call architecture tour  |
| `entrypoints` | Where to start reading             |
| `lookup`      | Find a symbol by name              |
| `trace`       | Follow calls, data flow, or impact |
| `details`     | Signature, members, and neighbors  |
| `overview`    | Repository-level structure         |
| `escape`      | The evidence is outside the graph  |

---

# Escape is a first-class success

Use the graph when the answer depends on TypeScript symbols, calls, or types.

Use `escape` when the answer depends on:

- exact implementation text;
- configuration or documentation;
- runtime state or external systems;
- a non-TypeScript project.

---

# Fresh on every operation

- No separate `init` command
- No repository-local index to remember or commit
- Unchanged calls reuse warm in-memory indexes
- Safe edits reuse the incremental compiler `Program`
- Config, roots, deletion, or resolution changes trigger a reload
- Refresh failure returns an error, never a stale graph

---

# The same graph is visible in 3D

![3D TypeScript code graph](/graph/vscode.png)

<p class="note center">Every node is a declaration. Every edge is a compiler-resolved relationship.</p>

---

<!-- _class: divider -->

# Does the index reduce agent cost?

## Empty-MCP baseline versus four graph tools

---

# Benchmark design

- Eight TypeScript repositories, from 51k to 3.1M lines
- Common onboarding prompt and repository-specific prompts
- Empty-MCP baseline plus `@ttsc/graph`, codegraph, codebase-memory, and serena
- Codex and Claude Code model lanes at high reasoning effort
- One published run per cell; repository breadth is the sample

<p class="note">This is one person's bounded benchmark. It is not a universal performance guarantee.</p>

---

# The headline

<div class="cards">
<div class="card accent"><span class="metric">~10×</span>fewer tokens<br /><span class="note">conservative median</span></div>
<div class="card"><span class="metric">8</span>repositories<br /><span class="note">51k to 3.1M lines</span></div>
<div class="card"><span class="metric">1</span>typed tool<br /><span class="note">index, never bodies</span></div>
</div>

<br />

Answer quality was manually inspected; free-text matching was not used as an oracle.

---

# Cost stays flat as repositories grow

```text
small TypeScript project  ─┐
medium monorepo           ├─ answer-sized graph response
3M-line VS Code           ┘
```

- Baseline and comparator costs swing with repository size.
- `@ttsc/graph` stays near the cost of the requested index.
- Some comparator cells cost more than running with no MCP.

---

# Cold time matters too

On the three-million-line VS Code fixture:

<div class="cards">
<div class="card accent"><span class="metric">&lt;30s</span>`@ttsc/graph` compiler index</div>
<div class="card warm"><span class="metric">~12m</span>codegraph index build</div>
<div class="card warm"><span class="metric">~5m</span>serena project indexing</div>
</div>

<br />

The published chart adds index readiness and LLM answer time in the order a developer waits.

---

# The trade

| Tool shape | Strength | Cost |
| --- | --- | --- |
| `@ttsc/graph` | compiler-exact TS graph, one tool | TypeScript only |
| codegraph | one default tool, many languages | text-inferred edges, source bodies |
| codebase-memory | broad multi-language graph | many tools and explicit indexing |
| serena | LSP-resolved symbols, editing suite | broad tool surface and setup |

---

# Add it in four lines

```bash
npm install -D ttsc @ttsc/graph typescript
```

```json
{
  "mcpServers": {
    "ttsc-graph": {
      "command": "npx",
      "args": ["-y", "@ttsc/graph"]
    }
  }
}
```

---

# Explore your graph in the browser

```bash
npx @ttsc/graph view
```

- Opens the project graph in a 3D viewer.
- Color and filter by declaration or edge kind.
- Inspect incoming and outgoing relationships.
- Export a snapshot for sharing.

---

# Boundaries are deliberate

- TypeScript only: compiler depth is tied to one language.
- An index is not the implementation body.
- Graph evidence cannot answer config, prose, runtime, or external-state questions.
- The benchmark result can be lower or negative on a different workload.

The tool steps aside when its evidence is not the right evidence.

---

<!-- _class: lead graph -->

# TypeScript Compiler Knowledge Graph

- Trust compiler-resolved relationships.
- Return the index, never the source bodies.
- Shape one tool so the agent can choose well.

<span class="punch">Exact → trusted → done.</span>

---

<!-- _class: lead graph -->
<!-- _paginate: false -->

# Q & A

- [ttsc.dev/docs/graph](https://ttsc.dev/docs/graph)
- [ttsc.dev/docs/benchmark/graph](https://ttsc.dev/docs/benchmark/graph)
- [github.com/samchon/ttsc](https://github.com/samchon/ttsc)
