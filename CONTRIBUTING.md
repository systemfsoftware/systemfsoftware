# Contributing

## Workflow

Format and check before committing:

```bash
deno task fmt
deno task check
```

## Conventions

- Hook scripts under `scripts/` are standalone CLIs (no exports).
- Shared code lives in `scripts/lib/`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
