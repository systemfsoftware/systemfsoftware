# @systemfsoftware/oxlint-plugin-cell-imports

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-cell-imports?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-cell-imports)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-cell-imports?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams: one table, one rule: every cell-to-cell import edge in the taxonomy.

## The Problem

The cell taxonomy describes which domain cells may depend on which other cells. Without an executable import boundary, an accidental edge can compile and pass tests while quietly coupling layers that are meant to remain independent.

This package is the home for one table, one rule: every cell-to-cell import edge in the taxonomy.

## Quick Start

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-cell-imports
```

```ts
// oxlint.config.ts
import cellImports from '@systemfsoftware/oxlint-plugin-cell-imports'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-cell-imports'],
  rules: { ...cellImports.configs.recommended.rules },
})
```

## Rules

The rule set is intentionally empty while the cell-imports rule is authored separately.

## Requirements

`effect` and TypeScript 5.0+ as peers.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/cell-imports/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
